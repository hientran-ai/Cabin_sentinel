"""Tâm's YOLO frame contract at the CabinSentinel backend boundary."""

from datetime import UTC, datetime, timedelta

import pytest

from src.cabinsentinel.models import SensorPayload
from src.cabinsentinel.service import CabinService

NOW = datetime(2026, 9, 27, 4, 0, tzinfo=UTC)


def frame(*detections, at=NOW, frame_id=1):
    return {
        "timestamp": at.isoformat(),
        "frame_id": frame_id,
        "video_time_ms": 0.0,
        "detections": list(detections),
        "latency_ms": 42.0,
        "detector_latency_ms": 40.0,
        "age_latency_ms": 0.0,
    }


@pytest.mark.parametrize("label", ["person", "dog", "cat"])
def test_yolo_frame_flows_through_existing_service(label, tmp_path):
    from src.cabinsentinel.vision_adapter import to_vision_payload

    service = CabinService(tmp_path / "state.db", clock=lambda: NOW)
    service.ingest_sensor(SensorPayload(
        vehicle_id="CAR_1", timestamp=NOW, sequence=1,
        temperature=39, engine_status="OFF", doors_locked=True,
        radar_presence=False,
    ))
    payload = to_vision_payload(
        frame({"class": label, "confidence": 0.87, "bbox": [1, 2, 20, 30]}),
        vehicle_id="CAR_1", source_id="run-a", camera_status="OK",
    )
    assert payload.frame_id == "run-a:1"
    assert payload.detected_objects[0].class_name == label
    assert payload.detected_objects[0].confidence == 0.87
    assert payload.vision_latency_ms == 42.0

    state = service.ingest_vision(payload)
    assert state["risk_level"] == "CRITICAL"
    assert state["occupancy_state"] == "PRESENT"
    assert sorted(result["status"] for result in state["action_results"]) == [
        "pending_human_confirmation", "simulated", "simulated",
    ]


def test_frame_ids_are_unique_between_vision_runs(tmp_path):
    from src.cabinsentinel.vision_adapter import to_vision_payload

    clock = [NOW]
    service = CabinService(tmp_path / "state.db", clock=lambda: clock[0])
    first = to_vision_payload(
        frame({"class": "person", "confidence": 0.87}),
        vehicle_id="CAR_1", source_id="run-a", camera_status="OK",
    )
    first_state = service.ingest_vision(first)
    assert service.ingest_vision(first)["revision"] == first_state["revision"]

    clock[0] = NOW + timedelta(seconds=1)
    second = to_vision_payload(
        frame({"class": "dog", "confidence": 0.87}, at=clock[0]),
        vehicle_id="CAR_1", source_id="run-b", camera_status="OK",
    )
    second_state = service.ingest_vision(second)
    assert second_state["revision"] == first_state["revision"] + 1
    assert second.frame_id == "run-b:1"


def test_low_confidence_yolo_remains_suspected(tmp_path):
    from src.cabinsentinel.vision_adapter import to_vision_payload

    service = CabinService(tmp_path / "state.db", clock=lambda: NOW)
    service.ingest_sensor(SensorPayload(
        vehicle_id="CAR_1", timestamp=NOW, sequence=1,
        temperature=39, engine_status="OFF", doors_locked=True,
        radar_presence=False,
    ))
    payload = to_vision_payload(
        frame({"class": "person", "confidence": 0.29}),
        vehicle_id="CAR_1", source_id="run-a", camera_status="OK",
    )
    state = service.ingest_vision(payload)
    assert state["occupancy_state"] == "SUSPECTED"
    assert state["risk_level"] == "WARNING"


def test_age_label_is_rejected_until_mapping_is_approved():
    from src.cabinsentinel.vision_adapter import to_vision_payload

    with pytest.raises(ValueError, match="age label"):
        to_vision_payload(
            frame({"class": "child", "confidence": 0.35,
                   "detector_confidence": 0.87}),
            vehicle_id="CAR_1", source_id="run-a", camera_status="OK",
        )


def test_missing_detector_output_cannot_be_treated_as_empty_cabin():
    from src.cabinsentinel.vision_adapter import to_vision_payload

    bad_frame = frame()
    bad_frame.pop("detections")
    with pytest.raises(ValueError, match="detections"):
        to_vision_payload(
            bad_frame, vehicle_id="CAR_1", source_id="run-a", camera_status="OK",
        )


@pytest.mark.parametrize("confidence", [-0.01, 1.01, None, "bad"])
def test_invalid_confidence_is_rejected(confidence):
    from src.cabinsentinel.vision_adapter import to_vision_payload

    with pytest.raises(ValueError):
        to_vision_payload(
            frame({"class": "person", "confidence": confidence}),
            vehicle_id="CAR_1", source_id="run-a", camera_status="OK",
        )


@pytest.mark.parametrize("frame_id", [None, 0, -1, True, "1"])
def test_invalid_frame_id_is_rejected(frame_id):
    from src.cabinsentinel.vision_adapter import to_vision_payload

    with pytest.raises(ValueError, match="frame_id"):
        to_vision_payload(
            frame({"class": "person", "confidence": 0.8}, frame_id=frame_id),
            vehicle_id="CAR_1", source_id="run-a", camera_status="OK",
        )


def test_missing_timestamp_is_rejected():
    from src.cabinsentinel.vision_adapter import to_vision_payload

    bad_frame = frame()
    bad_frame.pop("timestamp")
    with pytest.raises(ValueError):
        to_vision_payload(
            bad_frame, vehicle_id="CAR_1", source_id="run-a", camera_status="OK",
        )


@pytest.mark.parametrize("label", ["unknown", "backpack", ["person"]])
def test_unapproved_or_invalid_label_is_rejected(label):
    from src.cabinsentinel.vision_adapter import to_vision_payload

    with pytest.raises(ValueError, match="unsupported detector class"):
        to_vision_payload(
            frame({"class": label, "confidence": 0.8}),
            vehicle_id="CAR_1", source_id="run-a", camera_status="OK",
        )


def test_stale_detector_frame_cannot_produce_current_risk(tmp_path):
    from src.cabinsentinel.vision_adapter import to_vision_payload

    service = CabinService(tmp_path / "state.db", clock=lambda: NOW)
    service.ingest_sensor(SensorPayload(
        vehicle_id="CAR_1", timestamp=NOW, sequence=1,
        temperature=39, engine_status="OFF", doors_locked=True,
        radar_presence=False,
    ))
    stale = to_vision_payload(
        frame({"class": "person", "confidence": 0.9}, at=NOW - timedelta(seconds=10)),
        vehicle_id="CAR_1", source_id="run-a", camera_status="OK",
    )
    state = service.ingest_vision(stale)
    assert state["risk_level"] == "ERROR"
    assert state["occupancy_state"] == "UNKNOWN"
    assert service.get_state_with_freshness("CAR_1")["decision_current"] is False
