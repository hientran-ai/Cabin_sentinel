"""Demo-only item continuity. Separate from occupancy, risk, incidents and actuators.

Decision 20261017-ITEM-ANALYTICS: two fresh accepted frames plus an explicit
simulated trip-end and departed driver. Same-class continuity is not identity tracking.
Only mutation endpoints call these writers; view is read-only.
"""
import math
from datetime import datetime, timedelta

CLASSES = {"backpack", "cell phone"}


def sanitize(values):
    out = []
    for d in values if isinstance(values, list) else []:
        if not isinstance(d, dict) or d.get("class") not in CLASSES:
            continue
        c, b = d.get("confidence"), d.get("bbox")
        if isinstance(c, (int, float)) and not isinstance(c, bool) and math.isfinite(c) and 0 <= c <= 1 and isinstance(b, list) and len(b) == 4 and all(isinstance(x, (int, float)) and math.isfinite(x) for x in b):
            out.append({"class": d["class"], "confidence": float(c), "bbox": b})
    return out


def trip(service, vehicle, ended):
    if ended is None:
        return
    last = service.events(vehicle, event_type="demo_trip", limit=1)
    if not last or last[0]["trip_ended"] != ended:
        service.record_event(vehicle, "demo_trip", {"trip_ended": ended, "source": "SIMULATED", "at": service.clock().isoformat()})


def view(service, vehicle):
    reminders = service.events(vehicle, event_type="item_reminder", limit=50)
    responses = {r["reminder_id"]: r for r in reversed(service.events(vehicle, event_type="item_response", limit=100))}
    result = []
    for r in reversed(reminders):
        r = {k: v for k, v in r.items() if k not in {"event_type", "event_id"}}
        r.update({k: v for k, v in responses.get(r["id"], {}).items() if k in {"status", "snoozed_until"}})
        result.append(r)
    return {"source": "MODEL_INFERENCE", "telemetry_source": "SIMULATED", "identity_tracking": False, "reminders": result}


def observe(service, vehicle):
    trips = service.events(vehicle, event_type="demo_trip", limit=1)
    if not trips or trips[0]["trip_ended"] is not True:
        return
    state = service.get_state_with_freshness(vehicle) or {}
    s = state.get("sensor_snapshot") or {}
    if (state.get("freshness", {}).get("sensor", {}).get("status") != "FRESH" or s.get("driver_present") is not False
            or s.get("gear") != "P" or s.get("engine_status") != "OFF" or s.get("vehicle_speed_kph") != 0):
        return
    observations = [o for o in service.events(vehicle, event_type="observation", limit=3) if o.get("accepted")]
    if len(observations) < 2:
        return
    newer, older = observations[:2]
    if any(o.get("vision", {}).get("detections") for o in (newer, older)):
        return  # a person/pet still in the frame is not a post-departure item-only observation
    camera = service.events(vehicle, event_type="camera_status", limit=1)
    if older["event_id"] <= trips[0]["event_id"] or (camera and camera[0]["event_id"] > older["event_id"]):
        return
    now = service.clock()
    ages = [(now - datetime.fromisoformat(o["observed_at"])).total_seconds() for o in (newer, older)]
    if not (0 <= ages[0] < ages[1] <= 3) or newer.get("source_label") != older.get("source_label"):
        return
    labels = [{d["class"] for d in sanitize(o.get("vision", {}).get("items"))} for o in (newer, older)]
    known = {r["id"] for r in view(service, vehicle)["reminders"]}
    for label in sorted(labels[0] & labels[1]):
        rid = f"item-{trips[0]['event_id']}-{label.replace(' ', '-')}"
        if rid not in known:
            service.record_event(vehicle, "item_reminder", {"id": rid, "class": label, "status": "OPEN", "at": now.isoformat(),
                "evidence_frames": [older["frame_id"], newer["frame_id"]], "simulated": True, "not_emergency": True})
    for r in view(service, vehicle)["reminders"]:
        if r["status"] == "SNOOZED" and now >= datetime.fromisoformat(r["snoozed_until"]) and r["class"] in labels[0] & labels[1]:
            service.record_event(vehicle, "item_response", {"reminder_id": r["id"], "status": "OPEN", "at": now.isoformat(), "reason": "SNOOZE_EXPIRED"})


def respond(service, vehicle, rid, response, minutes):
    r = next((r for r in view(service, vehicle)["reminders"] if r["id"] == rid), None)
    if r is None:
        raise LookupError("Item reminder not found in this session")
    if response == "SNOOZE" and minutes is None:
        raise ValueError("Choose snooze minutes explicitly")
    status = "TAKEN" if response == "TAKEN" else "SNOOZED"
    if r["status"] == status:
        return r
    payload = {"reminder_id": rid, "status": status, "at": service.clock().isoformat()}
    if status == "SNOOZED":
        payload["snoozed_until"] = (service.clock() + timedelta(minutes=minutes)).isoformat()
    service.record_event(vehicle, "item_response", payload)
    return {**r, **payload}
