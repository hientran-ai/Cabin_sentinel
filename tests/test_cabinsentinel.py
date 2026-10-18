"""Sprint 0 contracts for Khanh's sensor, API, and reasoning module."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from src.cabinsentinel.api import get_cabin_service
from src.cabinsentinel.models import SensorPayload, VisionPayload
from src.cabinsentinel.rules import decide
from src.cabinsentinel.service import CabinService
from src.main import app

NOW = datetime(2026, 9, 23, 5, 0, tzinfo=UTC)


def sensor(temp=30.0, *, at=NOW, radar=False, engine="OFF", sequence=1, **extra):
    return SensorPayload(
        vehicle_id="CAR_1",
        timestamp=at,
        sequence=sequence,
        temperature=temp,
        engine_status=engine,
        doors_locked=True,
        radar_presence=radar,
        **extra,
    )


def vision(objects=None, *, at=NOW, frame_id="frame-1", status="OK"):
    return VisionPayload(
        vehicle_id="CAR_1",
        timestamp=at,
        frame_id=frame_id,
        camera_status=status,
        detected_objects=objects if objects is not None else [],
    )


def test_sensor_update_reassesses_risk_without_another_vision_frame(tmp_path):
    clock = [NOW]
    service = CabinService(tmp_path / "state.db", clock=lambda: clock[0])
    service.ingest_sensor(sensor(30.0))
    first = service.ingest_vision(vision([{"class_name": "dog", "confidence": 0.9}]))
    assert first["risk_level"] == "WARNING"

    clock[0] = NOW + timedelta(seconds=1)
    updated = service.ingest_sensor(sensor(35.0, at=clock[0], sequence=2))
    assert updated["risk_level"] == "CRITICAL"
    assert updated["previous_risk_level"] == "WARNING"
    assert updated["revision"] == first["revision"] + 1
    assert sorted(updated["actions"]) == ["request_unlock", "send_sms", "trigger_horn"]
    assert sorted(x["status"] for x in updated["action_results"]) == ["pending_human_confirmation", "simulated", "simulated"]


def test_duplicate_and_older_sensor_packets_do_not_repeat_actions(tmp_path):
    service = CabinService(tmp_path / "state.db", clock=lambda: NOW)
    service.ingest_vision(vision([{"class_name": "dog", "confidence": 0.9}]))
    critical = service.ingest_sensor(sensor(35.0, sequence=2))
    duplicate = service.ingest_sensor(sensor(35.0, sequence=2))
    older = service.ingest_sensor(sensor(38.0, sequence=1))
    assert duplicate == critical == older
    results = service.events("CAR_1", event_type="action_result")
    assert sum(event["status"] == "simulated" for event in results) == 2
    assert sum(event["status"] == "pending_human_confirmation" for event in results) == 1


def test_stale_vision_never_combines_with_new_hot_sensor(tmp_path):
    clock = [NOW]
    service = CabinService(tmp_path / "state.db", clock=lambda: clock[0])
    service.ingest_sensor(sensor(30.0))
    service.ingest_vision(vision([{"class_name": "dog", "confidence": 0.9}]))
    clock[0] = NOW + timedelta(seconds=4)
    state = service.ingest_sensor(sensor(39.0, at=clock[0], sequence=2))
    assert state["risk_level"] == "ERROR"
    assert state["actions"] == []


def test_radar_fallback_is_warning_at_25_degrees(tmp_path):
    service = CabinService(tmp_path / "state.db", clock=lambda: NOW)
    service.ingest_vision(vision([]))
    state = service.ingest_sensor(sensor(25.0, radar=True))
    assert state["risk_level"] == "WARNING"


def test_missing_temperature_is_rejected_instead_of_defaulted():
    with pytest.raises(ValueError):
        SensorPayload.model_validate(
            {
                "vehicle_id": "CAR_1", "timestamp": NOW.isoformat(),
                "engine_status": "OFF", "doors_locked": True,
                "radar_presence": False,
            }
        )


@pytest.mark.asyncio
async def test_vision_api_and_get_are_consistent_and_read_only(tmp_path):
    service = CabinService(tmp_path / "state.db", clock=lambda: NOW)
    service.ingest_sensor(sensor(35.0))
    app.dependency_overrides[get_cabin_service] = lambda: service
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/v1/vision", json={
                "vehicle_id": "CAR_1", "timestamp": NOW.isoformat(),
                "frame_id": "frame-1", "camera_status": "OK",
                "detected_objects": [{"class_name": "dog", "confidence": 0.9}],
            })
            assert response.status_code == 200
            state = response.json()
            assert state["risk_level"] == "CRITICAL"
            before = len(service.events("CAR_1"))
            got = await client.get("/api/v1/state/CAR_1")
            risk = await client.get("/api/v1/risk/CAR_1")
            assert got.json()["revision"] == risk.json()["revision"] == state["revision"]
            assert len(service.events("CAR_1")) == before
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_vision_api_accepts_team_contract_without_frame_id_and_dedupes(tmp_path):
    service = CabinService(tmp_path / "state.db", clock=lambda: NOW)
    service.ingest_sensor(sensor(35.0))
    app.dependency_overrides[get_cabin_service] = lambda: service
    payload = {
        "vehicle_id": "CAR_1", "timestamp": NOW.isoformat(),
        "camera_status": "OK",
        "detected_objects": [{"class": "dog", "confidence": 0.9}],
    }
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            first = await client.post("/api/v1/vision", json=payload)
            second = await client.post("/api/v1/vision", json=payload)
            assert first.status_code == 200
            assert second.status_code == 200
            assert first.json()["risk_level"] == "CRITICAL"
            assert second.json()["revision"] == first.json()["revision"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_vision_api_accepts_prd_objects_field(tmp_path):
    service = CabinService(tmp_path / "state.db", clock=lambda: NOW)
    service.ingest_sensor(sensor(35.0))
    app.dependency_overrides[get_cabin_service] = lambda: service
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/v1/vision", json={
                "vehicle_id": "CAR_1", "timestamp": NOW.isoformat(),
                "camera_status": "OK",
                "objects": [{"class": "dog", "confidence": 0.9, "bbox": [0, 0, 20, 20]}],
            })
            assert response.status_code == 200
            assert response.json()["risk_level"] == "CRITICAL"
    finally:
        app.dependency_overrides.clear()


def test_reopening_service_preserves_decision_without_replaying_actions(tmp_path):
    db = tmp_path / "state.db"
    service = CabinService(db, clock=lambda: NOW)
    service.ingest_sensor(sensor(35.0))
    critical = service.ingest_vision(vision([{"class_name": "dog", "confidence": 0.9}]))
    count = len(service.events("CAR_1", event_type="action_result"))
    restarted = CabinService(db, clock=lambda: NOW)
    assert restarted.get_state("CAR_1") == critical
    assert len(restarted.events("CAR_1", event_type="action_result")) == count


def test_timer_marks_vision_stale_without_any_new_packet(tmp_path):
    clock = [NOW]
    service = CabinService(tmp_path / "state.db", clock=lambda: clock[0])
    service.ingest_sensor(sensor(
        25.0, engine="ON", gear="D", vehicle_speed_kph=30,
        driver_present=True, hvac_status="ACTIVE",
    ))
    safe = service.ingest_vision(vision([{"class_name": "person", "confidence": 0.9}]))
    assert safe["risk_level"] == "SAFE"
    clock[0] = NOW + timedelta(seconds=4)
    stale = service.tick("CAR_1")
    assert stale["risk_level"] == "ERROR"
    assert stale["previous_risk_level"] == "SAFE"
    assert stale["revision"] == safe["revision"] + 1


def test_group_sensor_simulator_publishes_valid_versioned_snapshot():
    from scripts.cabinsentinel_sensor_simulator import build_payload

    payload = build_payload(
        vehicle_id="CAR_1", timestamp=NOW, sequence=7,
        temperature=35.0, engine_status="OFF", doors_locked=True,
        radar_presence=True,
    )
    parsed = SensorPayload.model_validate(payload)
    assert parsed.vehicle_id == "CAR_1"
    assert parsed.schema_version == 1
    assert parsed.sequence == 7
    assert parsed.temperature == 35.0


def test_simulator_can_publish_confirmed_ev_pet_mode():
    from scripts.cabinsentinel_sensor_simulator import build_payload

    payload = build_payload(
        vehicle_id="CAR_1", timestamp=NOW, sequence=8,
        temperature=28.0, engine_status="ON", doors_locked=True,
        radar_presence=False, powertrain_type="EV", operation_mode="PET",
        hvac_status="ACTIVE", battery_soc_pct=40,
    )
    assert SensorPayload.model_validate(payload).operation_mode == "PET"
    assert payload["hvac_status"] == "ACTIVE"


@pytest.mark.parametrize(
    ("temperature", "engine", "objects", "radar", "camera", "extras", "expected"),
    [
        (30, "ON", ["person"], False, "OK", {"gear": "D", "vehicle_speed_kph": 30, "driver_present": True, "hvac_status": "ACTIVE"}, "SAFE"),
        (30, "OFF", ["dog"], False, "OK", {}, "WARNING"),
        (35, "OFF", ["dog"], False, "OK", {}, "CRITICAL"),
        (28, "OFF", ["backpack"], False, "OK", {}, "NOTICE"),
        (30, "ON", ["person"], False, "BLOCKED", {}, "ERROR"),
        (25, "OFF", [], True, "OK", {}, "WARNING"),
        (28, "ON", ["dog"], False, "OK", {"powertrain_type": "EV", "operation_mode": "PET", "hvac_status": "ACTIVE", "battery_soc_pct": 40}, "WARNING"),
        (28, "ON", ["person"], False, "OK", {"powertrain_type": "EV", "operation_mode": "CAMP", "hvac_status": "ACTIVE", "battery_soc_pct": 40}, "WARNING"),
        (28, "ON", ["dog"], False, "OK", {"powertrain_type": "ICE", "operation_mode": "REMOTE_START", "hvac_status": "ACTIVE"}, "WARNING"),
        (28, "ON", ["dog"], False, "OK", {"powertrain_type": "ICE", "driver_present": False}, "WARNING"),
    ],
)
def test_rule_matrix(temperature, engine, objects, radar, camera, extras, expected):
    sensor_data = sensor(temperature, engine=engine, radar=radar, **extras).model_dump(mode="json")
    vision_data = vision(
        [{"class_name": name, "confidence": 0.9} for name in objects],
        status=camera,
    ).model_dump(mode="json")
    assert decide(sensor_data, vision_data, NOW)["risk_level"] == expected


def test_critical_cooling_cancels_pending_unlock_and_audits_it(tmp_path):
    clock = [NOW]
    service = CabinService(tmp_path / "state.db", clock=lambda: clock[0])
    service.ingest_vision(vision([{"class_name": "dog", "confidence": 0.9}]))
    critical = service.ingest_sensor(sensor(35.0))
    assert critical["unlock_request"]["status"] == "pending"

    clock[0] = NOW + timedelta(seconds=1)
    warning = service.ingest_sensor(sensor(34.0, at=clock[0], sequence=2))
    assert warning["risk_level"] == "WARNING"
    assert warning["unlock_request"]["status"] == "canceled"
    assert warning["unlock_request"]["request_id"] == critical["unlock_request"]["request_id"]
    assert service.events("CAR_1", event_type="unlock_request")[0]["status"] == "canceled"
    restarted = CabinService(tmp_path / "state.db", clock=lambda: clock[0])
    assert restarted.get_state("CAR_1")["unlock_request"]["status"] == "canceled"


def test_remote_start_deadline_escalates_notification_once(tmp_path):
    clock = [NOW]
    service = CabinService(tmp_path / "state.db", clock=lambda: clock[0])
    service.ingest_vision(vision([{"class_name": "dog", "confidence": 0.9}]))
    deadline = NOW + timedelta(seconds=122)
    base = {
        "powertrain_type": "ICE", "operation_mode": "REMOTE_START",
        "hvac_status": "ACTIVE", "remote_start_expires_at": deadline,
    }
    first = service.ingest_sensor(sensor(28, engine="ON", **base))
    assert first["rule_id"] == "ICE_REMOTE_START_OCCUPIED"

    clock[0] = NOW + timedelta(seconds=2)
    escalated = service.ingest_sensor(sensor(28, at=clock[0], engine="ON", sequence=2, **base))
    assert escalated["risk_level"] == "WARNING"
    assert escalated["rule_id"] == "ICE_REMOTE_START_EXPIRING"
    assert len(service.events("CAR_1", event_type="action_result")) == 2
    service.ingest_sensor(sensor(28, at=clock[0] + timedelta(milliseconds=100), engine="ON", sequence=3, **base))
    assert len(service.events("CAR_1", event_type="action_result")) == 2


def test_pending_unlock_expires_at_sixty_seconds(tmp_path):
    clock = [NOW]
    service = CabinService(tmp_path / "state.db", clock=lambda: clock[0])
    service.ingest_vision(vision([{"class_name": "dog", "confidence": 0.9}]))
    critical = service.ingest_sensor(sensor(35))
    assert critical["unlock_request"]["status"] == "pending"
    clock[0] = NOW + timedelta(seconds=60)
    state = service.tick("CAR_1")
    assert state["risk_level"] == "ERROR"
    assert state["unlock_request"]["status"] == "expired"


@pytest.mark.asyncio
async def test_health_is_degraded_when_mqtt_is_disconnected():
    app.state.sensor_subscriber = SimpleNamespace(connected=False)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/health")
        assert response.status_code == 503
        assert response.json()["status"] == "degraded"
        assert response.json()["mqtt"] == "disconnected"
    finally:
        del app.state.sensor_subscriber
