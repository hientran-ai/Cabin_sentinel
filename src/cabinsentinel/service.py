"""Per-vehicle fusion, durable decisions, and mock action results."""

import hashlib
import hmac
import json
import secrets
import sqlite3
import threading
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from src.cabinsentinel.actions import MockActions
from src.cabinsentinel.alerts import data_quality, evolve_incident
from src.cabinsentinel.graph import safety_graph
from src.cabinsentinel.models import SensorPayload, VisionPayload
from src.cabinsentinel.rules import confidence_regression, has_baby_seat_evidence


class CabinService:
    def __init__(self, db_path: str | Path, *, clock=None, actions=None):
        self.clock = clock or (lambda: datetime.now(UTC))
        self.actions = actions or MockActions()
        self._lock = threading.RLock()
        path = str(db_path)
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        with self._db:
            self._db.execute(
                """CREATE TABLE IF NOT EXISTS vehicles (
                    vehicle_id TEXT PRIMARY KEY,
                    sensor_json TEXT,
                    vision_json TEXT,
                    state_json TEXT,
                    sensor_seq INTEGER,
                    sensor_time TEXT,
                    vision_frame TEXT,
                    vision_time TEXT
                )"""
            )
            self._db.execute(
                """CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    vehicle_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                )"""
            )
            self._db.execute("CREATE INDEX IF NOT EXISTS events_vehicle ON events(vehicle_id, id)")
            self._db.execute("""CREATE TABLE IF NOT EXISTS action_ledger (
                action_key TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, incident_id TEXT,
                revision INTEGER NOT NULL, tool TEXT NOT NULL,
                status TEXT NOT NULL, outcome TEXT NOT NULL, result_json TEXT
            )""")
            self._db.execute("CREATE INDEX IF NOT EXISTS ledger_vehicle ON action_ledger(vehicle_id, revision)")
            self._db.execute("""CREATE TABLE IF NOT EXISTS demo_sessions (
                session_id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL UNIQUE,
                token_hash TEXT NOT NULL, created_at TEXT NOT NULL
            )""")

    def ingest_sensor(self, payload: SensorPayload) -> dict:
        return self._ingest(payload.vehicle_id, sensor=payload)

    def database_ready(self) -> bool:
        """Check that the SQLite connection can serve reads without changing state."""
        with self._lock:
            try:
                return self._db.execute("SELECT 1").fetchone()[0] == 1
            except sqlite3.Error:
                return False

    def ingest_vision(self, payload: VisionPayload) -> dict:
        return self._ingest(payload.vehicle_id, vision=payload)

    def create_demo_session(self) -> tuple[str, str]:
        session_id = uuid4().hex
        token = secrets.token_urlsafe(32)
        with self._lock, self._db:
            self._db.execute("INSERT INTO demo_sessions VALUES (?,?,?,?)", (
                session_id, f"DEMO_{session_id}", hashlib.sha256(token.encode()).hexdigest(), self.clock().isoformat(),
            ))
        return session_id, token

    def authorize_demo_session(self, session_id: str, token: str) -> str:
        with self._lock:
            row = self._db.execute("SELECT vehicle_id, token_hash FROM demo_sessions WHERE session_id=?", (session_id,)).fetchone()
            digest = hashlib.sha256(token.encode()).hexdigest()
            if row is None or not hmac.compare_digest(row["token_hash"], digest):
                raise PermissionError("Invalid demo session credentials")
            return row["vehicle_id"]

    def ingest_demo(self, sensor_values: dict, vision: VisionPayload) -> dict:
        return self._ingest(vision.vehicle_id, vision=vision, simulated_sensor=sensor_values)

    def tick(self, vehicle_id: str) -> dict | None:
        """Reassess freshness when sources stop publishing."""
        return self._ingest(vehicle_id, timer=True)

    def tick_all(self) -> None:
        with self._lock:
            vehicle_ids = [
                row["vehicle_id"] for row in self._db.execute("SELECT vehicle_id FROM vehicles")
            ]
        for vehicle_id in vehicle_ids:
            self.tick(vehicle_id)

    def _ingest(
        self, vehicle_id: str, *, sensor: SensorPayload | None = None,
        vision: VisionPayload | None = None, timer: bool = False, simulated_sensor: dict | None = None,
    ) -> dict | None:
        # Acquire SQLite's writer reservation before reading the prior revision.
        # RLock alone only serializes callers sharing this service instance.
        with self._lock, self._db:
            self._db.execute("BEGIN IMMEDIATE")
            row = self._db.execute(
                "SELECT * FROM vehicles WHERE vehicle_id = ?", (vehicle_id,)
            ).fetchone()
            if timer and row is None:
                return None
            old_state = json.loads(row["state_json"]) if row and row["state_json"] else None
            now = self.clock()
            if simulated_sensor is not None:
                prior_sensor = json.loads(row["sensor_json"]) if row and row["sensor_json"] else {}
                lock = {}
                if simulated_sensor["doors_locked"]:
                    lock = {
                        "locked_at": prior_sensor.get("locked_at") if prior_sensor.get("doors_locked") and prior_sensor.get("locked_at") else now,
                        "lock_event_id": prior_sensor.get("lock_event_id") if prior_sensor.get("doors_locked") and prior_sensor.get("lock_event_id") else uuid4().hex,
                        "lock_event_source": "SIMULATED",
                    }
                sensor = SensorPayload(
                    vehicle_id=vehicle_id, timestamp=now,
                    sequence=(row["sensor_seq"] or 0) + 1 if row else 1,
                    radar_presence=False, **simulated_sensor, **lock,
                )
            incoming_time = sensor.timestamp if sensor is not None else vision.timestamp if vision is not None else None
            if incoming_time is not None and (incoming_time - now).total_seconds() > 2:
                raise ValueError("source timestamp is too far in the future")
            if vision is not None and (vision.timestamp - now).total_seconds() > 2:
                raise ValueError("source timestamp is too far in the future")
            if vision is not None and any(
                (seat.observed_at - now).total_seconds() > 2
                for seat in vision.seat_evidence
            ):
                raise ValueError("seat evidence timestamp is too far in the future")

            if sensor is not None and row is not None:
                prior_time = row["sensor_time"]
                if (
                    row["sensor_seq"] is not None and sensor.sequence <= row["sensor_seq"]
                ) or (prior_time and sensor.timestamp <= datetime.fromisoformat(prior_time)):
                    return old_state
            if vision is not None and row is not None:
                prior_time = row["vision_time"]
                if vision.frame_id == row["vision_frame"] or (
                    prior_time and vision.timestamp <= datetime.fromisoformat(prior_time)
                ):
                    return old_state

            sensor_data = (
                sensor.model_dump(mode="json") if sensor is not None
                else json.loads(row["sensor_json"]) if row and row["sensor_json"] else None
            )
            vision_data = (
                vision.model_dump(mode="json") if vision is not None
                else json.loads(row["vision_json"]) if row and row["vision_json"] else None
            )
            if vision is not None:
                for seat in vision_data["seat_evidence"]:
                    seat["received_at"] = now.isoformat()
            started = time.perf_counter()
            prior_incident = old_state.get("incident") if old_state else None
            unresolved = bool(
                prior_incident and prior_incident["status"] == "OPEN"
                or old_state and prior_incident is None and old_state.get("incident_id")
                and old_state["risk_level"] in {"WARNING", "CRITICAL"}
                and old_state.get("occupancy_state") in {"PRESENT", "SUSPECTED"}
                and old_state.get("rule_id") != "HOT_ATTENDED_DRIVING"
            )
            decision = safety_graph.invoke({
                "sensor": sensor_data, "vision": vision_data, "now": now,
                "unresolved_incident": unresolved,
            })
            if vision is not None and row and row["vision_json"]:
                regression = confidence_regression(json.loads(row["vision_json"]), vision_data, now)
                if regression:
                    decision["evidence_conflicts"] = [*decision["evidence_conflicts"], regression]
            previous = old_state["risk_level"] if old_state else None
            quality = data_quality(sensor_data, vision_data, now)
            incident, alert, scheduled_tools, alert_event, opened = evolve_incident(
                old_state, decision, sensor_data, vision_data, now,
            )
            new_risk = decision["risk_level"]
            incident_id = (
                incident["incident_id"] if incident and incident["status"] == "OPEN"
                else old_state.get("incident_id") if old_state and previous == new_risk
                else str(uuid4()) if new_risk in {"WARNING", "CRITICAL", "ERROR"} else None
            )
            prior_unlock = old_state.get("unlock_request") if old_state else None
            unlock_request = prior_unlock.copy() if prior_unlock else None
            if new_risk == "CRITICAL" and (previous != "CRITICAL" or unlock_request is None):
                unlock_request = {
                    "request_id": str(uuid4()),
                    "incident_id": incident_id,
                    "created_at": now.isoformat(),
                    "expires_at": (now + timedelta(seconds=60)).isoformat(),
                    "status": "pending",
                }
            elif unlock_request and unlock_request["status"] == "pending":
                if now >= datetime.fromisoformat(unlock_request["expires_at"]):
                    unlock_request["status"] = "expired"
                elif new_risk != "CRITICAL":
                    unlock_request["status"] = "canceled"
            if (
                timer and old_state and new_risk == previous
                and decision["rule_id"] == old_state["rule_id"]
                and unlock_request == prior_unlock
                and incident == old_state.get("incident")
                and alert == old_state.get("alert")
                and quality == old_state.get("data_quality")
            ):
                return old_state
            state = {
                "vehicle_id": vehicle_id,
                "revision": (old_state["revision"] if old_state else 0) + 1,
                "previous_risk_level": previous,
                "risk_level": new_risk,
                "rule_id": decision["rule_id"],
                "reason": decision["reason"],
                "occupancy_state": decision["occupancy_state"],
                "occupancy_reason_code": decision["occupancy_reason_code"],
                "evidence_conflicts": decision["evidence_conflicts"],
                "seat_configuration_state": decision["seat_configuration_state"],
                "actions": decision["actions"],
                "action_results": [],
                "incident_id": incident_id,
                "incident": incident,
                "alert": alert,
                "data_quality": quality,
                "ruleset_version": "demo-alerts-2026-09-30",
                "risk_route": decision["route"],
                "unlock_request": unlock_request,
                "sensor_snapshot": sensor_data,
                "temperature": sensor_data["temperature"] if sensor_data else None,
                "engine_status": sensor_data["engine_status"] if sensor_data else None,
                "doors_locked": sensor_data["doors_locked"] if sensor_data else None,
                "radar_presence": sensor_data["radar_presence"] if sensor_data else None,
                "detected_objects": vision_data["detected_objects"] if vision_data else None,
                "seat_evidence": vision_data.get("seat_evidence", []) if vision_data else [],
                "camera_status": vision_data["camera_status"] if vision_data else None,
                "evaluated_at": now.isoformat(),
                "reasoning_latency_ms": round((time.perf_counter() - started) * 1000, 3),
            }
            deadline_escalation = (
                decision["rule_id"] in {"ICE_REMOTE_START_EXPIRING", "ICE_REMOTE_START_EXPIRED"}
                and (old_state is None or decision["rule_id"] != old_state["rule_id"])
            )
            baby_seat_first_notice = (
                new_risk == "WARNING"
                and "send_notification" in decision["actions"]
                and has_baby_seat_evidence(vision_data)
                and not has_baby_seat_evidence(old_state)
            )
            new_intents = decision["actions"] if (
                new_risk != previous or deadline_escalation or baby_seat_first_notice
            ) else []
            if opened and not new_intents:
                new_intents = ["send_notification"]
            new_intents = list(dict.fromkeys([*new_intents, *scheduled_tools]))
            committed_state_json = json.dumps(state)
            # This commit releases the writer before any external action executes.
            with self._db:
                self._db.execute(
                    """INSERT INTO vehicles (
                        vehicle_id, sensor_json, vision_json, state_json,
                        sensor_seq, sensor_time, vision_frame, vision_time
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(vehicle_id) DO UPDATE SET
                        sensor_json=excluded.sensor_json, vision_json=excluded.vision_json,
                        state_json=excluded.state_json, sensor_seq=excluded.sensor_seq,
                        sensor_time=excluded.sensor_time, vision_frame=excluded.vision_frame,
                        vision_time=excluded.vision_time""",
                    (
                        vehicle_id,
                        json.dumps(sensor_data) if sensor_data is not None else None,
                        json.dumps(vision_data) if vision_data is not None else None,
                        committed_state_json,
                        sensor.sequence if sensor is not None else row["sensor_seq"] if row else None,
                        sensor.timestamp.isoformat() if sensor is not None else row["sensor_time"] if row else None,
                        vision.frame_id if vision is not None else row["vision_frame"] if row else None,
                        vision.timestamp.isoformat() if vision is not None else row["vision_time"] if row else None,
                    ),
                )
                self._event(vehicle_id, "evaluation", state)
                if alert_event:
                    self._event(vehicle_id, "alert", {
                        "revision": state["revision"], "incident_id": incident_id,
                        "stage": alert_event, "sequence": alert["sequence"],
                        "sent_at": now.isoformat(), "delivery_mode": "SIMULATED",
                    })
                if unlock_request != prior_unlock and unlock_request is not None:
                    self._event(vehicle_id, "unlock_request", {
                        "revision": state["revision"], **unlock_request,
                    })
                for tool in new_intents:
                    self._db.execute("INSERT INTO action_ledger VALUES (?,?,?,?,?,?,?,?)", (
                        f"{vehicle_id}:{state['revision']}:{tool}", vehicle_id, incident_id,
                        state["revision"], tool, "planned", "not_attempted", None,
                    ))
                    self._event(vehicle_id, "action_intent", {
                        "revision": state["revision"], "incident_id": incident_id, "tool": tool,
                        "action_key": f"{vehicle_id}:{state['revision']}:{tool}",
                    })

            for tool in new_intents:
                if tool == "request_unlock":
                    result = {
                        "tool": tool, "vehicle_id": vehicle_id,
                        "status": "pending_human_confirmation",
                        "request_id": unlock_request["request_id"],
                        "expires_at": unlock_request["expires_at"],
                    }
                else:
                    with self._db:
                        self._db.execute("UPDATE action_ledger SET status='attempted', outcome='unknown' WHERE action_key=?", (f"{vehicle_id}:{state['revision']}:{tool}",))
                        self._event(vehicle_id, "action_attempt", {
                            "revision": state["revision"], "incident_id": incident_id,
                            "tool": tool, "attempted_at": now.isoformat(),
                        })
                    try:
                        result = self.actions.execute(tool, vehicle_id)
                    except Exception as exc:
                        result = {"tool": tool, "vehicle_id": vehicle_id, "status": "failed", "error": type(exc).__name__}
                result.update(incident_id=incident_id, revision=state["revision"], action_key=f"{vehicle_id}:{state['revision']}:{tool}")
                state["action_results"].append(result)
                with self._db:
                    self._db.execute("UPDATE action_ledger SET status=?, outcome=?, result_json=? WHERE action_key=?", (
                        result["status"], result["status"], json.dumps(result), result["action_key"],
                    ))
                    self._event(vehicle_id, "action_result", {"revision": state["revision"], **result})
            if state["action_results"]:
                with self._db:
                    self._db.execute(
                        "UPDATE vehicles SET state_json = ? WHERE vehicle_id = ? AND state_json = ?",
                        (json.dumps(state), vehicle_id, committed_state_json),
                    )
            return state

    def acknowledge(self, vehicle_id: str, incident_id: str) -> dict:
        """Mark a notification read; never resolve or authorize an actuator."""
        with self._lock, self._db:
            self._db.execute("BEGIN IMMEDIATE")
            state = self.get_state(vehicle_id)
            incident = state.get("incident") if state else None
            if not incident or incident["incident_id"] != incident_id or incident["status"] != "OPEN":
                raise ValueError("Incident is not current and open")
            if incident["acknowledged_at"] is None:
                incident["acknowledged_at"] = self.clock().isoformat()
                state["revision"] += 1
                self._db.execute("UPDATE vehicles SET state_json=? WHERE vehicle_id=?", (json.dumps(state), vehicle_id))
                self._event(vehicle_id, "acknowledgment", {"revision": state["revision"], **incident})
            return state

    def resolve(self, vehicle_id: str, incident_id: str, revision: int) -> dict:
        """Record a separate cabin check against the exact committed revision.

        Endpoint authorization belongs to the API; this never calls an actuator.
        """
        with self._lock, self._db:
            self._db.execute("BEGIN IMMEDIATE")
            row = self._db.execute("SELECT * FROM vehicles WHERE vehicle_id=?", (vehicle_id,)).fetchone()
            state = json.loads(row["state_json"]) if row and row["state_json"] else None
            incident = state.get("incident") if state else None
            if not incident or incident["incident_id"] != incident_id:
                raise ValueError("Incident is not current")
            if incident["status"] == "RESOLVED" and incident.get("resolution_revision") == revision:
                return state
            if incident["status"] != "OPEN" or state["revision"] != revision:
                raise ValueError("State changed; inspect the current revision")
            now = self.clock()
            sensor = json.loads(row["sensor_json"]) if row["sensor_json"] else None
            vision = json.loads(row["vision_json"]) if row["vision_json"] else None
            decision = safety_graph.invoke({"sensor": sensor, "vision": vision, "now": now})
            if (
                data_quality(sensor, vision, now)["status"] != "CURRENT"
                or decision["occupancy_state"] != "ABSENT"
                or decision["evidence_conflicts"]
                or state.get("alert", {}).get("temporal_status") == "UNKNOWN_CLOCK_REGRESSION"
            ):
                raise ValueError("Fresh, consistent empty-cabin evidence is required")
            incident.update(status="RESOLVED", resolved_at=now.isoformat(), resolution_revision=revision,
                            resolution="OPERATOR_CABIN_CHECK")
            prior_risk = state["risk_level"]
            state.update({key: decision[key] for key in (
                "risk_level", "rule_id", "reason", "actions", "occupancy_state", "occupancy_reason_code", "evidence_conflicts",
            )})
            state.update(previous_risk_level=prior_risk, risk_route=decision["route"], revision=revision + 1,
                         incident_id=None, action_results=[], evaluated_at=now.isoformat())
            if state.get("alert"):
                state["alert"]["stage"] = "RESOLVED"
            if state.get("unlock_request") and state["unlock_request"]["status"] == "pending":
                state["unlock_request"]["status"] = "canceled"
            self._db.execute("UPDATE vehicles SET state_json=? WHERE vehicle_id=?", (json.dumps(state), vehicle_id))
            self._event(vehicle_id, "incident_resolution", {"revision": state["revision"], **incident})
            return state

    def _event(self, vehicle_id: str, event_type: str, payload: dict) -> None:
        self._db.execute(
            "INSERT INTO events(vehicle_id, event_type, payload_json) VALUES (?, ?, ?)",
            (vehicle_id, event_type, json.dumps(payload)),
        )

    def get_state(self, vehicle_id: str) -> dict | None:
        with self._lock:
            row = self._db.execute(
                "SELECT state_json FROM vehicles WHERE vehicle_id = ?", (vehicle_id,)
            ).fetchone()
            return json.loads(row["state_json"]) if row and row["state_json"] else None

    def get_state_with_freshness(self, vehicle_id: str) -> dict | None:
        """Read a committed decision and attach current source-age metadata."""
        with self._lock:
            row = self._db.execute(
                "SELECT state_json, sensor_time, vision_time FROM vehicles WHERE vehicle_id = ?",
                (vehicle_id,),
            ).fetchone()
            if row is None or row["state_json"] is None:
                return None
            state = json.loads(row["state_json"])
            now = self.clock()
            sensor = _source_freshness(row["sensor_time"], now, ttl_s=5)
            vision = _source_freshness(row["vision_time"], now, ttl_s=3)
            seats = [
                {"evidence_id": seat["evidence_id"], **_source_freshness(seat.get("observed_at"), now, ttl_s=3)}
                for seat in state.get("seat_evidence", [])
            ]
            orientation_status = (
                "UNKNOWN" if not seats else
                "STALE" if any(seat["status"] == "STALE" for seat in seats) else
                "UNKNOWN" if any(seat["status"] == "UNKNOWN" for seat in seats) else
                "FRESH"
            )
            state["freshness"] = {
                "as_of": now.isoformat(),
                "sensor": sensor,
                "vision": vision,
                "orientation": {
                    "status": orientation_status,
                    "age_s": max((seat["age_s"] for seat in seats if seat["age_s"] is not None), default=None),
                    "evidence": seats,
                },
            }
            state["action_ledger"] = [dict(item) for item in self._db.execute(
                """SELECT action_key, incident_id, revision, tool, status, outcome FROM action_ledger
                WHERE vehicle_id=? ORDER BY (status IN ('planned','attempted')) DESC, revision DESC LIMIT 100""", (vehicle_id,),
            )]
            for field in ("incident", "alert", "data_quality"):
                state.setdefault(field, None)
            state.setdefault("ruleset_version", "legacy")
            state["decision_current"] = (
                sensor["status"] == "FRESH"
                and vision["status"] == "FRESH"
                and state.get("camera_status") == "OK"
            )
            return state

    def events(self, vehicle_id: str, *, event_type: str | None = None, limit: int = 50) -> list[dict]:
        with self._lock:
            if event_type:
                rows = self._db.execute(
                    "SELECT id, event_type, payload_json FROM events WHERE vehicle_id = ? AND event_type = ? ORDER BY id DESC LIMIT ?",
                    (vehicle_id, event_type, limit),
                ).fetchall()
            else:
                rows = self._db.execute(
                    "SELECT id, event_type, payload_json FROM events WHERE vehicle_id = ? ORDER BY id DESC LIMIT ?",
                    (vehicle_id, limit),
                ).fetchall()
            return [
                {"event_id": row["id"], "event_type": row["event_type"], **json.loads(row["payload_json"])}
                for row in rows
            ]


def _source_freshness(observed_at: str | None, now: datetime, *, ttl_s: float) -> dict:
    if observed_at is None:
        return {"status": "UNKNOWN", "age_s": None, "observed_at": None}
    try:
        age_s = (now - datetime.fromisoformat(observed_at)).total_seconds()
    except (TypeError, ValueError):
        return {"status": "UNKNOWN", "age_s": None, "observed_at": observed_at}
    return {
        "status": "FRESH" if -2 <= age_s <= ttl_s else "STALE",
        "age_s": age_s,
        "observed_at": observed_at,
    }
