from datetime import timedelta
from types import SimpleNamespace

import pytest

import src.main as main
from src.cabinsentinel.service import CabinService
from tests.test_alert_incidents import occupied
from tests.test_cabinsentinel import NOW, sensor, vision


def test_resolution_requires_current_revision_fresh_empty_evidence_and_explicit_check(tmp_path):
    clock = [NOW]
    service = CabinService(tmp_path / "state.db", clock=lambda: clock[0])
    first = occupied(service, clock)
    with pytest.raises(ValueError):
        service.resolve("CAR_1", first["incident_id"], first["revision"])
    clock[0] += timedelta(seconds=1)
    service.ingest_sensor(sensor(at=clock[0], sequence=2))
    current = service.ingest_vision(vision([], at=clock[0], frame_id="empty"))
    with pytest.raises(ValueError):
        service.resolve("CAR_1", first["incident_id"], first["revision"])
    done = service.resolve("CAR_1", first["incident_id"], current["revision"])
    assert done["incident"]["status"] == "RESOLVED"
    assert done["risk_level"] == "SAFE"
    assert done["risk_route"] == "safe"
    assert done["unlock_request"] is None
    assert done["alert"]["stage"] == "RESOLVED"
    assert service.resolve("CAR_1", first["incident_id"], current["revision"]) == done
    clock[0] += timedelta(seconds=1)
    reopened = occupied(service, clock, seq=3)
    assert reopened["incident_id"] != first["incident_id"]
    assert reopened["incident"]["status"] == "OPEN"


def test_restart_does_not_replay_notifications_and_clock_regression_is_explicit(tmp_path):
    clock = [NOW]
    db = tmp_path / "state.db"
    service = CabinService(db, clock=lambda: clock[0])
    first = occupied(service, clock)
    clock[0] += timedelta(seconds=60)
    sent = service.tick("CAR_1")
    count = len(service.events("CAR_1", event_type="action_result", limit=500))
    restarted = CabinService(db, clock=lambda: clock[0])
    restarted.tick("CAR_1")
    assert len(restarted.events("CAR_1", event_type="action_result", limit=500)) == count
    clock[0] = NOW + timedelta(seconds=10)
    regressed = restarted.tick("CAR_1")
    assert regressed["alert"]["temporal_status"] == "UNKNOWN_CLOCK_REGRESSION"
    assert regressed["incident_id"] == first["incident_id"]
    assert regressed["alert"]["next_repeat_at"] == sent["alert"]["next_repeat_at"]


@pytest.mark.asyncio
async def test_http_only_lifespan_starts_and_stops_safety_timer(monkeypatch, tmp_path):
    # The API must tick independently from an MQTT subscriber.
    monkeypatch.setattr(
        main,
        "get_settings",
        lambda: SimpleNamespace(model_path="", model_confidence=0.25, cabinsentinel_mqtt_enabled=False),
    )
    service = CabinService(tmp_path / "state.db")
    monkeypatch.setattr(main, "get_cabin_service", lambda: service)
    async with main.lifespan(main.app):
        timer = getattr(main.app.state, "safety_timer", None)
        assert timer is not None and timer.running
        assert main.app.state.sensor_subscriber is None
    assert not timer.running


def test_interrupted_action_is_reported_unknown_and_never_replayed(tmp_path):
    clock = [NOW]

    class InterruptedAction:
        def execute(self, tool, vehicle_id):
            raise KeyboardInterrupt()

    service = CabinService(tmp_path / "state.db", clock=lambda: clock[0], actions=InterruptedAction())
    service.ingest_sensor(sensor())
    with pytest.raises(KeyboardInterrupt):
        service.ingest_vision(vision([{"class_name": "dog", "confidence": 0.9}]))
    reopened = CabinService(tmp_path / "state.db", clock=lambda: clock[0])
    state = reopened.get_state_with_freshness("CAR_1")
    assert state["action_ledger"][0]["status"] == "attempted"
    assert state["action_ledger"][0]["outcome"] == "unknown"
    reopened.tick("CAR_1")
    assert reopened.events("CAR_1", event_type="action_result") == []


@pytest.mark.asyncio
async def test_health_reports_safety_timer_failure(monkeypatch, tmp_path):
    from httpx import ASGITransport, AsyncClient

    from src.cabinsentinel.api import get_cabin_service

    service = CabinService(tmp_path / "state.db")
    main.app.dependency_overrides[get_cabin_service] = lambda: service
    monkeypatch.setattr(main.app.state, "vision_provider", object(), raising=False)
    monkeypatch.setattr(
        main.app.state,
        "safety_timer",
        SimpleNamespace(running=True, last_error="OperationalError", last_tick_at=NOW.isoformat()),
        raising=False,
    )
    try:
        async with AsyncClient(transport=ASGITransport(app=main.app), base_url="http://test") as c:
            response = await c.get("/health")
        assert response.status_code == 503
        assert response.json()["safety_timer"] == "degraded"
    finally:
        main.app.dependency_overrides.clear()


def test_two_services_cannot_repeat_one_due_alert_twice(tmp_path):
    from concurrent.futures import ThreadPoolExecutor

    clock = [NOW]
    db = tmp_path / "state.db"
    first = CabinService(db, clock=lambda: clock[0])
    occupied(first, clock)
    second = CabinService(db, clock=lambda: clock[0])
    clock[0] += timedelta(seconds=60)
    with ThreadPoolExecutor(2) as pool:
        list(pool.map(lambda service: service.tick("CAR_1"), [first, second]))
    notifications = [
        event
        for event in first.events("CAR_1", event_type="action_result", limit=500)
        if event["tool"] == "send_notification"
    ]
    assert len(notifications) == 2  # initial plus one repeat
    assert len({event["action_key"] for event in notifications}) == 2
    assert first.get_state("CAR_1")["alert"]["repeat_count"] == 1
