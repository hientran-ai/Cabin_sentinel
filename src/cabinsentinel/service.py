"""Per-vehicle fusion, durable decisions, and mock action results."""

import json
import sqlite3
import threading
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from src.cabinsentinel.actions import MockActions
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
        vision: VisionPayload | None = None, timer: bool = False,
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
            incoming_time = sensor.timestamp if sensor is not None else vision.timestamp if vision is not None else None
            if incoming_time is not None and (incoming_time - now).total_seconds() > 2:
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
            decision = safety_graph.invoke({"sensor": sensor_data, "vision": vision_data, "now": now})
            if vision is not None and row and row["vision_json"]:
                regression = confidence_regression(json.loads(row["vision_json"]), vision_data, now)
                if regression:
                    decision["evidence_conflicts"] = [*decision["evidence_conflicts"], regression]
            previous = old_state["risk_level"] if old_state else None
            new_risk = decision["risk_level"]
            incident_id = (
                old_state.get("incident_id") if old_state and previous == new_risk
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
                "unlock_request": unlock_request,
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
                if unlock_request != prior_unlock and unlock_request is not None:
                    self._event(vehicle_id, "unlock_request", {
                        "revision": state["revision"], **unlock_request,
                    })
                for tool in new_intents:
                    self._event(vehicle_id, "action_intent", {
                        "revision": state["revision"], "incident_id": incident_id, "tool": tool,
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
                    try:
                        result = self.actions.execute(tool, vehicle_id)
                    except Exception as exc:
                        result = {"tool": tool, "vehicle_id": vehicle_id, "status": "failed", "error": type(exc).__name__}
                state["action_results"].append(result)
                with self._db:
                    self._event(vehicle_id, "action_result", {"revision": state["revision"], **result})
            if state["action_results"]:
                with self._db:
                    self._db.execute(
                        "UPDATE vehicles SET state_json = ? WHERE vehicle_id = ? AND state_json = ?",
                        (json.dumps(state), vehicle_id, committed_state_json),
                    )
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
