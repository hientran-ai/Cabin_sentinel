"""Shared payload builders for fleet, guardian and action-safety tests."""

from datetime import UTC, datetime

NOW = datetime(2026, 10, 3, 9, tzinfo=UTC)

SCENARIOS = {
    # Thresholds are the existing rules.py values; nothing is redefined here.
    "NO_OCCUPANT_DETECTION": {"temperature": 24.0, "radar_presence": False, "objects": []},
    "WARNING": {"temperature": 28.0, "radar_presence": True, "objects": [{"class_name": "person", "confidence": 0.9}]},
    "CRITICAL": {"temperature": 39.2, "radar_presence": True, "objects": [{"class_name": "person", "confidence": 0.9}]},
}


def sensor(vehicle_id, when, sequence, scenario):
    values = SCENARIOS[scenario]
    return {
        "vehicle_id": vehicle_id, "timestamp": when.isoformat(), "sequence": sequence,
        "temperature": values["temperature"], "engine_status": "OFF", "doors_locked": True,
        "radar_presence": values["radar_presence"], "driver_present": False, "gear": "P",
        "vehicle_speed_kph": 0.0, "hvac_status": "INACTIVE", "window_status": "CLOSED",
    }


def vision(vehicle_id, when, frame, scenario):
    return {
        "vehicle_id": vehicle_id, "timestamp": when.isoformat(), "frame_id": f"sim:{frame}",
        "camera_status": "OK", "detected_objects": SCENARIOS[scenario]["objects"],
    }
