"""Phase 2A contract checks for child-seat observations."""

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from src.cabinsentinel.api import read_state
from src.cabinsentinel.models import SensorPayload, VisionPayload
from src.cabinsentinel.service import CabinService

NOW = datetime(2026, 9, 26, 3, 0, tzinfo=UTC)


def _payload(orientation: str) -> dict:
    return {
        "vehicle_id": "CAR_1",
        "timestamp": NOW.isoformat(),
        "frame_id": "camera0-1",
        "camera_status": "OK",
        "detected_objects": [
            {"detection_id": "d-seat-1", "class_name": "baby seat", "confidence": 0.91},
        ],
        "seat_evidence": [{
            "evidence_id": "s-1",
            "child_seat_present": True,
            "seat_orientation": orientation,
            "orientation_confidence": 0.82,
            "seat_position": "UNKNOWN",
            "observed_at": NOW.isoformat(),
            "source": "camera0",
            "model_version": "v2-demo",
            "quality": "UNKNOWN",
            "seat_detection_id": "d-seat-1",
            "related_occupant_detection_id": None,
        }],
    }


def test_rear_facing_orientation_and_metadata_survive_validation():
    parsed = VisionPayload.model_validate(_payload("REAR_FACING"))
    output = parsed.model_dump(mode="json")
    assert output["detected_objects"][0]["detection_id"] == "d-seat-1"
    seat = output["seat_evidence"][0]
    assert seat["seat_orientation"] == "REAR_FACING"
    assert seat["orientation_confidence"] == 0.82
    assert datetime.fromisoformat(seat["observed_at"]) == NOW
    assert seat["source"] == "camera0"
    assert seat["model_version"] == "v2-demo"
    assert seat["seat_detection_id"] == "d-seat-1"


def test_seat_evidence_survives_service_sqlite_event_and_get(tmp_path):
    path = tmp_path / "state.db"
    service = CabinService(path, clock=lambda: NOW)
    service.ingest_sensor(SensorPayload(
        vehicle_id="CAR_1", timestamp=NOW, sequence=1,
        temperature=30, engine_status="OFF", doors_locked=True,
        radar_presence=False,
    ))
    state = service.ingest_vision(VisionPayload.model_validate(_payload("REAR_FACING")))
    seat = state["seat_evidence"][0]
    assert seat["seat_orientation"] == "REAR_FACING"
    assert seat["orientation_confidence"] == 0.82
    assert datetime.fromisoformat(seat["received_at"]) == NOW
    assert service.events("CAR_1", event_type="evaluation")[0]["seat_evidence"] == state["seat_evidence"]
    restarted = CabinService(path, clock=lambda: NOW)
    assert read_state("CAR_1", restarted)["seat_evidence"] == state["seat_evidence"]


def test_positive_seat_evidence_without_detection_still_warns_and_notifies():
    service = CabinService(":memory:", clock=lambda: NOW)
    service.ingest_sensor(SensorPayload(
        vehicle_id="CAR_1", timestamp=NOW, sequence=1,
        temperature=30, engine_status="OFF", doors_locked=True,
        radar_presence=False,
    ))
    payload = _payload("UNKNOWN")
    payload["detected_objects"] = []
    payload["seat_evidence"][0]["orientation_confidence"] = None
    payload["seat_evidence"][0]["seat_detection_id"] = None
    frame = VisionPayload.model_validate(payload)
    state = service.ingest_vision(frame)
    assert state["occupancy_state"] == "SUSPECTED"
    assert state["occupancy_reason_code"] == "BABY_SEAT_ONLY"
    assert state["risk_level"] == "WARNING"
    assert state["rule_id"] == "BABY_SEAT_UNVERIFIED"
    assert [item["tool"] for item in state["action_results"]] == ["send_notification"]
    assert service.ingest_vision(frame) == state
    assert len(service.events("CAR_1", event_type="action_result")) == 1
    next_payload = payload.copy()
    next_payload["frame_id"] = "camera0-2"
    next_payload["timestamp"] = (NOW + timedelta(seconds=1)).isoformat()
    next_frame = VisionPayload.model_validate(next_payload)
    follow_up = service.ingest_vision(next_frame)
    assert follow_up["risk_level"] == "WARNING"
    assert follow_up["action_results"] == []
    assert len(service.events("CAR_1", event_type="action_result")) == 1


@pytest.mark.parametrize("orientation", ["REAR_FACING", "FORWARD_FACING", "UNKNOWN"])
def test_all_orientation_values_are_preserved(orientation):
    parsed = VisionPayload.model_validate(_payload(orientation))
    assert parsed.model_dump(mode="json")["seat_evidence"][0]["seat_orientation"] == orientation


@pytest.mark.parametrize("value", ["SIDEWAYS", "rear_facing", None])
def test_invalid_orientation_is_rejected_explicitly(value):
    payload = _payload("REAR_FACING")
    payload["seat_evidence"][0]["seat_orientation"] = value
    with pytest.raises(ValidationError):
        VisionPayload.model_validate(payload)


def test_missing_orientation_is_rejected_explicitly():
    payload = _payload("REAR_FACING")
    del payload["seat_evidence"][0]["seat_orientation"]
    with pytest.raises(ValidationError):
        VisionPayload.model_validate(payload)


def test_unknown_seat_metadata_key_is_rejected_instead_of_dropped():
    payload = _payload("UNKNOWN")
    payload["seat_evidence"][0]["orientation_confidnce"] = 0.8
    with pytest.raises(ValidationError):
        VisionPayload.model_validate(payload)


def test_old_vision_producer_without_seat_evidence_remains_valid():
    payload = _payload("UNKNOWN")
    del payload["seat_evidence"]
    parsed = VisionPayload.model_validate(payload)
    assert parsed.seat_evidence == []


def test_unknown_orientation_does_not_suppress_hot_baby_risk():
    service = CabinService(":memory:", clock=lambda: NOW)
    service.ingest_sensor(SensorPayload(
        vehicle_id="CAR_1", timestamp=NOW, sequence=1,
        temperature=39, engine_status="OFF", doors_locked=True,
        radar_presence=False,
    ))
    payload = _payload("UNKNOWN")
    payload["detected_objects"].append({"class_name": "baby", "confidence": 0.99})
    payload["seat_evidence"][0]["orientation_confidence"] = None
    state = service.ingest_vision(VisionPayload.model_validate(payload))
    assert state["occupancy_state"] == "PRESENT"
    assert state["risk_level"] == "CRITICAL"
    assert state["rule_id"] == "HOT_OCCUPANT"
    assert "send_notification" not in state["actions"]


def test_seat_observation_more_than_two_seconds_in_future_is_rejected():
    service = CabinService(":memory:", clock=lambda: NOW)
    payload = _payload("REAR_FACING")
    payload["seat_evidence"][0]["observed_at"] = (NOW + timedelta(seconds=3)).isoformat()
    with pytest.raises(ValueError, match="seat evidence timestamp"):
        service.ingest_vision(VisionPayload.model_validate(payload))
    assert service.get_state("CAR_1") is None
