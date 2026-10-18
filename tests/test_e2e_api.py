"""V1 E2E API: provenance, idempotency, freshness, notification delivery and audit.

These use a fake detector, so they are integration tests of the service boundary, not evidence
that the real model works. The real-model path is covered by tests/test_e2e_real_model.py.
"""

from datetime import timedelta
from io import BytesIO

import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image

from src.cabinsentinel import e2e_api
from src.cabinsentinel.actions import DemoActions
from src.cabinsentinel.api import get_cabin_service
from src.cabinsentinel.service import CabinService
from src.main import app
from tests.test_cabinsentinel import NOW

HOT_PARKED = {
    "temperature": 40.0, "engine_status": "OFF", "doors_locked": True, "radar_presence": False,
    "driver_present": False, "gear": "P", "vehicle_speed_kph": 0.0, "hvac_status": "INACTIVE", "window_status": "CLOSED",
}


def png(fmt="PNG"):
    out = BytesIO()
    Image.new("RGB", (32, 32)).save(out, format=fmt)
    return out.getvalue()


class Fake:
    def __init__(self):
        self.objects = [{"class": "dog", "confidence": 0.9, "bbox": [1, 1, 20, 20]}]
        self.calls = 0

    def infer(self, image):
        self.calls += 1
        return {"timestamp": "ignored", "frame_id": 1, "detections": list(self.objects), "latency_ms": 12.5,
                "detector_latency_ms": 11.0, "age_latency_ms": 0.0, "age_classifier": {"status": "disabled"}}


@pytest.fixture
def env(tmp_path):
    clock = [NOW]
    service = CabinService(tmp_path / "e2e.db", clock=lambda: clock[0], actions=DemoActions())
    fake = Fake()
    app.dependency_overrides[get_cabin_service] = lambda: service
    e2e_api._session_times.clear()  # the per-minute creation limit is process-wide; each test starts with a clean window
    previous = getattr(app.state, "vision_provider", None)
    app.state.vision_provider = fake
    yield service, clock, fake
    app.dependency_overrides.pop(get_cabin_service, None)
    app.state.vision_provider = previous


async def new_session(client):
    created = (await client.post("/api/v1/e2e/sessions")).json()
    return created["session_id"], {"Authorization": "Bearer " + created["session_token"]}


async def frame(client, sid, headers, fid, *, age_ms=0, data=None, mime="image/png"):
    return await client.post(
        f"/api/v1/e2e/sessions/{sid}/observations", headers=headers,
        data={"frame_id": fid, "capture_age_ms": str(age_ms), "source": "CLIP_FRAME", "source_label": "unit clip"},
        files={"image": ("f.png", png() if data is None else data, mime)},
    )


def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_pipeline_commit_provenance_and_read_only_get(env):
    service, clock, fake = env
    async with client() as c:
        sid, h = await new_session(c)
        assert (await c.post(f"/api/v1/e2e/sessions/{sid}/sensor", headers=h, json=HOT_PARKED)).status_code == 200
        r = (await frame(c, sid, h, "f1", age_ms=120)).json()
        assert r["accepted"] and not r["replayed"] and fake.calls == 1
        assert r["vision"]["source"] == "MODEL_INFERENCE"
        # observed_at is the capture time (received minus the reported age), not the commit time
        assert r["observed_at"] == (NOW - timedelta(milliseconds=120)).isoformat() and r["received_at"] == NOW.isoformat()
        assert r["timings_ms"]["infer_detector"] == 11.0 and r["committed"]["risk_level"] == "CRITICAL"
        url = f"/api/v1/e2e/sessions/{sid}/state"
        before = (await c.get(url, headers=h)).json()
        again = (await c.get(url, headers=h)).json()
        assert before["revision"] == again["revision"] and before["rule_id"] == "HOT_OCCUPANT"
        assert before["simulation"]["vehicle_source"] == "SIMULATED" and before["simulation"]["runtime"] == "HOSTED_SIMULATION"
        assert before["last_observation"]["frame_id"] == "f1" and before["decision_current"] is True
        assert before["unlock_request"]["status"] == "pending"
        assert any(a["tool"] == "request_unlock" and a["status"] == "pending_human_confirmation" for a in before["action_results"])


@pytest.mark.asyncio
async def test_sensor_input_cannot_carry_risk_or_labels(env):
    async with client() as c:
        sid, h = await new_session(c)
        for extra in ({"risk_level": "SAFE"}, {"child": True}, {"occupancy_state": "ABSENT"}):
            bad = await c.post(f"/api/v1/e2e/sessions/{sid}/sensor", headers=h, json={**HOT_PARKED, **extra})
            assert bad.status_code == 422


@pytest.mark.asyncio
async def test_retry_is_idempotent_and_does_not_rerun_actions(env):
    service, clock, fake = env
    async with client() as c:
        sid, h = await new_session(c)
        await c.post(f"/api/v1/e2e/sessions/{sid}/sensor", headers=h, json=HOT_PARKED)
        first = (await frame(c, sid, h, "dup")).json()
        vid = f"DEMO_{sid}"
        revision = service.get_state(vid)["revision"]
        ledger = len(service.get_state_with_freshness(vid)["action_ledger"])
        events = len(service.events(vid, limit=500))
        retry = (await frame(c, sid, h, "dup")).json()
        assert retry["replayed"] is True and retry["committed"] == first["committed"] and fake.calls == 1
        assert service.get_state(vid)["revision"] == revision
        assert len(service.get_state_with_freshness(vid)["action_ledger"]) == ledger
        assert len(service.events(vid, limit=500)) == events


@pytest.mark.asyncio
async def test_out_of_order_frame_is_reported_ignored_and_state_does_not_regress(env):
    service, clock, fake = env
    async with client() as c:
        sid, h = await new_session(c)
        await c.post(f"/api/v1/e2e/sessions/{sid}/sensor", headers=h, json=HOT_PARKED)
        await frame(c, sid, h, "new", age_ms=0)
        fake.objects.clear()  # an older frame that shows nobody must not override a newer one
        late = (await frame(c, sid, h, "old", age_ms=900)).json()
        assert late["accepted"] is False and late["ignored_reason"] == "OUT_OF_ORDER_OR_SUPERSEDED"
        state = (await c.get(f"/api/v1/e2e/sessions/{sid}/state", headers=h)).json()
        assert state["risk_level"] == "CRITICAL"


@pytest.mark.asyncio
async def test_single_observation_goes_stale_and_never_becomes_safe(env):
    service, clock, fake = env
    async with client() as c:
        sid, h = await new_session(c)
        await c.post(f"/api/v1/e2e/sessions/{sid}/sensor", headers=h, json=HOT_PARKED)
        await frame(c, sid, h, "once")
        clock[0] += timedelta(seconds=4)
        service.tick_all()  # the timer works with nobody reading
        state = (await c.get(f"/api/v1/e2e/sessions/{sid}/state", headers=h)).json()
        assert state["decision_current"] is False
        assert state["freshness"]["vision"]["status"] == "STALE"
        assert state["risk_level"] != "SAFE" and state["data_quality"]["status"] == "STALE"
        assert state["last_observation"]["frame_id"] == "once"  # last-known stays distinguishable from current


@pytest.mark.asyncio
async def test_camera_fault_is_explicit_error_not_safe(env):
    async with client() as c:
        sid, h = await new_session(c)
        await c.post(f"/api/v1/e2e/sessions/{sid}/sensor", headers=h, json={**HOT_PARKED, "temperature": 24.0})
        cam = await c.post(f"/api/v1/e2e/sessions/{sid}/camera-status", headers=h, json={
            "frame_id": "cam1", "status": "BLOCKED", "origin": "SIMULATED_FAULT", "reason": "lens covered"})
        assert cam.status_code == 200
        state = (await c.get(f"/api/v1/e2e/sessions/{sid}/state", headers=h)).json()
        assert state["risk_level"] == "ERROR" and state["rule_id"] == "CAMERA_UNAVAILABLE" and state["camera_status"] == "BLOCKED"
        assert state["last_observation"]["origin"] == "SIMULATED_FAULT"
        assert (await c.post(f"/api/v1/e2e/sessions/{sid}/camera-status", headers=h, json={
            "frame_id": "cam1", "status": "BLOCKED", "origin": "SIMULATED_FAULT"})).json()["replayed"] is True


@pytest.mark.asyncio
async def test_missing_sensor_is_error_and_nothing_detected_is_not_called_empty_without_sensor(env):
    service, clock, fake = env
    fake.objects.clear()
    async with client() as c:
        sid, h = await new_session(c)
        await frame(c, sid, h, "lonely")
        state = (await c.get(f"/api/v1/e2e/sessions/{sid}/state", headers=h)).json()
        assert state["risk_level"] == "ERROR" and state["rule_id"] == "SENSOR_UNAVAILABLE"
        assert state["occupancy_state"] == "UNKNOWN"


@pytest.mark.asyncio
async def test_future_and_invalid_inputs_are_rejected_without_state_change(env):
    async with client() as c:
        sid, h = await new_session(c)
        await c.post(f"/api/v1/e2e/sessions/{sid}/sensor", headers=h, json=HOT_PARKED)
        vid = f"DEMO_{sid}"
        revision = (await c.get(f"/api/v1/e2e/sessions/{sid}/state", headers=h)).json()["revision"]
        assert (await frame(c, sid, h, "bad name!")).status_code == 422
        assert (await frame(c, sid, h, "empty", data=b"")).status_code == 422
        assert (await frame(c, sid, h, "corrupt", data=b"not an image")).status_code == 422
        assert (await frame(c, sid, h, "mime", data=png("JPEG"))).status_code == 422
        assert (await frame(c, sid, h, "gif", mime="image/gif")).status_code == 415
        huge = await frame(c, sid, h, "huge", data=b"0" * (6 * 1024 * 1024))
        assert huge.status_code == 413
        assert (await frame(c, sid, h, "neg", age_ms=-1)).status_code == 422
        assert (await c.post(f"/api/v1/e2e/sessions/{sid}/sensor", headers=h, json={**HOT_PARKED, "temperature": 500})).status_code == 422
        assert (await c.get(f"/api/v1/e2e/sessions/{sid}/state", headers=h)).json()["revision"] == revision
        assert not service_events_of(vid, "observation")


def service_events_of(vid, kind):
    return get_service().events(vid, event_type=kind, limit=5)


def get_service():
    return app.dependency_overrides[get_cabin_service]()


@pytest.mark.asyncio
async def test_model_unavailable_is_503_and_status_says_so(env):
    app.state.vision_provider = None
    async with client() as c:
        sid, h = await new_session(c)
        assert (await frame(c, sid, h, "x")).status_code == 503
        status = (await c.get("/api/v1/e2e/status")).json()
        assert status["model"]["ready"] is False and status["mode"] == "HOSTED_SIMULATION"
        assert status["oem"] == "OEM_NOT_VERIFIED" and status["push_os"] == "PUSH_OS_NOT_VERIFIED"


@pytest.mark.asyncio
async def test_two_sessions_do_not_see_each_other(env):
    async with client() as c:
        a, ha = await new_session(c)
        b, hb = await new_session(c)
        await c.post(f"/api/v1/e2e/sessions/{a}/sensor", headers=ha, json=HOT_PARKED)
        await frame(c, a, ha, "only-a")
        assert (await c.get(f"/api/v1/e2e/sessions/{a}/state", headers=hb)).status_code == 403
        assert (await c.get(f"/api/v1/e2e/sessions/{b}/state", headers=hb)).status_code == 404
        assert (await c.get(f"/api/v1/e2e/sessions/{a}/state")).status_code == 401
        for path in ("history", "notifications"):
            assert (await c.get(f"/api/v1/e2e/sessions/{a}/{path}", headers=hb)).status_code == 403
        assert (await c.post(f"/api/v1/e2e/sessions/{a}/acknowledge", headers=hb, json={"incident_id": "x", "surface": "PHONE"})).status_code == 403
        assert (await frame(c, a, hb, "stolen")).status_code == 403
        # the same client frame id in another session is a different observation
        await c.post(f"/api/v1/e2e/sessions/{b}/sensor", headers=hb, json=HOT_PARKED)
        assert (await frame(c, b, hb, "only-a")).json()["replayed"] is False


@pytest.mark.asyncio
async def test_notification_feed_delivery_states_and_failure(env):
    service, clock, fake = env
    async with client() as c:
        sid, h = await new_session(c)
        # WARNING path (cool occupant) plans send_notification
        await c.post(f"/api/v1/e2e/sessions/{sid}/sensor", headers=h, json={**HOT_PARKED, "temperature": 25.0})
        await frame(c, sid, h, "w1")
        feed = (await c.get(f"/api/v1/e2e/sessions/{sid}/notifications", headers=h)).json()
        assert len(feed) == 1 and feed[0]["stage"] == "INITIAL" and feed[0]["rule_id"] == "COOL_OCCUPANT"
        note = feed[0]
        assert note["channels"]["in_app_feed"]["state"] == "PUBLISHED"  # published is not delivered
        assert note["channels"]["push"]["state"] == "SIMULATED" and note["channels"]["push"]["provider_accepted"] is False
        assert note["channels"]["push"]["os_delivery"] == "PUSH_OS_NOT_VERIFIED"
        done = await c.post(f"/api/v1/e2e/sessions/{sid}/notifications/{note['notification_id']}/delivered", headers=h)
        assert done.json()["repeated"] is False
        assert (await c.post(f"/api/v1/e2e/sessions/{sid}/notifications/{note['notification_id']}/delivered", headers=h)).json()["repeated"] is True
        assert (await c.post(f"/api/v1/e2e/sessions/{sid}/notifications/99999/delivered", headers=h)).status_code == 404
        feed = (await c.get(f"/api/v1/e2e/sessions/{sid}/notifications", headers=h)).json()
        assert feed[0]["channels"]["in_app_feed"]["state"] == "IN_APP_DELIVERED"

        # a failing provider shows as FAILED on the next repeat, and the incident stays open
        assert (await c.post(f"/api/v1/e2e/sessions/{sid}/faults", headers=h, json={"messaging_provider": "FAIL"})).status_code == 200
        for step in range(1, 63):
            clock[0] += timedelta(seconds=1)
            if step % 2 == 0:
                await c.post(f"/api/v1/e2e/sessions/{sid}/sensor", headers=h, json={**HOT_PARKED, "temperature": 25.0})
            await frame(c, sid, h, f"w{step + 1}")
        feed = (await c.get(f"/api/v1/e2e/sessions/{sid}/notifications", headers=h)).json()
        assert any(n["channels"]["push"]["state"] == "FAILED" for n in feed)
        state = (await c.get(f"/api/v1/e2e/sessions/{sid}/state", headers=h)).json()
        assert state["incident"]["status"] == "OPEN"


@pytest.mark.asyncio
async def test_ack_keeps_incident_open_resolve_rules_and_audit(env):
    service, clock, fake = env
    async with client() as c:
        sid, h = await new_session(c)
        base = f"/api/v1/e2e/sessions/{sid}"
        await c.post(base + "/sensor", headers=h, json=HOT_PARKED)
        await frame(c, sid, h, "a1")
        state = (await c.get(base + "/state", headers=h)).json()
        incident = state["incident_id"]
        assert (await c.post(base + "/acknowledge", headers=h, json={"incident_id": "wrong", "surface": "PHONE"})).status_code == 409
        ack = await c.post(base + "/acknowledge", headers=h, json={"incident_id": incident, "surface": "PHONE"})
        assert ack.status_code == 200 and ack.json()["incident"]["status"] == "OPEN" and ack.json()["incident"]["acknowledged_at"]
        state = (await c.get(base + "/state", headers=h)).json()
        assert state["incident"]["status"] == "OPEN" and state["risk_level"] == "CRITICAL"
        body = {"incident_id": incident, "revision": state["revision"], "cabin_checked": True, "surface": "PHONE"}
        assert (await c.post(base + "/resolve", headers=h, json=body)).status_code == 409  # occupant still there
        assert (await c.post(base + "/resolve", headers=h, json={**body, "cabin_checked": False})).status_code == 422
        # occupant leaves: fresh sensor + fresh empty frame, then stale revision is rejected, current one accepted
        fake.objects.clear()
        clock[0] += timedelta(seconds=1)
        await c.post(base + "/sensor", headers=h, json={**HOT_PARKED, "temperature": 30.0})
        await frame(c, sid, h, "a2")
        current = (await c.get(base + "/state", headers=h)).json()
        stale_body = {**body, "revision": current["revision"] - 1}
        assert (await c.post(base + "/resolve", headers=h, json=stale_body)).status_code == 409
        ok = await c.post(base + "/resolve", headers=h, json={**body, "revision": current["revision"]})
        assert ok.status_code == 200 and ok.json()["incident"]["status"] == "RESOLVED"
        assert ok.json()["incident"]["resolution"] == "OPERATOR_CABIN_CHECK"
        history = (await c.get(base + "/history", headers=h)).json()["items"]
        actions = [(i["action"], i["result"], i["actor"]["surface"]) for i in history if i["type"] == "operator_action"]
        assert ("acknowledge", "OK", "PHONE") in actions and ("resolve", "REJECTED", "PHONE") in actions and ("resolve", "OK", "PHONE") in actions
        types = [i["type"] for i in history]
        assert "risk_change" in types and "alert" in types and "incident_resolution" in types and "unlock_request" in types


@pytest.mark.asyncio
async def test_resolve_blocked_when_evidence_is_stale(env):
    service, clock, fake = env
    async with client() as c:
        sid, h = await new_session(c)
        base = f"/api/v1/e2e/sessions/{sid}"
        await c.post(base + "/sensor", headers=h, json=HOT_PARKED)
        await frame(c, sid, h, "s1")
        incident = (await c.get(base + "/state", headers=h)).json()["incident_id"]
        fake.objects.clear()
        clock[0] += timedelta(seconds=1)
        await c.post(base + "/sensor", headers=h, json={**HOT_PARKED, "temperature": 30.0})
        await frame(c, sid, h, "s2")
        revision = (await c.get(base + "/state", headers=h)).json()["revision"]
        clock[0] += timedelta(seconds=10)  # nothing fresh any more
        stale = await c.post(base + "/resolve", headers=h, json={
            "incident_id": incident, "revision": revision, "cabin_checked": True, "surface": "COCKPIT"})
        assert stale.status_code == 409
        history = (await c.get(base + "/history", headers=h)).json()["items"]
        assert any(i["type"] == "operator_action" and i["result"] == "REJECTED" and i["actor"]["surface"] == "COCKPIT" for i in history)


@pytest.mark.asyncio
async def test_history_is_incremental(env):
    async with client() as c:
        sid, h = await new_session(c)
        base = f"/api/v1/e2e/sessions/{sid}"
        await c.post(base + "/sensor", headers=h, json=HOT_PARKED)
        await frame(c, sid, h, "h1")
        first = (await c.get(base + "/history", headers=h)).json()
        assert first["items"] and (await c.get(base + f"/history?after={first['next_after']}", headers=h)).json()["items"] == []


@pytest.mark.asyncio
async def test_restart_keeps_state_replay_and_notification_history(env, tmp_path):
    service, clock, fake = env
    async with client() as c:
        sid, h = await new_session(c)
        base = f"/api/v1/e2e/sessions/{sid}"
        await c.post(base + "/sensor", headers=h, json={**HOT_PARKED, "temperature": 25.0})
        await frame(c, sid, h, "r1")
        before = (await c.get(base + "/state", headers=h)).json()
        # a new service instance over the same database file is a process restart
        reopened = CabinService(tmp_path / "e2e.db", clock=lambda: clock[0], actions=DemoActions())
        app.dependency_overrides[get_cabin_service] = lambda: reopened
        after = (await c.get(base + "/state", headers=h)).json()
        assert after["revision"] == before["revision"] and after["incident_id"] == before["incident_id"]
        assert (await frame(c, sid, h, "r1")).json()["replayed"] is True and fake.calls == 1
        assert len((await c.get(base + "/notifications", headers=h)).json()) == 1
        assert (await c.get(base + "/state", headers={"Authorization": "Bearer wrong"})).status_code == 403


@pytest.mark.asyncio
async def test_concurrent_identical_frames_commit_once(env):
    import asyncio

    service, clock, fake = env
    async with client() as c:
        sid, h = await new_session(c)
        await c.post(f"/api/v1/e2e/sessions/{sid}/sensor", headers=h, json=HOT_PARKED)
        results = await asyncio.gather(*[frame(c, sid, h, "same") for _ in range(4)])
        assert {r.status_code for r in results} <= {200, 503}  # 503 = admission control, retryable
        assert any(r.status_code == 200 for r in results)
        vid = f"DEMO_{sid}"
        committed = [e for e in service.events(vid, event_type="evaluation", limit=50) if e.get("detected_objects")]
        assert len(committed) == 1
        tools = [a["tool"] for a in service.get_state_with_freshness(vid)["action_ledger"]]
        assert len(tools) == len(set(tools))


@pytest.mark.asyncio
async def test_sensor_stopping_while_frames_continue_is_error_not_safe(env):
    service, clock, fake = env
    fake.objects.clear()
    async with client() as c:
        sid, h = await new_session(c)
        base = f"/api/v1/e2e/sessions/{sid}"
        await c.post(base + "/sensor", headers=h, json={**HOT_PARKED, "temperature": 25.0})
        await frame(c, sid, h, "k0")
        for step in range(1, 8):  # cameras keep reporting an empty cabin; telemetry went silent
            clock[0] += timedelta(seconds=1)
            await frame(c, sid, h, f"k{step}")
        state = (await c.get(base + "/state", headers=h)).json()
        assert state["risk_level"] == "ERROR" and state["rule_id"] == "SENSOR_STALE"
        assert state["decision_current"] is False and state["freshness"]["sensor"]["status"] == "STALE"


@pytest.mark.asyncio
async def test_owner_erasure_and_retention_remove_session_data(env):
    service, clock, fake = env
    async with client() as c:
        keep, hk = await new_session(c)
        gone, hg = await new_session(c)
        idle, hi = await new_session(c)
        for sid, h in ((keep, hk), (gone, hg), (idle, hi)):
            await c.post(f"/api/v1/e2e/sessions/{sid}/sensor", headers=h, json=HOT_PARKED)
            await frame(c, sid, h, "e1")
        erased = await c.delete(f"/api/v1/e2e/sessions/{gone}", headers=hg)
        assert erased.json() == {"deleted": True}
        assert (await c.get(f"/api/v1/e2e/sessions/{gone}/state", headers=hg)).status_code == 403  # credentials are gone too
        vid = f"DEMO_{gone}"
        assert service.events(vid, limit=5) == [] and service.get_state(vid) is None and service.observation_get(vid, "e1") is None
        assert (await c.get(f"/api/v1/e2e/sessions/{keep}/state", headers=hk)).status_code == 200  # others untouched
        # retention: only sessions untouched for longer than the window go
        clock[0] += timedelta(hours=23)
        await c.post(f"/api/v1/e2e/sessions/{keep}/sensor", headers=hk, json=HOT_PARKED)
        clock[0] += timedelta(hours=2)
        assert service.purge_expired_demo(timedelta(hours=24)) == 1
        assert (await c.get(f"/api/v1/e2e/sessions/{idle}/state", headers=hi)).status_code == 403
        assert (await c.get(f"/api/v1/e2e/sessions/{keep}/state", headers=hk)).status_code == 200


def test_non_demo_vehicles_cannot_be_deleted(tmp_path):
    service = CabinService(tmp_path / "x.db")
    with pytest.raises(ValueError):
        service.delete_demo_session("CAR_1")


@pytest.mark.asyncio
async def test_history_can_export_per_frame_observations_with_timings(env):
    async with client() as c:
        sid, h = await new_session(c)
        base = f"/api/v1/e2e/sessions/{sid}"
        await c.post(base + "/sensor", headers=h, json=HOT_PARKED)
        await frame(c, sid, h, "t1")
        plain = (await c.get(base + "/history", headers=h)).json()["items"]
        assert all(i["type"] != "observation" for i in plain)
        rows = [i for i in (await c.get(base + "/history?observations=true", headers=h)).json()["items"] if i["type"] == "observation"]
        assert len(rows) == 1 and rows[0]["timings_ms"]["infer_detector"] == 11.0


@pytest.mark.asyncio
async def test_observation_preview_is_one_shot_not_persisted_or_replayed(env, monkeypatch):
    service, clock, fake = env
    infer = fake.infer
    masked = {'status': 'PROCESSED', 'data_url': 'data:image/jpeg;base64,masked-only',
              'masked_regions': 1, 'coverage_verified': False}
    monkeypatch.setattr(fake, 'infer', lambda image: {**infer(image), 'preview': masked})
    async with client() as c:
        sid, h = await new_session(c)
        first = (await frame(c, sid, h, 'preview-once')).json()
        assert first['preview'] == masked
        retry = (await frame(c, sid, h, 'preview-once')).json()
        assert retry['replayed'] and 'preview' not in retry and fake.calls == 1
        vid = f'DEMO_{sid}'
        assert 'preview' not in service.observation_get(vid, 'preview-once')
        assert 'data:image' not in str(service.get_state(vid))
        assert 'data:image' not in str(service.events(vid, limit=500))
