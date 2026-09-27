"""Conflicting observations stay visible without weakening risk decisions."""

from datetime import UTC, datetime, timedelta

from src.cabinsentinel.models import SensorPayload, VisionPayload
from src.cabinsentinel.service import CabinService

NOW = datetime(2026, 9, 26, 3, 0, tzinfo=UTC)


def _sensor(*, radar: bool, temperature: float = 39, timestamp=NOW):
    return SensorPayload(
        vehicle_id="CAR_1", timestamp=timestamp, sequence=1,
        temperature=temperature, engine_status="OFF", doors_locked=True,
        radar_presence=radar,
    )


def _vision(*, objects=None, seats=None, timestamp=NOW):
    return VisionPayload(
        vehicle_id="CAR_1", timestamp=timestamp, frame_id="f-1",
        camera_status="OK", detected_objects=objects or [], seat_evidence=seats or [],
    )


def test_radar_presence_vs_empty_vision_is_explicit_conflict():
    service = CabinService(":memory:", clock=lambda: NOW)
    service.ingest_sensor(_sensor(radar=True))
    state = service.ingest_vision(_vision())
    assert state["risk_level"] == "WARNING"
    conflict = next(c for c in state["evidence_conflicts"] if c["type"] == "PRESENCE_DISAGREEMENT")
    assert conflict["sensor"]["radar_presence"] is True
    assert conflict["vision"]["detected_objects"] == []
    assert datetime.fromisoformat(conflict["sensor"]["observed_at"]) == NOW


def test_baby_vs_radar_false_keeps_critical_and_both_sources():
    service = CabinService(":memory:", clock=lambda: NOW)
    service.ingest_sensor(_sensor(radar=False))
    state = service.ingest_vision(_vision(objects=[{"class_name": "baby", "confidence": 0.99}]))
    assert state["risk_level"] == "CRITICAL"
    assert state["occupancy_state"] == "PRESENT"
    conflict = next(c for c in state["evidence_conflicts"] if c["type"] == "PRESENCE_DISAGREEMENT")
    assert conflict["sensor"]["radar_presence"] is False
    assert conflict["vision"]["detected_objects"][0]["class_name"] == "baby"
    assert service.events("CAR_1", event_type="evaluation")[0]["evidence_conflicts"] == state["evidence_conflicts"]


def test_opposite_orientations_for_same_seat_are_preserved_and_unresolved():
    service = CabinService(":memory:", clock=lambda: NOW)
    service.ingest_sensor(_sensor(radar=False, temperature=30))
    seats = [
        {
            "evidence_id": f"s-{orientation}", "child_seat_present": True,
            "seat_orientation": orientation, "observed_at": NOW,
            "source": source, "quality": "OK", "seat_detection_id": "seat-1",
        }
        for orientation, source in (("REAR_FACING", "camera-a"), ("FORWARD_FACING", "camera-b"))
    ]
    state = service.ingest_vision(_vision(seats=seats))
    assert state["risk_level"] == "WARNING"
    assert state["seat_configuration_state"] == "NOT_ENOUGH_EVIDENCE"
    conflict = next(c for c in state["evidence_conflicts"] if c["type"] == "ORIENTATION_DISAGREEMENT")
    assert conflict["seat_detection_id"] == "seat-1"
    assert {item["seat_orientation"] for item in conflict["seat_evidence"]} == {"REAR_FACING", "FORWARD_FACING"}
    assert {item["source"] for item in conflict["seat_evidence"]} == {"camera-a", "camera-b"}


def test_timestamp_skew_over_two_seconds_is_flagged_without_downgrading():
    service = CabinService(":memory:", clock=lambda: NOW)
    service.ingest_sensor(_sensor(radar=False, timestamp=NOW))
    state = service.ingest_vision(_vision(
        objects=[{"class_name": "baby", "confidence": 0.99}],
        timestamp=NOW - timedelta(seconds=2, milliseconds=500),
    ))
    assert state["risk_level"] == "CRITICAL"
    conflict = next(c for c in state["evidence_conflicts"] if c["type"] == "TIMESTAMP_SKEW")
    assert conflict["skew_s"] == 2.5
    assert datetime.fromisoformat(conflict["sensor_observed_at"]) == NOW
    assert datetime.fromisoformat(conflict["vision_observed_at"]) == NOW - timedelta(seconds=2, milliseconds=500)


def test_exactly_two_seconds_skew_is_not_flagged():
    service = CabinService(":memory:", clock=lambda: NOW)
    service.ingest_sensor(_sensor(radar=False))
    state = service.ingest_vision(_vision(timestamp=NOW - timedelta(seconds=2)))
    assert all(c["type"] != "TIMESTAMP_SKEW" for c in state["evidence_conflicts"])


def test_new_low_confidence_frame_records_regression_without_reusing_old_detection():
    clock = [NOW]
    service = CabinService(":memory:", clock=lambda: clock[0])
    service.ingest_sensor(_sensor(radar=False))
    old = service.ingest_vision(_vision(objects=[{"class_name": "baby", "confidence": 0.99}]))
    assert old["risk_level"] == "CRITICAL"
    clock[0] += timedelta(seconds=1)
    new = service.ingest_vision(VisionPayload(
        vehicle_id="CAR_1", timestamp=clock[0], frame_id="f-2",
        camera_status="OK", detected_objects=[{"class_name": "baby", "confidence": 0.39}],
    ))
    assert new["occupancy_state"] == "SUSPECTED"
    assert new["risk_level"] == "WARNING"
    conflict = next(c for c in new["evidence_conflicts"] if c["type"] == "CONFIDENCE_REGRESSION")
    assert conflict["previous"]["detected_objects"][0]["confidence"] == 0.99
    assert conflict["current"]["detected_objects"][0]["confidence"] == 0.39


def test_low_confidence_with_positive_radar_stays_suspected_without_presence_conflict():
    # DECISION-20260926-LOW-CONFIDENCE-CONFLICT: uncertain Vision is not absence.
    service = CabinService(":memory:", clock=lambda: NOW)
    service.ingest_sensor(_sensor(radar=True))
    state = service.ingest_vision(_vision(objects=[{"class_name": "baby", "confidence": 0.39}]))
    assert state["occupancy_state"] == "SUSPECTED"
    assert state["risk_level"] == "WARNING"
    assert state["detected_objects"][0]["confidence"] == 0.39
    assert all(c["type"] != "PRESENCE_DISAGREEMENT" for c in state["evidence_conflicts"])
    event = service.events("CAR_1", event_type="evaluation")[0]
    assert event["detected_objects"] == state["detected_objects"]
    assert event["radar_presence"] is True
