"""Demo studio: an administrator drives the simulated fleet from the web and the whole chain reacts."""

from datetime import timedelta

import pytest

from src.cabinsentinel import demo_studio
from src.cabinsentinel.demo_studio import DemoStudio
from src.config import Settings
from tests.test_platform_api import auth, make_admin, user_token

VEHICLE = "VF8-DEMO-01"


@pytest.fixture
def studio(env):
    demo_studio._studio = DemoStudio(env.fleet, env.store)
    yield demo_studio._studio
    demo_studio._studio = None


def test_only_a_platform_admin_can_use_it_and_it_can_be_off(env):
    assert env.client.get("/api/v1/admin/demo/status", headers=auth(make_admin(env))).status_code == 404  # disabled
    owner = user_token(env, "o@example.com")
    assert env.client.get("/api/v1/admin/demo/status").status_code == 401
    assert env.client.get("/api/v1/admin/demo/status", headers=auth(owner)).status_code == 403
    assert env.client.post("/api/v1/admin/demo/run", json={"vehicle_id": VEHICLE, "scenario": "CRITICAL"}, headers=auth(owner)).status_code == 403


def test_critical_to_assign_to_action_to_resolved(env, studio):
    admin = make_admin(env)
    status = env.client.get("/api/v1/admin/demo/status", headers=auth(admin)).json()
    assert status["label"] == "SIMULATED" and {v["vehicle_id"] for v in status["vehicles"]} >= {VEHICLE}
    assert {s["id"] for s in status["scenarios"]} == {"SAFE", "WARNING", "CRITICAL", "RAMP", "VIDEO", "OFFLINE"}

    run = env.client.post("/api/v1/admin/demo/run", json={"vehicle_id": VEHICLE, "scenario": "CRITICAL"}, headers=auth(admin)).json()
    assert run["label"] == "SIMULATED" and run["risk_level"] == "CRITICAL" and run["data_source"] == "SIMULATED"

    queue = env.client.get("/api/v1/ops/incidents?status=OPEN", headers=auth(admin)).json()["items"]
    incident = next(i for i in queue if i["vehicle_id"] == VEHICLE)
    assert incident["risk_level"] == "CRITICAL" and incident["ops"]["ops_status"] == "NEW"

    body = {"vehicle_id": VEHICLE, "version": incident["ops"]["version"], "assignee": "operator-1"}
    assigned = env.client.post(f"/api/v1/ops/incidents/{incident['incident_id']}/assign", json=body, headers=auth(admin))
    assert assigned.status_code == 200 and assigned.json()["ops_status"] == "ASSIGNED"

    horn = env.client.post(f"/api/v1/vehicles/{VEHICLE}/commands", json={"type": "horn", "incident_id": incident["incident_id"]}, headers=auth(admin))
    assert horn.status_code == 201
    confirmed = env.client.post(f"/api/v1/commands/{horn.json()['command_id']}/confirm", headers=auth(admin))
    assert confirmed.status_code == 200 and confirmed.json()["status"] == "authorized"

    # The cabin is not empty yet, so the incident cannot be closed.
    state = env.client.get(f"/api/v1/vehicles/{VEHICLE}/state", headers=auth(admin)).json()
    blocked = env.client.post(f"/api/v1/vehicles/{VEHICLE}/incidents/{incident['incident_id']}/resolve",
                              json={"revision": state["revision"], "cabin_checked": True}, headers=auth(admin))
    assert blocked.status_code in {409, 422}

    env.clock[0] += timedelta(seconds=1)  # time passes between two button presses; equal timestamps would be dropped as stale
    env.client.post("/api/v1/admin/demo/run", json={"vehicle_id": VEHICLE, "scenario": "SAFE"}, headers=auth(admin))
    state = env.client.get(f"/api/v1/vehicles/{VEHICLE}/state", headers=auth(admin)).json()
    done = env.client.post(f"/api/v1/vehicles/{VEHICLE}/incidents/{incident['incident_id']}/resolve",
                           json={"revision": state["revision"], "cabin_checked": True}, headers=auth(admin))
    assert done.status_code == 200, done.text
    actions = {e["action"] for e in env.client.get("/api/v1/admin/audit", headers=auth(admin)).json()["entries"]}
    assert {"demo.run", "incident.assign", "command.request", "incident.resolve"} <= actions


def test_offline_never_looks_empty_and_reset_gives_a_clean_slate(env, studio):
    admin = make_admin(env)
    env.client.post("/api/v1/admin/demo/run", json={"vehicle_id": "VF9-DEMO-02", "scenario": "CRITICAL"}, headers=auth(admin))
    assert env.client.post("/api/v1/admin/demo/run", json={"vehicle_id": "nope", "scenario": "SAFE"}, headers=auth(admin)).status_code == 404
    assert env.client.post("/api/v1/admin/demo/run", json={"vehicle_id": VEHICLE, "scenario": "BOGUS"}, headers=auth(admin)).status_code == 422
    reset = env.client.post("/api/v1/admin/demo/reset", headers=auth(admin)).json()
    assert reset["label"] == "SIMULATED" and VEHICLE in reset["reset"]
    status = {v["vehicle_id"]: v for v in env.client.get("/api/v1/admin/demo/status", headers=auth(admin)).json()["vehicles"]}
    assert status[VEHICLE]["risk_level"] == "SAFE" and status["VF9-DEMO-02"]["scenario"] == "WARNING"
    assert env.client.get("/api/v1/ops/incidents?status=OPEN", headers=auth(admin)).json()["total"] == 1  # only the default WARNING one
    studio.scenario[VEHICLE] = "OFFLINE"
    studio.tick()                                   # publishes nothing for an offline vehicle
    assert env.service.get_state(VEHICLE)["risk_level"] == "SAFE"  # untouched: staleness is the safety timer's job, never 'empty'


def test_api_docs_are_closed_in_production_and_open_in_development():
    prod = Settings(app_env="production", cors_origins="https://app.example.com")
    assert prod.api_docs_enabled is False
    assert Settings(app_env="development").api_docs_enabled is True
    assert Settings(app_env="production", cors_origins="https://app.example.com", docs_enabled=True).api_docs_enabled is True


def test_storage_report_says_when_data_would_not_survive_a_restart(tmp_path, monkeypatch):
    from src.cabinsentinel import capabilities
    from src.config import get_settings
    monkeypatch.setattr(get_settings(), "storage_persistent", None)
    ephemeral = capabilities.storage(str(tmp_path / "x.db"))
    assert ephemeral["persistent"] is False and "Persistent Storage" in ephemeral["note"]
    monkeypatch.setattr(get_settings(), "storage_persistent", True)
    assert capabilities.storage(str(tmp_path / "x.db")) == {"persistent": True, "path_kind": "volume", "note": None}


def test_status_survives_a_video_stopped_while_it_is_read(studio):
    class StoppedMidRead(dict):  # the run is there for the membership test, popped before the item is read
        def __contains__(self, key):
            return True

        def __getitem__(self, key):
            raise KeyError(key)

    studio.video = StoppedMidRead()
    assert studio.vehicle_status(VEHICLE)["video"] is None
