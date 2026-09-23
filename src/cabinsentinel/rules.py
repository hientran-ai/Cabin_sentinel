"""Single deterministic source of truth for demo safety decisions."""

from datetime import datetime

LIVING = {"person", "dog", "cat"}
ITEMS = {"cell phone", "backpack"}


def decide(sensor: dict | None, vision: dict | None, now: datetime) -> dict:
    """Return a decision without clocks, I/O, or action side effects."""
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
        if obj["confidence"] >= 0.4
    }
    living = labels & LIVING
    temperature = sensor["temperature"]
    moving_with_driver = (
        sensor["gear"] in {"D", "R"}
        and (sensor["vehicle_speed_kph"] or 0) > 0
        and sensor["driver_present"] is True
    )

    if living and temperature >= 35:
        if moving_with_driver:
            return _result("WARNING", "HOT_ATTENDED_DRIVING", "Hot occupied moving vehicle")
        return _result(
            "CRITICAL", "HOT_OCCUPANT", "Living being detected in hot parked cabin",
            ["trigger_horn", "send_sms", "request_unlock"],
        )
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
    if labels & ITEMS and sensor["engine_status"] == "OFF":
        return _result("NOTICE", "FORGOTTEN_ITEM", "Possible item left in vehicle", ["send_notification"])
    return _result("SAFE", "EMPTY_CABIN", "No occupant or radar presence detected")


def _radar_or_error(radar: bool) -> dict:
    if radar:
        return _result("WARNING", "RADAR_FALLBACK", "Vision unavailable; radar reports presence", ["send_notification"])
    return _result("ERROR", "VISION_UNAVAILABLE", "Vision data unavailable or stale")


def _result(risk: str, rule: str, reason: str, actions: list[str] | None = None) -> dict:
    return {"risk_level": risk, "rule_id": rule, "reason": reason, "actions": actions or []}
