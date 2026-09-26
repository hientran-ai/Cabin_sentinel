"""Single deterministic source of truth for demo safety decisions."""

from datetime import datetime

LIVING = {"person", "baby", "dog", "cat"}
ITEMS = {"cell phone", "backpack"}
BABY_SEAT = "baby seat"
MIN_CONFIDENCE = 0.4


def decide(sensor: dict | None, vision: dict | None, now: datetime) -> dict:
    """Return a decision without clocks, I/O, or action side effects."""
    occupancy = derive_occupancy(sensor, vision, now)
    return {
        **_decide_risk(sensor, vision, now, occupancy), **occupancy,
        "evidence_conflicts": derive_evidence_conflicts(sensor, vision, now),
        "seat_configuration_state": "NOT_ENOUGH_EVIDENCE",
    }


def derive_evidence_conflicts(sensor: dict | None, vision: dict | None, now: datetime) -> list[dict]:
    """Keep conflicting fresh observations; never use flags to reduce risk."""
    if sensor is None or vision is None:
        return []
    sensor_time = datetime.fromisoformat(sensor["timestamp"])
    vision_time = datetime.fromisoformat(vision["timestamp"])
    sensor_age = (now - sensor_time).total_seconds()
    vision_age = (now - vision_time).total_seconds()
    if not (-2 <= sensor_age <= 5 and -2 <= vision_age <= 3 and vision["camera_status"] == "OK"):
        return []

    conflicts = []
    objects = vision["detected_objects"]
    confirmed_living = any(
        obj["confidence"] >= MIN_CONFIDENCE
        and obj["class_name"].strip().lower().replace("_", " ") in LIVING
        for obj in objects
    )
    if (sensor["radar_presence"] and not objects and not has_baby_seat_evidence(vision)) or (
        not sensor["radar_presence"] and confirmed_living
    ):
        conflicts.append({
            "type": "PRESENCE_DISAGREEMENT",
            "sensor": {"radar_presence": sensor["radar_presence"], "observed_at": sensor["timestamp"]},
            "vision": {"detected_objects": objects, "observed_at": vision["timestamp"]},
        })

    grouped: dict[str, list[dict]] = {}
    for seat in vision.get("seat_evidence", []):
        seat_id = seat.get("seat_detection_id")
        if seat_id and -2 <= (now - datetime.fromisoformat(seat["observed_at"])).total_seconds() <= 3:
            grouped.setdefault(seat_id, []).append(seat)
    for seat_id, seats in grouped.items():
        orientations = {s["seat_orientation"] for s in seats if s["seat_orientation"] != "UNKNOWN"}
        if len(orientations) > 1:
            conflicts.append({
                "type": "ORIENTATION_DISAGREEMENT", "seat_detection_id": seat_id,
                "seat_evidence": seats,
            })

    skew_s = abs((sensor_time - vision_time).total_seconds())
    if skew_s > 2:
        conflicts.append({
            "type": "TIMESTAMP_SKEW", "skew_s": skew_s,
            "sensor_observed_at": sensor["timestamp"],
            "vision_observed_at": vision["timestamp"],
        })
    return conflicts


def confidence_regression(previous: dict | None, current: dict | None, now: datetime) -> dict | None:
    """Describe a fresh frame transition without treating the old frame as current."""
    if not previous or not current or previous.get("camera_status") != "OK":
        return None
    previous_age = (now - datetime.fromisoformat(previous["timestamp"])).total_seconds()
    if not -2 <= previous_age <= 3:
        return None
    old_objects = previous.get("detected_objects", [])
    new_objects = current.get("detected_objects", [])
    for old in old_objects:
        label = old["class_name"].strip().lower().replace("_", " ")
        if label not in LIVING or old["confidence"] < MIN_CONFIDENCE:
            continue
        for new in new_objects:
            if (
                new["class_name"].strip().lower().replace("_", " ") == label
                and new["confidence"] < MIN_CONFIDENCE
            ):
                return {
                    "type": "CONFIDENCE_REGRESSION",
                    "previous": {"observed_at": previous["timestamp"], "detected_objects": [old]},
                    "current": {"observed_at": current["timestamp"], "detected_objects": [new]},
                }
    return None


def derive_occupancy(sensor: dict | None, vision: dict | None, now: datetime) -> dict:
    """Classify occupant evidence independently of the risk level."""
    sensor_fresh = sensor is not None and -2 <= (
        now - datetime.fromisoformat(sensor["timestamp"])
    ).total_seconds() <= 5
    vision_fresh = vision is not None and vision["camera_status"] == "OK" and -2 <= (
        now - datetime.fromisoformat(vision["timestamp"])
    ).total_seconds() <= 3

    if vision_fresh:
        objects = vision["detected_objects"]
        labels = {
            obj["class_name"].strip().lower().replace("_", " ") for obj in objects
        }
        if any(
            obj["confidence"] >= MIN_CONFIDENCE
            and obj["class_name"].strip().lower().replace("_", " ") in LIVING
            for obj in objects
        ):
            return _occupancy("PRESENT", "OCCUPANT_CONFIRMED")
        if has_baby_seat_evidence(vision):
            return _occupancy("SUSPECTED", "BABY_SEAT_ONLY")
        if any(obj["confidence"] < MIN_CONFIDENCE for obj in objects):
            return _occupancy("SUSPECTED", "LOW_CONFIDENCE_DETECTION")
        if labels - (LIVING | ITEMS):
            return _occupancy("SUSPECTED", "UNRECOGNIZED_CLASS")
    if sensor_fresh and sensor["radar_presence"]:
        return _occupancy("SUSPECTED", "RADAR_PRESENCE")
    if not sensor_fresh or not vision_fresh:
        return _occupancy("UNKNOWN", "SOURCE_UNAVAILABLE")
    return _occupancy("ABSENT", "NO_OCCUPANT_EVIDENCE")


def _occupancy(state: str, reason: str) -> dict:
    return {"occupancy_state": state, "occupancy_reason_code": reason}


def contains_baby_seat(objects: list[dict] | None) -> bool:
    return any(
        obj["class_name"].strip().lower().replace("_", " ") == BABY_SEAT
        for obj in (objects or [])
    )


def has_baby_seat_evidence(vision: dict | None) -> bool:
    return bool(vision) and (
        contains_baby_seat(vision.get("detected_objects"))
        or any(
            seat.get("child_seat_present") is True
            for seat in vision.get("seat_evidence", [])
        )
    )


def _decide_risk(sensor: dict | None, vision: dict | None, now: datetime, occupancy: dict) -> dict:
    if vision is not None and (now - datetime.fromisoformat(vision["timestamp"])).total_seconds() <= 3:
        if vision["camera_status"] != "OK":
            return _result("ERROR", "CAMERA_UNAVAILABLE", "Camera cannot verify cabin occupancy")

    if sensor is None:
        return _result("ERROR", "SENSOR_UNAVAILABLE", "Sensor data unavailable")
    sensor_age = (now - datetime.fromisoformat(sensor["timestamp"])).total_seconds()
    if sensor_age > 5 or sensor_age < -2:
        return _result("ERROR", "SENSOR_STALE", "Sensor data is stale or in the future")

    radar = sensor["radar_presence"]
    if vision is None:
        return _radar_or_error(radar)
    vision_age = (now - datetime.fromisoformat(vision["timestamp"])).total_seconds()
    if vision_age > 3 or vision_age < -2:
        return _radar_or_error(radar)
    if vision["camera_status"] != "OK":
        return _result("ERROR", "CAMERA_UNAVAILABLE", "Camera cannot verify cabin occupancy")

    labels = {
        obj["class_name"].strip().lower().replace("_", " ")
        for obj in vision["detected_objects"]
        if obj["confidence"] >= MIN_CONFIDENCE
    }
    living = labels & LIVING
    baby_seat_detected = has_baby_seat_evidence(vision)
    temperature = sensor["temperature"]
    moving_with_driver = (
        sensor["gear"] in {"D", "R"}
        and (sensor["vehicle_speed_kph"] or 0) > 0
        and sensor["driver_present"] is True
    )

    if living and temperature >= 35:
        if moving_with_driver:
            return _result(
                "WARNING", "HOT_ATTENDED_DRIVING", "Hot occupied moving vehicle",
                ["send_notification"] if baby_seat_detected else [],
            )
        return _result(
            "CRITICAL", "HOT_OCCUPANT", "Living being detected in hot parked cabin",
            ["trigger_horn", "send_sms", "request_unlock"],
        )
    if baby_seat_detected:
        return _result("WARNING", "BABY_SEAT_UNVERIFIED", "Baby seat detected; check cabin", ["send_notification"])
    if living:
        only_pet = living <= {"dog", "cat"}
        if (
            only_pet
            and sensor["powertrain_type"] == "EV"
            and sensor["operation_mode"] == "PET"
            and sensor["hvac_status"] == "ACTIVE"
            and sensor["battery_soc_pct"] is not None
            and sensor["battery_soc_pct"] > 30
            and temperature <= 30
        ):
            return _result("NOTICE", "EV_PET_MONITORED", "Pet mode active and cabin monitored", ["send_notification"])
        if sensor["operation_mode"] == "REMOTE_START":
            deadline = sensor.get("remote_start_expires_at")
            if deadline is not None:
                remaining = (datetime.fromisoformat(deadline) - now).total_seconds()
                if remaining <= 0:
                    return _result("WARNING", "ICE_REMOTE_START_EXPIRED", "Remote start deadline passed; occupant remains", ["send_notification"])
                if remaining <= 120:
                    return _result("WARNING", "ICE_REMOTE_START_EXPIRING", "Remote start expires soon; occupant remains", ["send_notification"])
            return _result("WARNING", "ICE_REMOTE_START_OCCUPIED", "Remote start does not confirm an attendant", ["send_notification"])
        if moving_with_driver and sensor["hvac_status"] == "ACTIVE":
            return _result("SAFE", "ATTENDED_DRIVING", "Driver present and cabin climate active")
        return _result("WARNING", "COOL_OCCUPANT", "Living being remains in vehicle", ["send_notification"])
    if radar:
        return _result("WARNING", "RADAR_FALLBACK", "Radar reports possible occupant", ["send_notification"])
    if occupancy["occupancy_state"] == "SUSPECTED":
        return _result("WARNING", "SUSPECTED_OCCUPANT", "Detection requires occupant review", ["send_notification"])
    if labels & ITEMS and sensor["engine_status"] == "OFF":
        return _result("NOTICE", "FORGOTTEN_ITEM", "Possible item left in vehicle", ["send_notification"])
    return _result("SAFE", "EMPTY_CABIN", "No occupant or radar presence detected")


def _radar_or_error(radar: bool) -> dict:
    if radar:
        return _result("WARNING", "RADAR_FALLBACK", "Vision unavailable; radar reports presence", ["send_notification"])
    return _result("ERROR", "VISION_UNAVAILABLE", "Vision data unavailable or stale")


def _result(risk: str, rule: str, reason: str, actions: list[str] | None = None) -> dict:
    return {"risk_level": risk, "rule_id": rule, "reason": reason, "actions": actions or []}
