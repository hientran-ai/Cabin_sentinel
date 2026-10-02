"""Regression checks for occupant evidence and risk decisions."""

from datetime import UTC, datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory

from src.cabinsentinel.api import read_state
from src.cabinsentinel.models import SensorPayload, VisionPayload
from src.cabinsentinel.service import CabinService

NOW = datetime(2026, 9, 26, 3, 0, tzinfo=UTC)


def _service() -> CabinService:
    service = CabinService(":memory:", clock=lambda: NOW)
    service.ingest_sensor(SensorPayload(
        vehicle_id="CAR_1",
        timestamp=NOW,
        sequence=1,
        temperature=39,
        engine_status="OFF",
        doors_locked=True,
        radar_presence=False,
    ))
    return service


def hot_state(label: str, confidence: float = 0.99) -> dict:
    service = _service()
    return service.ingest_vision(VisionPayload(
        vehicle_id="CAR_1",
        timestamp=NOW,
        frame_id="frame-1",
        camera_status="OK",
        detected_objects=[{"class_name": label, "confidence": confidence}],
    ))


def test_confirmed_baby_in_hot_cabin_is_critical():
    state = hot_state("baby")
    assert state["risk_level"] == "CRITICAL"
    assert state["rule_id"] == "HOT_OCCUPANT"
    assert state["occupancy_state"] == "PRESENT"
    assert state["occupancy_reason_code"] == "OCCUPANT_CONFIRMED"


def test_low_confidence_person_is_warning_not_empty_cabin():
    state = hot_state("person", 0.39)
    assert state["risk_level"] == "WARNING"
    assert state["rule_id"] == "SUSPECTED_OCCUPANT"
    assert state["occupancy_state"] == "SUSPECTED"
    assert state["occupancy_reason_code"] == "LOW_CONFIDENCE_DETECTION"


def test_unrecognized_label_is_warning_not_empty_cabin():
    state = hot_state("child")
    assert state["risk_level"] == "WARNING"
    assert state["rule_id"] == "SUSPECTED_OCCUPANT"
    assert state["occupancy_state"] == "SUSPECTED"
    assert state["occupancy_reason_code"] == "UNRECOGNIZED_CLASS"


def test_infant_label_remains_suspected_until_vision_contract_confirms_it():
    state = hot_state("infant")
    assert state["occupancy_state"] == "SUSPECTED"
    assert state["risk_level"] == "WARNING"
    assert state["rule_id"] == "SUSPECTED_OCCUPANT"


def test_baby_seat_alone_gets_initial_warning_notification():
    service = _service()
    frame = VisionPayload(
        vehicle_id="CAR_1", timestamp=NOW, frame_id="seat-1",
        camera_status="OK",
        detected_objects=[{"class_name": "baby seat", "confidence": 0.91}],
    )
    state = service.ingest_vision(frame)
    assert state["occupancy_state"] == "SUSPECTED"
    assert state["occupancy_reason_code"] == "BABY_SEAT_ONLY"
    assert state["risk_level"] == "WARNING"
    assert state["rule_id"] == "BABY_SEAT_UNVERIFIED"
    assert [result["tool"] for result in state["action_results"]] == ["send_notification"]
    assert state["action_results"][0]["status"] == "simulated"
    assert service.ingest_vision(frame) == state
    assert len(service.events("CAR_1", event_type="action_result")) == 1


def test_baby_and_seat_in_hot_cabin_stay_critical_without_extra_warning():
    service = _service()
    state = service.ingest_vision(VisionPayload(
        vehicle_id="CAR_1", timestamp=NOW, frame_id="baby-seat-1",
        camera_status="OK", detected_objects=[
            {"class_name": "baby seat", "confidence": 0.96},
            {"class_name": "baby", "confidence": 0.88},
        ],
    ))
    assert state["occupancy_state"] == "PRESENT"
    assert state["risk_level"] == "CRITICAL"
    assert state["rule_id"] == "HOT_OCCUPANT"
    assert "send_notification" not in state["actions"]
    assert sorted(state["actions"]) == ["request_unlock", "send_sms", "trigger_horn"]


def test_baby_seat_below_threshold_still_warns():
    state = hot_state("baby seat", 0.39)
    assert state["occupancy_state"] == "SUSPECTED"
    assert state["risk_level"] == "WARNING"
    assert state["rule_id"] == "BABY_SEAT_UNVERIFIED"


def test_first_baby_seat_notification_even_if_prior_risk_was_warning():
    clock = [NOW]
    service = CabinService(":memory:", clock=lambda: clock[0])
    service.ingest_sensor(SensorPayload(
        vehicle_id="CAR_1", timestamp=NOW, sequence=1,
        temperature=39, engine_status="OFF", doors_locked=True,
        radar_presence=False,
    ))
    prior = service.ingest_vision(VisionPayload(
        vehicle_id="CAR_1", timestamp=NOW, frame_id="unknown-1",
        camera_status="OK",
        detected_objects=[{"class_name": "child", "confidence": 0.90}],
    ))
    assert prior["risk_level"] == "WARNING"
    assert len(service.events("CAR_1", event_type="action_result")) == 1

    clock[0] = NOW + timedelta(seconds=1)
    seat = service.ingest_vision(VisionPayload(
        vehicle_id="CAR_1", timestamp=clock[0], frame_id="seat-2",
        camera_status="OK",
        detected_objects=[{"class_name": "baby seat", "confidence": 0.91}],
    ))
    assert seat["risk_level"] == "WARNING"
    assert seat["rule_id"] == "BABY_SEAT_UNVERIFIED"
    assert [result["tool"] for result in seat["action_results"]] == ["send_notification"]
    assert len(service.events("CAR_1", event_type="action_result")) == 2


def test_baby_seat_arriving_after_radar_warning_gets_initial_notice():
    clock = [NOW]
    service = CabinService(":memory:", clock=lambda: clock[0])
    service.ingest_sensor(SensorPayload(
        vehicle_id="CAR_1", timestamp=NOW, sequence=1,
        temperature=39, engine_status="OFF", doors_locked=True,
        radar_presence=True,
    ))
    prior = service.ingest_vision(VisionPayload(
        vehicle_id="CAR_1", timestamp=NOW, frame_id="radar-1",
        camera_status="OK", detected_objects=[],
    ))
    assert prior["rule_id"] == "RADAR_FALLBACK"
    before = len(service.events("CAR_1", event_type="action_result"))

    clock[0] = NOW + timedelta(seconds=1)
    seat = service.ingest_vision(VisionPayload(
        vehicle_id="CAR_1", timestamp=clock[0], frame_id="radar-seat-1",
        camera_status="OK",
        detected_objects=[{"class_name": "baby seat", "confidence": 0.80}],
    ))
    assert seat["risk_level"] == "WARNING"
    assert seat["rule_id"] == "BABY_SEAT_UNVERIFIED"
    assert [result["tool"] for result in seat["action_results"]] == ["send_notification"]
    assert len(service.events("CAR_1", event_type="action_result")) == before + 1

    clock[0] = NOW + timedelta(seconds=2)
    repeat = service.ingest_vision(VisionPayload(
        vehicle_id="CAR_1", timestamp=clock[0], frame_id="seat-3",
        camera_status="OK",
        detected_objects=[{"class_name": "baby seat", "confidence": 0.92}],
    ))
    assert repeat["action_results"] == []
    assert len(service.events("CAR_1", event_type="action_result")) == 2


def test_baby_seat_with_confirmed_person_in_cool_attended_cabin_warns():
    service = CabinService(":memory:", clock=lambda: NOW)
    service.ingest_sensor(SensorPayload(
        vehicle_id="CAR_1", timestamp=NOW, sequence=1,
        temperature=30, engine_status="ON", doors_locked=True,
        radar_presence=False, driver_present=True, gear="D",
        vehicle_speed_kph=30, hvac_status="ACTIVE",
    ))
    state = service.ingest_vision(VisionPayload(
        vehicle_id="CAR_1", timestamp=NOW, frame_id="attended-seat-1",
        camera_status="OK", detected_objects=[
            {"class_name": "person", "confidence": 0.95},
            {"class_name": "baby seat", "confidence": 0.80},
        ],
    ))
    assert state["occupancy_state"] == "PRESENT"
    assert state["risk_level"] == "WARNING"
    assert [result["tool"] for result in state["action_results"]] == ["send_notification"]


def test_hot_attended_person_gets_seat_notice_on_first_seat_frame():
    clock = [NOW]
    service = CabinService(":memory:", clock=lambda: clock[0])
    service.ingest_sensor(SensorPayload(
        vehicle_id="CAR_1", timestamp=NOW, sequence=1,
        temperature=39, engine_status="ON", doors_locked=True,
        radar_presence=False, driver_present=True, gear="D",
        vehicle_speed_kph=30, hvac_status="ACTIVE",
    ))
    prior = service.ingest_vision(VisionPayload(
        vehicle_id="CAR_1", timestamp=NOW, frame_id="moving-1",
        camera_status="OK",
        detected_objects=[{"class_name": "person", "confidence": 0.95}],
    ))
    assert prior["rule_id"] == "HOT_ATTENDED_DRIVING"
    assert prior["action_results"] == []

    clock[0] = NOW + timedelta(seconds=1)
    seat = service.ingest_vision(VisionPayload(
        vehicle_id="CAR_1", timestamp=clock[0], frame_id="moving-seat-1",
        camera_status="OK", detected_objects=[
            {"class_name": "person", "confidence": 0.95},
            {"class_name": "baby seat", "confidence": 0.80},
        ],
    ))
    assert seat["rule_id"] == "HOT_ATTENDED_DRIVING"
    assert seat["risk_level"] == "WARNING"
    assert [result["tool"] for result in seat["action_results"]] == ["send_notification"]


def test_person_at_threshold_is_confirmed():
    state = hot_state("person", 0.40)
    assert state["occupancy_state"] == "PRESENT"
    assert state["risk_level"] == "CRITICAL"


def test_fresh_empty_frame_and_negative_radar_are_absent():
    service = _service()
    state = service.ingest_vision(VisionPayload(
        vehicle_id="CAR_1", timestamp=NOW, frame_id="empty-1",
        camera_status="OK", detected_objects=[],
    ))
    assert state["occupancy_state"] == "ABSENT"
    assert state["occupancy_reason_code"] == "NO_OCCUPANT_EVIDENCE"
    assert state["risk_level"] == "SAFE"


def test_unknown_label_with_known_item_cannot_become_notice_or_safe():
    service = _service()
    state = service.ingest_vision(VisionPayload(
        vehicle_id="CAR_1", timestamp=NOW, frame_id="unknown-item-1",
        camera_status="OK", detected_objects=[
            {"class_name": "backpack", "confidence": 0.95},
            {"class_name": "infant", "confidence": 0.90},
        ],
    ))
    assert state["occupancy_state"] == "SUSPECTED"
    assert state["risk_level"] == "WARNING"
    assert state["rule_id"] == "SUSPECTED_OCCUPANT"


def test_stale_vision_is_unknown_and_error_with_negative_radar():
    service = _service()
    state = service.ingest_vision(VisionPayload(
        vehicle_id="CAR_1", timestamp=NOW - timedelta(seconds=4),
        frame_id="stale-1", camera_status="OK", detected_objects=[],
    ))
    assert state["occupancy_state"] == "UNKNOWN"
    assert state["occupancy_reason_code"] == "SOURCE_UNAVAILABLE"
    assert state["risk_level"] == "ERROR"


def test_committed_occupancy_is_read_only_and_survives_restart():
    with TemporaryDirectory() as directory:
        path = Path(directory) / "occupancy.db"
        service = CabinService(path, clock=lambda: NOW)
        service.ingest_sensor(SensorPayload(
            vehicle_id="CAR_1", timestamp=NOW, sequence=1,
            temperature=39, engine_status="OFF", doors_locked=True,
            radar_presence=False,
        ))
        state = service.ingest_vision(VisionPayload(
            vehicle_id="CAR_1", timestamp=NOW, frame_id="persist-seat-1",
            camera_status="OK",
            detected_objects=[{"class_name": "baby seat", "confidence": 0.9}],
        ))
        before = len(service.events("CAR_1"))
        assert read_state("CAR_1", service)["occupancy_state"] == "SUSPECTED"
        assert read_state("CAR_1", service)["occupancy_reason_code"] == "BABY_SEAT_ONLY"
        evaluation = service.events("CAR_1", event_type="evaluation")[0]
        assert evaluation["revision"] == state["revision"]
        assert evaluation["rule_id"] == "BABY_SEAT_UNVERIFIED"
        assert evaluation["occupancy_reason_code"] == "BABY_SEAT_ONLY"
        assert len(service.events("CAR_1")) == before
        restarted = CabinService(path, clock=lambda: NOW)
        try:
            assert restarted.get_state("CAR_1") == state
        finally:
            restarted._db.close()
            service._db.close()
