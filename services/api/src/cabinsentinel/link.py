"""Simulated vehicle edge link of ONE demo session.

The cockpit/phone read the backend; the vehicle (Raspberry Pi / telemetry) writes to it. This module models only the second link and
only for demo sessions: the scenario controller can DROP it and RESTORE it. It is NOT the browser's connection, NOT camera health and
NOT data freshness (those are separate: TTL freshness and camera_status stay as they are).

While the link is dropped the session refuses vehicle writes (sensor, observation, camera-status). Reads keep working, the last valid
evidence and its timestamps stay as they were, incidents are never touched, and the risk decision still comes only from CabinService
(stale evidence already yields UNKNOWN there). Per vehicle id: one session never affects another.

State machine (accelerated for the demo; the thresholds are NOT validated automotive limits):
  CONNECTED --drop--> RECONNECTING --(no restore within DISCONNECT_AFTER_S)--> DISCONNECTED
  RECONNECTING|DISCONNECTED --restore--> SYNCING --(a fresh message of each kind seen before the drop is accepted)--> CONNECTED
"""

import os
import threading
from datetime import datetime
from typing import Any

DISCONNECT_AFTER_S = float(os.getenv("CABIN_LINK_DISCONNECT_AFTER_S", "8"))

_lock = threading.Lock()
_links: dict[str, dict[str, Any]] = {}


def _entry(vehicle_id: str) -> dict[str, Any]:
    return _links.setdefault(vehicle_id, {"dropped_at": None, "restored_at": None, "syncing": False, "seen": set(), "required": {"sensor"}, "validated": set(),
                                          "last_message_at": None, "changed_at": None, "drops": 0})


def kind_of(event: str) -> str:
    return "sensor" if event == "sensor" else "vision"


def blocked(vehicle_id: str) -> bool:
    with _lock:
        return _entry(vehicle_id)["dropped_at"] is not None


def drop(vehicle_id: str, now: datetime) -> dict[str, Any]:
    with _lock:
        e = _entry(vehicle_id)
        if e["dropped_at"] is None:
            # after the restore, a fresh message of every kind the vehicle had been sending must arrive before the link counts as connected
            e.update(dropped_at=now, syncing=False, validated=set(), required=set(e["seen"]) or {"sensor"}, changed_at=now, drops=e["drops"] + 1)
        return _view(e, now)


def restore(vehicle_id: str, now: datetime) -> dict[str, Any]:
    with _lock:
        e = _entry(vehicle_id)
        if e["dropped_at"] is not None:
            e.update(dropped_at=None, restored_at=now, syncing=True, validated=set(), changed_at=now)
        return _view(e, now)


def accept(vehicle_id: str, event: str, now: datetime) -> None:
    """Called after the backend accepted a vehicle message. During SYNCING it validates the link kind by kind."""
    kind = kind_of(event)
    with _lock:
        e = _entry(vehicle_id)
        e["seen"].add(kind)
        e["last_message_at"] = now
        if e["syncing"]:
            e["validated"].add(kind)
            if e["validated"] >= e["required"]:
                e["syncing"] = False
                e["changed_at"] = now


def forget(vehicle_id: str) -> None:
    with _lock:
        _links.pop(vehicle_id, None)


def _view(e: dict[str, Any], now: datetime) -> dict[str, Any]:
    iso = lambda t: t.isoformat() if t else None  # noqa: E731
    if e["dropped_at"] is not None:
        elapsed = (now - e["dropped_at"]).total_seconds()
        state = "RECONNECTING" if elapsed < DISCONNECT_AFTER_S else "DISCONNECTED"
        reason = ("Mất liên lạc với xe (mô phỏng). Đang thử kết nối lại." if state == "RECONNECTING"
                  else "Xe không còn gửi dữ liệu (mô phỏng). Không thể xác minh tình trạng khoang xe.")
    elif e["syncing"]:
        state, reason = "SYNCING", "Đã nối lại. Đang chờ dữ liệu mới từ xe để xác nhận trước khi coi là đã kết nối."
    else:
        state, reason = "CONNECTED", ""
    return {"state": state, "link": "DROPPED" if e["dropped_at"] is not None else "UP", "simulated": True, "reason": reason,
            "dropped_at": iso(e["dropped_at"]), "restored_at": iso(e["restored_at"]), "last_vehicle_message_at": iso(e["last_message_at"]),
            "changed_at": iso(e["changed_at"]), "disconnect_after_s": DISCONNECT_AFTER_S, "drops": e["drops"],
            "note": "Mô phỏng ở phiên demo. Ngưỡng chỉ dùng cho demo, không phải giới hạn an toàn đã được kiểm chứng.",
            "incidents_unchanged": True}


def view(vehicle_id: str, now: datetime) -> dict[str, Any]:
    with _lock:
        return _view(_entry(vehicle_id), now)
