"""Demo fleet registry, role tokens and guardian trips.

Nothing here decides risk: every vehicle verdict is read from CabinService,
which owns the deterministic rules. Tokens and trips live in process memory,
like camera sessions; trip events are also written to the SQLite audit log.
"""

import hashlib
import json
import os
import secrets
import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4

ROLES = {"admin", "operator", "owner", "caregiver", "guardian", "device"}
TRIP_EVENTS = {"entered_vehicle": "INSIDE", "exited_vehicle": "EXITED"}
ONLINE_WINDOW_S = 10
TOKEN_TTL = timedelta(hours=12)
OCCUPANT_CLASSES = ("person", "dog", "cat")

# Demo vehicles are fed by scripts/simulate_vehicle.py (or MQTT); nothing here
# implies a real vehicle connection.
DEFAULT_VEHICLES = [
    {"vehicle_id": "VF8-DEMO-01", "name": "Family SUV", "plate": "DEMO-801", "model": "Demo SUV", "owner": "demo-owner"},
    {"vehicle_id": "VF9-DEMO-02", "name": "School-run MPV", "plate": "DEMO-902", "model": "Demo MPV", "owner": "demo-owner"},
    {"vehicle_id": "VF5-DEMO-03", "name": "City hatchback", "plate": "DEMO-503", "model": "Demo hatchback", "owner": "fleet-owner"},
    {"vehicle_id": "VF3-DEMO-04", "name": "Spare sedan", "plate": "DEMO-304", "model": "Demo sedan", "owner": "fleet-owner"},
]


class AccessDeniedError(PermissionError):
    pass


@dataclass
class Grant:
    role: str
    subject: str
    expires_at: datetime | None
    trip_id: str | None = None
    source: str | None = None
    tenant_id: str | None = None
    vehicle_id: str | None = None  # set for per-device credentials
    session_id: str | None = None


@dataclass
class Trip:
    trip_id: str
    vehicle_id: str
    label: str
    created_at: str
    created_by: str
    events: list = field(default_factory=list)
    keys: dict = field(default_factory=dict)


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def load_vehicles() -> list[dict]:
    path = os.environ.get("CABINSENTINEL_FLEET_FILE")
    if not path:
        return [dict(v) for v in DEFAULT_VEHICLES]
    vehicles = json.loads(Path(path).read_text())
    if not isinstance(vehicles, list) or not vehicles:
        raise ValueError("CABINSENTINEL_FLEET_FILE must be a non-empty JSON list")
    for vehicle in vehicles:
        if not isinstance(vehicle, dict) or not {"vehicle_id", "name", "owner"} <= vehicle.keys():
            raise ValueError("Each fleet vehicle needs vehicle_id, name and owner")
        if vehicle["vehicle_id"].startswith("DEMO_"):
            raise ValueError("DEMO_ ids are reserved for per-session demo vehicles")
    return vehicles


class Fleet:
    def __init__(self, service, *, vehicles=None, clock=None, device_token=None, device_source="SIMULATED"):
        self.service = service
        self.clock = clock or service.clock
        self.vehicles = {v["vehicle_id"]: dict(v) for v in (vehicles if vehicles is not None else load_vehicles())}
        self._grants: dict[str, Grant] = {}
        self._trips: dict[str, Trip] = {}
        self._data_source: dict[str, str] = {}
        self._lock = threading.RLock()
        self.store = None  # PlatformStore attaches itself: persistent accounts, caregivers, devices
        self.device_ingest_enabled = bool(device_token)
        if device_token:
            self._grants[_digest(device_token)] = Grant("device", "device", None, source=device_source)

    # -- access -------------------------------------------------------------
    def issue(self, role: str, subject: str, *, trip_id: str | None = None) -> str:
        if role not in ROLES - {"device"}:
            raise ValueError("Unsupported role")
        token = secrets.token_urlsafe(32)
        with self._lock:
            self._grants[_digest(token)] = Grant(role, subject, self.clock() + TOKEN_TTL, trip_id=trip_id)
        return token

    def resolve(self, token: str | None) -> Grant:
        if not token:
            raise AccessDeniedError("Access token required")
        with self._lock:
            grant = self._grants.get(_digest(token))
        if grant is None and self.store is not None:
            grant = self.store.resolve_token(token)
        with self._lock:
            if grant is None or (grant.expires_at is not None and self.clock() >= grant.expires_at):
                raise AccessDeniedError("Invalid or expired access token")
            return grant

    def can_view(self, grant: Grant, vehicle_id: str) -> bool:
        vehicle = self.vehicles.get(vehicle_id)
        if vehicle is None:
            return False
        if grant.role in {"admin", "operator"}:
            return grant.tenant_id is None or vehicle.get("tenant_id") == grant.tenant_id
        if grant.role == "owner":
            return vehicle["owner"] == grant.subject
        if grant.role == "caregiver" and self.store is not None:
            return self.store.caregiver_can_view(grant.subject, vehicle_id)
        return False

    def require_view(self, grant: Grant, vehicle_id: str) -> dict:
        if not self.can_view(grant, vehicle_id):
            # Same answer for unknown and forbidden vehicles.
            raise AccessDeniedError("Vehicle not available for this account")
        return self.vehicles[vehicle_id]

    def require_device(self, grant: Grant, vehicle_id: str) -> None:
        if grant.role != "device" or vehicle_id not in self.vehicles or (grant.vehicle_id and grant.vehicle_id != vehicle_id):
            raise AccessDeniedError("Device credentials required for a registered vehicle")

    def note_source(self, vehicle_id: str, source: str | None) -> None:
        with self._lock:
            self._data_source[vehicle_id] = source or "DEVICE"

    # -- reads --------------------------------------------------------------
    def visible(self, grant: Grant) -> list[str]:
        return [vid for vid in self.vehicles if self.can_view(grant, vid)]

    def summary(self, vehicle_id: str) -> dict:
        vehicle = self.vehicles[vehicle_id]
        state = self.service.get_state_with_freshness(vehicle_id)
        base = {
            "vehicle_id": vehicle_id, "vehicle_name": vehicle["name"],
            "plate": vehicle.get("plate"), "model": vehicle.get("model"),
            "data_source": self._data_source.get(vehicle_id, "NONE"),
        }
        if state is None:
            return {**base, "online": False, "last_seen": None, "risk_level": None, "decision_current": False,
                    "rule_id": None, "occupancy": {"state": "UNKNOWN", "counts": {}}, "temperature_c": None,
                    "doors_locked": None, "alert_count": 0, "active_incident": None, "revision": 0}
        last_seen = _last_seen(state)
        incident = state.get("incident")
        return {
            **base,
            "online": last_seen is not None and (self.clock() - last_seen).total_seconds() <= ONLINE_WINDOW_S,
            "last_seen": last_seen.isoformat() if last_seen else None,
            "risk_level": state["risk_level"], "decision_current": state["decision_current"],
            "rule_id": state["rule_id"], "revision": state["revision"],
            "occupancy": {"state": state.get("occupancy_state"), "counts": _occupant_counts(state)},
            "temperature_c": state.get("temperature"), "doors_locked": state.get("doors_locked"),
            "alert_count": len(self.service.events(vehicle_id, event_type="alert", limit=500)),
            "active_incident": incident["incident_id"] if incident and incident.get("status") == "OPEN" else None,
        }

    def normalized_state(self, vehicle_id: str) -> dict:
        """Canonical vehicle view consumed by the frontend (never MQTT directly)."""
        summary = self.summary(vehicle_id)
        state = self.service.get_state_with_freshness(vehicle_id)
        if state is None:
            return {**summary, "timestamp": None, "as_of": self.clock().isoformat(), "sensors": None, "vision": None,
                    "risk": None, "explanation": "No sensor or camera data received for this vehicle yet.",
                    "incident": None, "alert": None, "unlock_request": None, "actions": [], "action_ledger": [],
                    "data_quality": {"status": "UNKNOWN", "issues": ["SENSOR_MISSING", "VISION_MISSING"]}}
        sensor = state.get("sensor_snapshot") or {}
        freshness = state["freshness"]
        engine = state.get("engine_status")
        return {
            **summary,
            "timestamp": state["evaluated_at"], "as_of": freshness["as_of"],
            "sensors": None if not sensor else {
                "temperature_c": sensor.get("temperature"),
                "doors_locked": sensor.get("doors_locked"),
                "door": None if sensor.get("doors_locked") is None else "locked" if sensor["doors_locked"] else "unlocked",
                "radar_presence": sensor.get("radar_presence"),
                "ignition": {"ON": "on", "OFF": "off"}.get(engine, "unknown"),
                "hvac": sensor.get("hvac_status"), "window": sensor.get("window_status"),
                "sequence": sensor.get("sequence"),
                **freshness["sensor"],
            },
            "vision": {
                "camera_status": state.get("camera_status"),
                "detections": [
                    {"class": o["class_name"], "confidence": o["confidence"]}
                    for o in state.get("detected_objects") or []
                ],
                **freshness["vision"],
            },
            "risk": {key: state.get(key) for key in (
                "risk_level", "previous_risk_level", "rule_id", "reason", "occupancy_state",
                "occupancy_reason_code", "revision", "decision_current", "ruleset_version", "evidence_conflicts",
                "reasoning_latency_ms",
            )},
            "explanation": explain(state),
            "incident": state.get("incident"), "alert": state.get("alert"),
            "unlock_request": state.get("unlock_request"),
            "actions": state.get("action_results", []), "action_ledger": state.get("action_ledger", []),
            "data_quality": state.get("data_quality"),
        }

    # -- guardian trips -----------------------------------------------------
    def create_trip(self, grant: Grant, vehicle_id: str, label: str | None) -> dict:
        self.require_view(grant, vehicle_id)
        trip = Trip(uuid4().hex, vehicle_id, (label or "Trip").strip()[:80] or "Trip",
                    self.clock().isoformat(), grant.subject)
        with self._lock:
            self._trips[trip.trip_id] = trip
        token = self.issue("guardian", f"guardian:{trip.trip_id}", trip_id=trip.trip_id)
        self.service.record_event(vehicle_id, "trip_created", {
            "trip_id": trip.trip_id, "label": trip.label, "created_by": grant.subject, "created_at": trip.created_at,
        })
        return {"trip_id": trip.trip_id, "vehicle_id": vehicle_id, "label": trip.label,
                "created_at": trip.created_at, "guardian_token": token}

    def _trip(self, trip_id: str) -> Trip:
        trip = self._trips.get(trip_id)
        if trip is None:
            raise AccessDeniedError("Trip not available for this account")
        return trip

    def record_trip_event(self, grant: Grant, trip_id: str, event: str, idempotency_key: str | None) -> dict:
        if event not in TRIP_EVENTS:
            raise ValueError("event must be entered_vehicle or exited_vehicle")
        with self._lock:
            trip = self._trip(trip_id)
            if not (grant.role == "device" or self.can_view(grant, trip.vehicle_id)):
                raise AccessDeniedError("Trip not available for this account")
            if idempotency_key and idempotency_key in trip.keys:
                return {**trip.keys[idempotency_key], "result": "DUPLICATE"}
            record = {
                "event_id": uuid4().hex, "trip_id": trip_id, "vehicle_id": trip.vehicle_id, "event": event,
                "recorded_at": self.clock().isoformat(),
                "source": "DEVICE" if grant.role == "device" else "MANUAL_CHECKIN",
                "recorded_by": grant.subject,
            }
            trip.events.append(record)
            if idempotency_key:
                trip.keys[idempotency_key] = record
        self.service.record_event(trip.vehicle_id, "trip_event", record)
        return {**record, "result": "ACCEPTED"}

    def child_status(self, grant: Grant, trip_id: str) -> dict:
        with self._lock:
            trip = self._trip(trip_id)
            allowed = (grant.role == "guardian" and grant.trip_id == trip_id) or self.can_view(grant, trip.vehicle_id)
            if not allowed:
                raise AccessDeniedError("Trip not available for this account")
            last = trip.events[-1] if trip.events else None
        state = self.service.get_state_with_freshness(trip.vehicle_id)
        return {
            "trip_id": trip_id, "vehicle_id": trip.vehicle_id,
            "vehicle_name": self.vehicles[trip.vehicle_id]["name"], "label": trip.label,
            # Status comes only from recorded entry/exit events, never from camera identity.
            "child_status": TRIP_EVENTS[last["event"]] if last else "UNKNOWN",
            "last_event": last["event"] if last else None,
            "timestamp": last["recorded_at"] if last else None,
            "source": last["source"] if last else None,
            "confidence": None, "identity_verified": False,
            "event_count": len(trip.events),
            "vehicle_safety": None if state is None else {
                "risk_level": state["risk_level"], "decision_current": state["decision_current"],
                "occupancy_state": state.get("occupancy_state"), "evaluated_at": state["evaluated_at"],
            },
        }


def _last_seen(state: dict) -> datetime | None:
    seen = []
    for source in ("sensor", "vision"):
        observed = state["freshness"][source].get("observed_at")
        if observed:
            try:
                seen.append(datetime.fromisoformat(observed))
            except ValueError:
                pass
    return max(seen) if seen else None


def _occupant_counts(state: dict) -> dict:
    counts = {}
    for obj in state.get("detected_objects") or []:
        name = obj["class_name"]
        if name in OCCUPANT_CLASSES:
            counts[name] = counts.get(name, 0) + 1
    return counts


def explain(state: dict) -> str:
    """Deterministic plain-language summary of the committed decision inputs.

    This only restates facts; the rule engine already decided the risk.
    """
    if not state.get("decision_current"):
        issues = ", ".join((state.get("data_quality") or {}).get("issues") or []) or "no current data"
        return f"Current decision unavailable ({issues}). Last verdict {state['risk_level']} is historical."
    parts = []
    engine = state.get("engine_status")
    if engine in {"ON", "OFF"}:
        parts.append(f"vehicle {'running' if engine == 'ON' else 'off'}")
    if state.get("temperature") is not None:
        parts.append(f"cabin {state['temperature']:.1f}°C")
    if state.get("doors_locked") is not None:
        parts.append("doors locked" if state["doors_locked"] else "doors unlocked")
    counts = _occupant_counts(state)
    parts.append(", ".join(f"{n} {k}" for k, n in counts.items()) + " detected" if counts else "no occupant detected by camera")
    if state.get("radar_presence"):
        parts.append("radar reports presence")
    summary = "; ".join(parts)
    return f"{summary[:1].upper()}{summary[1:]}. Rule {state['rule_id']}: {state['reason']}."
