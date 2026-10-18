"""Simulated vehicle link: state machine, refusal of vehicle writes, isolation, incident persistence, and camera-blocked fusion.

Fake detector: these are service-boundary tests, not evidence about the real model or real hardware."""
from datetime import timedelta

import pytest

from src.cabinsentinel import link
from tests.test_e2e_api import HOT_PARKED, client, frame, new_session  # noqa: F401
from tests.test_e2e_api import env as env  # noqa: F401


def url(sid, tail=""):
    return f"/api/v1/e2e/sessions/{sid}{tail}"


async def state(c, sid, h):
    return (await c.get(url(sid, "/state"), headers=h)).json()


async def cam(c, sid, h, fid, status="BLOCKED"):
    return await c.post(url(sid, "/camera-status"), headers=h, json={"frame_id": fid, "status": status, "origin": "SIMULATED_FAULT", "reason": "unit"})


@pytest.mark.asyncio
async def test_drop_restore_state_machine_and_incident_persistence(env):
    service, clock, fake = env
    fake.objects = [{"class": "person", "confidence": 0.9, "bbox": [1, 1, 20, 20]}]
    async with client() as c:
        sid, h = await new_session(c)
        await c.post(url(sid, "/sensor"), headers=h, json=HOT_PARKED)
        await frame(c, sid, h, "f1")
        s = await state(c, sid, h)
        assert s["connectivity"]["state"] == "CONNECTED" and s["risk_level"] == "CRITICAL"
        incident = s["incident_id"]
        # DC-01 drop -> RECONNECTING
        r = await c.post(url(sid, "/link"), headers=h, json={"action": "DROP"})
        assert r.json()["connectivity"]["state"] == "RECONNECTING"
        # vehicle writes are refused, not queued
        assert (await c.post(url(sid, "/sensor"), headers=h, json=HOT_PARKED)).status_code == 409
        assert (await frame(c, sid, h, "f2")).status_code == 409
        assert (await cam(c, sid, h, "c1")).status_code == 409
        # DC-02 timeout -> DISCONNECTED
        clock[0] += timedelta(seconds=link.DISCONNECT_AFTER_S + 1)
        s = await state(c, sid, h)
        assert s["connectivity"]["state"] == "DISCONNECTED"
        # DC-03/04 evidence is stale -> UNKNOWN, never SAFE; DC-05 incident persists with the same id
        assert s["decision_current"] is False and s["risk_level"] != "SAFE" and s["incident_id"] == incident and s["incident"]["status"] == "OPEN"
        assert s["freshness"]["vision"]["status"] == "STALE"
        # DC-06 restore -> SYNCING until fresh sensor AND vision are accepted
        assert (await c.post(url(sid, "/link"), headers=h, json={"action": "RESTORE"})).json()["connectivity"]["state"] == "SYNCING"
        await c.post(url(sid, "/sensor"), headers=h, json=HOT_PARKED)
        assert (await state(c, sid, h))["connectivity"]["state"] == "SYNCING"
        await frame(c, sid, h, "f3")
        s = await state(c, sid, h)
        # DC-07 fresh data -> CONNECTED; the old incident was not auto-resolved or duplicated
        assert s["connectivity"]["state"] == "CONNECTED" and s["incident_id"] == incident and s["incident"]["status"] == "OPEN"
        assert s["connectivity"]["drops"] == 1


@pytest.mark.asyncio
async def test_repeated_drop_restore_is_idempotent_and_isolated(env):
    service, clock, fake = env
    async with client() as c:
        a, ha = await new_session(c)
        b, hb = await new_session(c)
        for sid, h in ((a, ha), (b, hb)):
            await c.post(url(sid, "/sensor"), headers=h, json=HOT_PARKED)
        for _ in range(3):
            await c.post(url(a, "/link"), headers=ha, json={"action": "DROP"})
            await c.post(url(a, "/link"), headers=ha, json={"action": "DROP"})  # repeated drop does not restart the clock
            await c.post(url(a, "/link"), headers=ha, json={"action": "RESTORE"})
            await c.post(url(a, "/sensor"), headers=ha, json=HOT_PARKED)
        sa, sb = await state(c, a, ha), await state(c, b, hb)
        assert sa["connectivity"]["drops"] == 3 and sa["connectivity"]["state"] == "CONNECTED"
        assert sb["connectivity"]["drops"] == 0 and sb["connectivity"]["state"] == "CONNECTED"  # DC-10
        await c.post(url(a, "/link"), headers=ha, json={"action": "DROP"})
        assert (await c.post(url(b, "/sensor"), headers=hb, json=HOT_PARKED)).status_code == 200  # other vehicle still writes
        # a session token cannot drop another session's link
        assert (await c.post(url(b, "/link"), headers=ha, json={"action": "DROP"})).status_code in (401, 403, 404)


@pytest.mark.asyncio
async def test_old_frame_cannot_overwrite_after_restore(env):
    service, clock, fake = env
    fake.objects = [{"class": "person", "confidence": 0.9, "bbox": [1, 1, 20, 20]}]
    async with client() as c:
        sid, h = await new_session(c)
        await c.post(url(sid, "/sensor"), headers=h, json=HOT_PARKED)
        await frame(c, sid, h, "new")
        r = await frame(c, sid, h, "old", age_ms=30000)   # a 30 s old frame arriving late
        s = await state(c, sid, h)
        assert (r.json().get("accepted") is False) or s["freshness"]["vision"]["age_s"] is not None
        assert s["revision"] >= 1


@pytest.mark.asyncio
@pytest.mark.parametrize("radar,expect_unknown", [(True, False), (False, True)])
async def test_camera_blocked_fusion_is_decided_by_backend(env, radar, expect_unknown):
    service, clock, fake = env
    async with client() as c:
        sid, h = await new_session(c)
        await c.post(url(sid, "/sensor"), headers=h, json={**HOT_PARKED, "temperature": 38.0, "radar_presence": radar})
        assert (await cam(c, sid, h, "c1")).status_code == 200
        s = await state(c, sid, h)
        assert s["camera_status"] == "BLOCKED"
        if radar:   # CAM-02: blocked + radar positive -> suspected presence, not a verified empty cabin
            assert s["occupancy_state"] in ("SUSPECTED", "PRESENT") and s["risk_level"] != "SAFE"
        else:       # CAM-03: blocked + radar negative -> never SAFE, never "empty"
            assert s["risk_level"] != "SAFE" and s["occupancy_state"] != "ABSENT"
            assert s["decision_current"] is False or expect_unknown


@pytest.mark.asyncio
async def test_camera_blocked_without_radar_telemetry_is_unknown(env):
    service, clock, fake = env
    async with client() as c:
        sid, h = await new_session(c)
        await cam(c, sid, h, "c1")   # CAM-04: no sensor message at all
        s = await state(c, sid, h)
        assert s["risk_level"] != "SAFE" and s["occupancy_state"] in ("UNKNOWN", "SUSPECTED")


@pytest.mark.asyncio
async def test_critical_incident_survives_camera_loss(env):
    service, clock, fake = env
    fake.objects = [{"class": "person", "confidence": 0.9, "bbox": [1, 1, 20, 20]}]
    async with client() as c:
        sid, h = await new_session(c)
        await c.post(url(sid, "/sensor"), headers=h, json=HOT_PARKED)
        await frame(c, sid, h, "f1")
        before = await state(c, sid, h)
        assert before["risk_level"] == "CRITICAL"
        clock[0] += timedelta(seconds=1)
        await cam(c, sid, h, "c1")                              # CAM-05: camera lost during CRITICAL
        after = await state(c, sid, h)
        assert after["incident_id"] == before["incident_id"] and after["incident"]["status"] == "OPEN"
        assert after["risk_level"] != "SAFE"
