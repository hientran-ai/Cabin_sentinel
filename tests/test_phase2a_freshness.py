"""Read-only freshness reporting for persisted CabinSentinel decisions."""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from src.cabinsentinel.api import get_cabin_service
from src.cabinsentinel.models import SensorPayload, VisionPayload
from src.cabinsentinel.service import CabinService
from src.main import app

NOW = datetime(2026, 9, 26, 3, 0, tzinfo=UTC)


@pytest.mark.asyncio
async def test_restart_get_marks_old_attended_safe_decision_stale_before_first_tick(tmp_path):
    clock = [NOW]
    path = tmp_path / "state.db"
    service = CabinService(path, clock=lambda: clock[0])
    service.ingest_sensor(SensorPayload(
        vehicle_id="CAR_1", timestamp=NOW, sequence=1,
        temperature=25, engine_status="ON", doors_locked=False,
        radar_presence=False, driver_present=True, gear="D",
        vehicle_speed_kph=30, hvac_status="ACTIVE",
    ))
    safe = service.ingest_vision(VisionPayload(
        vehicle_id="CAR_1", timestamp=NOW, frame_id="empty-1",
        camera_status="OK", detected_objects=[{"class_name": "person", "confidence": 0.9}],
    ))
    assert safe["risk_level"] == "SAFE"
    service._db.close()

    clock[0] = NOW + timedelta(seconds=10)
    restarted = CabinService(path, clock=lambda: clock[0])
    before_events = len(restarted.events("CAR_1"))
    app.dependency_overrides[get_cabin_service] = lambda: restarted
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            state_response = await client.get("/api/v1/state/CAR_1")
            risk_response = await client.get("/api/v1/risk/CAR_1")
        assert state_response.status_code == 200
        assert risk_response.status_code == 200
        state = state_response.json()
        risk = risk_response.json()
        assert state["risk_level"] == "SAFE"  # committed history remains unchanged
        assert state["decision_current"] is False
        assert state["freshness"]["sensor"]["status"] == "STALE"
        assert state["freshness"]["vision"]["status"] == "STALE"
        assert state["freshness"]["sensor"]["age_s"] == 10
        assert state["freshness"]["vision"]["age_s"] == 10
        assert risk["decision_current"] is False
        assert risk["freshness"] == state["freshness"]
        assert restarted.get_state("CAR_1") == safe
        assert len(restarted.events("CAR_1")) == before_events
        assert restarted.events("CAR_1", event_type="action_result") == []
    finally:
        app.dependency_overrides.clear()


def test_old_orientation_is_stale_even_with_fresh_vision_frame():
    service = CabinService(":memory:", clock=lambda: NOW)
    service.ingest_sensor(SensorPayload(
        vehicle_id="CAR_1", timestamp=NOW, sequence=1,
        temperature=25, engine_status="OFF", doors_locked=True,
        radar_presence=False,
    ))
    service.ingest_vision(VisionPayload.model_validate({
        "vehicle_id": "CAR_1", "timestamp": NOW, "frame_id": "seat-1",
        "camera_status": "OK", "detected_objects": [],
        "seat_evidence": [{
            "evidence_id": "s1", "child_seat_present": True,
            "seat_orientation": "REAR_FACING", "observed_at": NOW - timedelta(seconds=4),
            "source": "camera0", "quality": "OK",
        }],
    }))
    state = service.get_state_with_freshness("CAR_1")
    assert state["decision_current"] is True
    assert state["freshness"]["vision"]["status"] == "FRESH"
    assert state["freshness"]["orientation"]["status"] == "STALE"
    assert state["seat_configuration_state"] == "NOT_ENOUGH_EVIDENCE"
