"""Owner, admin/fleet, device ingest and guardian flows over real HTTP routing + SQLite."""

from datetime import timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from src.cabinsentinel import fleet_api
from src.cabinsentinel.api import get_cabin_service
from src.cabinsentinel.fleet import Fleet
from src.cabinsentinel.models import SensorPayload
from src.cabinsentinel.service import CabinService
from src.main import app
from tests.fleet_helpers import NOW, sensor, vision

DEVICE = "test-device-token"


@pytest.fixture
def env(tmp_path, monkeypatch):
    clock = [NOW]
    service = CabinService(tmp_path / "fleet.db", clock=lambda: clock[0])
    fleet = Fleet(service, device_token=DEVICE, device_source="SIMULATED")
    app.dependency_overrides[fleet_api.get_fleet] = lambda: fleet
    app.dependency_overrides[get_cabin_service] = lambda: service
    monkeypatch.setattr(fleet_api, "get_fleet", lambda: fleet)
    client = TestClient(app)
    yield SimpleNamespace(client=client, service=service, fleet=fleet, clock=clock)
    app.dependency_overrides.clear()
    service._db.close()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def login(client, role, subject=None):
    response = client.post("/api/v1/auth/demo-login", json={"role": role, **({"subject": subject} if subject else {})})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def feed(env, vehicle_id, scenario, step):
    when = env.clock[0]
    s = env.client.post(f"/api/v1/vehicles/{vehicle_id}/sensors", json=sensor(vehicle_id, when, step, scenario), headers=auth(DEVICE))
    v = env.client.post(f"/api/v1/vehicles/{vehicle_id}/vision", json=vision(vehicle_id, when, step, scenario), headers=auth(DEVICE))
    assert s.status_code == 200 and v.status_code == 200, (s.text, v.text)
    return s.json(), v.json()


def test_vehicle_list_requires_token_and_is_scoped_by_role(env):
    assert env.client.get("/api/v1/vehicles").status_code == 401
    assert env.client.get("/api/v1/vehicles", headers=auth("nope")).status_code == 403
    owner = login(env.client, "owner", "demo-owner")
    admin = login(env.client, "admin")
    owned = [v["vehicle_id"] for v in env.client.get("/api/v1/vehicles", headers=auth(owner)).json()["vehicles"]]
    everything = [v["vehicle_id"] for v in env.client.get("/api/v1/vehicles", headers=auth(admin)).json()["vehicles"]]
    assert owned == ["VF8-DEMO-01", "VF9-DEMO-02"]
    assert everything == ["VF8-DEMO-01", "VF9-DEMO-02", "VF5-DEMO-03", "VF3-DEMO-04"]
    # Another owner's vehicle answers like an unknown one.
    assert env.client.get("/api/v1/vehicles/VF5-DEMO-03/state", headers=auth(owner)).status_code == 403
    assert env.client.get("/api/v1/vehicles/NOPE/state", headers=auth(owner)).status_code == 403


def test_vehicle_without_data_is_unknown_not_safe(env):
    admin = login(env.client, "admin")
    summary = env.client.get("/api/v1/vehicles", headers=auth(admin)).json()["vehicles"][0]
    assert summary["risk_level"] is None and summary["decision_current"] is False and summary["online"] is False
    state = env.client.get("/api/v1/vehicles/VF8-DEMO-01/state", headers=auth(admin)).json()
    assert state["risk"] is None and state["data_quality"]["status"] == "UNKNOWN"


@pytest.mark.parametrize(("scenario", "risk", "rule"), [
    ("NO_OCCUPANT_DETECTION", "ERROR", "OCCUPANCY_UNVERIFIED"),
    ("WARNING", "WARNING", "COOL_OCCUPANT"),
    ("CRITICAL", "CRITICAL", "HOT_OCCUPANT"),
])
def test_simulated_sensors_reach_deterministic_rules(env, scenario, risk, rule):
    feed(env, "VF8-DEMO-01", scenario, 1)
    owner = login(env.client, "owner", "demo-owner")
    state = env.client.get("/api/v1/vehicles/VF8-DEMO-01/state", headers=auth(owner)).json()
    assert state["risk"]["risk_level"] == risk and state["risk"]["rule_id"] == rule
    assert state["risk"]["decision_current"] is True
    assert state["sensors"]["ignition"] == "off" and state["sensors"]["door"] == "locked"
    assert state["sensors"]["status"] == "FRESH" and state["vision"]["status"] == "FRESH"
    assert state["data_source"] == "SIMULATED" and state["online"] is True
    assert rule in state["explanation"]


def test_critical_actions_are_simulated_and_unlock_waits_for_a_human(env):
    _, vision_result = feed(env, "VF8-DEMO-01", "CRITICAL", 1)
    statuses = {a["tool"]: a["status"] for a in vision_result["actions"]}
    assert statuses == {"trigger_horn": "simulated", "send_sms": "simulated", "request_unlock": "pending_human_confirmation"}
    admin = login(env.client, "admin")
    summary = env.client.get("/api/v1/vehicles", headers=auth(admin)).json()["vehicles"][0]
    assert summary["active_incident"] and summary["alert_count"] == 1
    assert summary["occupancy"] == {"state": "PRESENT", "counts": {"person": 1}}
    assert summary["temperature_c"] == 39.2 and summary["doors_locked"] is True


def test_replayed_sensor_and_frame_do_not_emit_actions_again(env):
    feed(env, "VF8-DEMO-01", "CRITICAL", 1)
    results = len(env.service.events("VF8-DEMO-01", event_type="action_result", limit=500))
    s, v = feed(env, "VF8-DEMO-01", "CRITICAL", 1)  # same sequence and frame id
    assert s["result"] == v["result"] == "DUPLICATE_OR_STALE" and s["actions"] == v["actions"] == []
    assert len(env.service.events("VF8-DEMO-01", event_type="action_result", limit=500)) == results


def test_stale_vehicle_becomes_unknown_never_safe(env):
    feed(env, "VF8-DEMO-01", "NO_OCCUPANT_DETECTION", 1)
    env.clock[0] += timedelta(seconds=11)
    env.service.tick("VF8-DEMO-01")
    admin = login(env.client, "admin")
    summary = env.client.get("/api/v1/vehicles", headers=auth(admin)).json()["vehicles"][0]
    assert summary["online"] is False and summary["decision_current"] is False
    assert summary["risk_level"] == "ERROR"
    state = env.client.get("/api/v1/vehicles/VF8-DEMO-01/state", headers=auth(admin)).json()
    assert state["explanation"].startswith("Current decision unavailable")


def test_device_and_role_boundaries(env):
    owner = login(env.client, "owner", "demo-owner")
    body = sensor("VF8-DEMO-01", NOW, 1, "NO_OCCUPANT_DETECTION")
    assert env.client.post("/api/v1/vehicles/VF8-DEMO-01/sensors", json=body, headers=auth(owner)).status_code == 403
    assert env.client.post("/api/v1/vehicles/NOPE/sensors", json={**body, "vehicle_id": "NOPE"}, headers=auth(DEVICE)).status_code == 403
    mismatch = env.client.post("/api/v1/vehicles/VF9-DEMO-02/sensors", json=body, headers=auth(DEVICE))
    assert mismatch.status_code == 422
    assert env.client.get("/api/v1/vehicles", headers=auth(DEVICE)).status_code == 403


def test_legacy_routes_no_longer_expose_fleet_vehicles_anonymously(env):
    feed(env, "VF8-DEMO-01", "NO_OCCUPANT_DETECTION", 1)
    assert env.client.get("/api/v1/state/VF8-DEMO-01").status_code == 401
    assert env.client.get("/api/v1/events/VF8-DEMO-01").status_code == 401
    anonymous_write = env.client.post("/api/v1/vision", json=vision("VF8-DEMO-01", NOW, 9, "NO_OCCUPANT_DETECTION"))
    assert anonymous_write.status_code == 401
    owner = login(env.client, "owner", "demo-owner")
    assert env.client.get("/api/v1/state/VF8-DEMO-01", headers=auth(owner)).status_code == 200
    # Unregistered legacy ids keep their previous behaviour.
    env.service.ingest_sensor(SensorPayload(**sensor("CAR_1", NOW, 1, "NO_OCCUPANT_DETECTION")))
    assert env.client.get("/api/v1/state/CAR_1").status_code == 200


def test_guardian_trip_flow(env):
    owner = login(env.client, "owner", "demo-owner")
    trip = env.client.post("/api/v1/vehicles/VF9-DEMO-02/trips", json={"label": "School pickup"}, headers=auth(owner)).json()
    guardian = trip.pop("guardian_token")
    url = f"/api/v1/guardian/trips/{trip['trip_id']}/child-status"
    status = env.client.get(url, headers=auth(guardian)).json()
    assert status["child_status"] == "UNKNOWN" and status["last_event"] is None
    assert status["confidence"] is None and status["identity_verified"] is False

    events = f"/api/v1/trips/{trip['trip_id']}/events"
    entered = env.client.post(events, json={"event": "entered_vehicle", "idempotency_key": "k1"}, headers=auth(owner)).json()
    replay = env.client.post(events, json={"event": "entered_vehicle", "idempotency_key": "k1"}, headers=auth(owner)).json()
    assert entered["result"] == "ACCEPTED" and replay["result"] == "DUPLICATE" and replay["event_id"] == entered["event_id"]
    status = env.client.get(url, headers=auth(guardian)).json()
    assert status["child_status"] == "INSIDE" and status["event_count"] == 1 and status["source"] == "MANUAL_CHECKIN"

    env.clock[0] += timedelta(seconds=30)
    env.client.post(events, json={"event": "exited_vehicle"}, headers=auth(owner))
    status = env.client.get(url, headers=auth(guardian)).json()
    assert status["child_status"] == "EXITED" and status["last_event"] == "exited_vehicle"
    assert [e["event_type"] for e in env.service.events("VF9-DEMO-02", limit=10)][:3] == ["trip_event", "trip_event", "trip_created"]

    # A guardian reads only its own trip and cannot write or browse the fleet.
    assert env.client.post(events, json={"event": "exited_vehicle"}, headers=auth(guardian)).status_code == 403
    assert env.client.get("/api/v1/vehicles", headers=auth(guardian)).status_code == 403
    other = env.client.post("/api/v1/vehicles/VF8-DEMO-01/trips", json={}, headers=auth(owner)).json()
    assert env.client.get(f"/api/v1/guardian/trips/{other['trip_id']}/child-status", headers=auth(guardian)).status_code == 403
    # Owners cannot open trips on vehicles they do not own.
    assert env.client.post("/api/v1/vehicles/VF5-DEMO-03/trips", json={}, headers=auth(owner)).status_code == 403


def test_demo_login_is_disabled_in_production(env, monkeypatch):
    monkeypatch.setattr(fleet_api, "get_settings", lambda: SimpleNamespace(app_env="production"))
    assert env.client.post("/api/v1/auth/demo-login", json={"role": "admin"}).status_code == 404


def test_health_reports_capabilities_without_secrets(env, monkeypatch):
    monkeypatch.delenv("AGE_MODEL_PATH", raising=False)
    for path in ("/health", "/ready"):
        body = env.client.get(path).json()
        caps = body["capabilities"]
        assert caps["age_classifier"] == {"available": False, "reason": "checkpoint_unavailable"}
        assert caps["privacy_model"]["method"] == "YUNET_SOFT_OVAL"
        assert caps["fleet"] == {"vehicles": 4, "device_ingest": True, "demo_login": True}
        assert DEVICE not in str(body)


def test_explanation_keeps_units_and_rule_ids(env):
    feed(env, "VF8-DEMO-01", "CRITICAL", 1)
    admin = login(env.client, "admin")
    text = env.client.get("/api/v1/vehicles/VF8-DEMO-01/state", headers=auth(admin)).json()["explanation"]
    assert text.startswith("Vehicle off; cabin 39.2°C; doors locked; 1 person detected")
    assert "HOT_OCCUPANT" in text
