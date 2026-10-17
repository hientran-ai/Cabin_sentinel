# ruff: noqa: F811
"""Cabin Care: human-confirmed comfort that never lowers risk, never closes an incident, and starts alone only on pre-consent."""

from datetime import timedelta

import pytest

from src.cabinsentinel.care import CARE_AUTO_AFTER_S, COMFORT_TARGET_C
from tests.test_e2e_api import (  # noqa: F401, F811  (env is a pytest fixture)
    HOT_PARKED,
    client,
    env,
    frame,
    new_session,
)


def base(sid):
    return f"/api/v1/e2e/sessions/{sid}"


async def refresh(c, sid, h, fid, sensor=None):
    """Fresh sensor + frame so the decision is current at the (faked) clock."""
    await c.post(f"{base(sid)}/sensor", headers=h, json=sensor or HOT_PARKED)
    return await frame(c, sid, h, fid)


async def state(c, sid, h):
    return (await c.get(f"{base(sid)}/state", headers=h)).json()


EV = {**HOT_PARKED, "powertrain_type": "EV", "battery_soc_pct": 80}


async def critical(c, sensor=None):
    sid, h = await new_session(c)
    await refresh(c, sid, h, "f0", sensor)
    s = await state(c, sid, h)
    assert s["risk_level"] == "CRITICAL" and s["incident"]["status"] == "OPEN"
    return sid, h


@pytest.mark.asyncio
async def test_care_needs_an_open_incident(env):
    env[2].objects.clear()
    async with client() as c:
        sid, h = await new_session(c)
        await c.post(f"{base(sid)}/sensor", headers=h, json={**HOT_PARKED, "temperature": 20.0})
        await frame(c, sid, h, "calm")
        for path, body in (("care/start", {"surface": "PHONE"}), ("care/declare", {"occupant": "CHILD", "surface": "PHONE"}),
                           ("care/stop", {"surface": "PHONE"})):
            assert (await c.post(f"{base(sid)}/{path}", headers=h, json=body)).status_code == 409


@pytest.mark.asyncio
async def test_child_comfort_is_a_bridge_not_a_resolution(env):
    async with client() as c:
        sid, h = await critical(c, EV)
        s = await state(c, sid, h)
        assert s["care"]["suggestion"]["kind"] == "ASK" and s["care"]["countdown"]["armed"] is True
        declared = (await c.post(f"{base(sid)}/care/declare", headers=h, json={"occupant": "CHILD", "surface": "PHONE"})).json()
        assert declared["profile"] == "CHILD" and declared["suggestion"]["kind"] == "CHILD"
        started = await c.post(f"{base(sid)}/care/start", headers=h, json={"music": "brahms", "surface": "PHONE"})
        assert started.status_code == 200
        care = started.json()
        assert care["status"] == "ACTIVE" and care["started_by"] == "OWNER_PHONE" and care["simulated"] is True
        tools = {step["tool"]: step for step in care["plan"]}
        assert tools["set_climate"]["parameters"]["target_c"] == COMFORT_TARGET_C
        assert tools["play_comfort_audio"]["parameters"] == {"source": "brahms", "volume_pct": 20}
        assert tools["show_cabin_screen"]["parameters"]["screen"] == "CHILD_FRIENDLY"
        assert all(step["status"] in {"simulated", "SKIPPED"} for step in care["plan"])
        after = await state(c, sid, h)
        assert after["risk_level"] == "CRITICAL" and after["incident"]["status"] == "OPEN"  # comfort never lowers risk or closes
        assert after["unlock_request"]["status"] == "pending"
        again = await c.post(f"{base(sid)}/care/start", headers=h, json={"surface": "PHONE"})
        assert again.status_code == 409


@pytest.mark.asyncio
async def test_unanswered_alert_starts_comfort_only_with_consent_and_current_data(env):
    service, clock, fake = env
    async with client() as c:
        sid, h = await critical(c)
        clock[0] += timedelta(seconds=CARE_AUTO_AFTER_S - 5)
        await refresh(c, sid, h, "f1")
        early = await state(c, sid, h)
        assert early["care"]["status"] == "IDLE" and 0 < early["care"]["countdown"]["remaining_s"] <= 5
        clock[0] += timedelta(seconds=6)
        await refresh(c, sid, h, "f2")
        late = (await state(c, sid, h))["care"]
        assert late["status"] == "ACTIVE" and late["started_by"] == "AUTO_TIMEOUT" and late["profile"] == "UNKNOWN"
        assert {s["parameters"].get("screen") for s in late["plan"] if s["tool"] == "show_cabin_screen"} == {"CHILD_FRIENDLY"}  # unknown = maybe a child
        assert (await state(c, sid, h))["incident"]["status"] == "OPEN"


@pytest.mark.asyncio
async def test_any_human_response_or_missing_consent_disarms_the_auto_start(env):
    service, clock, fake = env
    async with client() as c:
        sid, h = await critical(c)
        incident = (await state(c, sid, h))["incident"]["incident_id"]
        assert (await c.post(f"{base(sid)}/acknowledge", headers=h, json={"incident_id": incident, "surface": "PHONE"})).status_code == 200
        clock[0] += timedelta(seconds=CARE_AUTO_AFTER_S + 5)
        await refresh(c, sid, h, "f1")
        assert (await state(c, sid, h))["care"]["status"] == "IDLE"
    async with client() as c:
        sid, h = await critical(c)
        off = (await c.post(f"{base(sid)}/care/consent", headers=h, json={"auto_start": False, "surface": "PHONE"})).json()
        assert off["auto_consent"] is False and off["countdown"]["armed"] is False
        clock[0] += timedelta(seconds=CARE_AUTO_AFTER_S + 5)
        await refresh(c, sid, h, "g1")
        assert (await state(c, sid, h))["care"]["status"] == "IDLE"


@pytest.mark.asyncio
async def test_stale_data_does_not_auto_start(env):
    service, clock, fake = env
    async with client() as c:
        sid, h = await critical(c)
        clock[0] += timedelta(seconds=CARE_AUTO_AFTER_S + 30)  # no new data: the decision is no longer current
        s = await state(c, sid, h)
        assert s["decision_current"] is False and s["care"]["status"] == "IDLE" and s["care"]["countdown"]["armed"] is False


@pytest.mark.asyncio
async def test_adult_gets_camp_suggestion_but_the_alert_is_unchanged(env):
    async with client() as c:
        sid, h = await critical(c)
        declared = (await c.post(f"{base(sid)}/care/declare", headers=h, json={"occupant": "ADULT", "surface": "COCKPIT"})).json()
        assert declared["suggestion"]["kind"] == "ADULT" and "cảnh báo vẫn theo dõi" in declared["suggestion"]["text"]
        started = (await c.post(f"{base(sid)}/care/start", headers=h, json={"music": "ambient", "surface": "COCKPIT"})).json()
        tools = {s["tool"]: s for s in started["plan"]}
        assert tools["set_operation_mode"]["parameters"] == {"mode": "CAMP"} and started["started_by"] == "COCKPIT_OCCUPANT"
        assert tools["play_comfort_audio"]["parameters"]["source"] == "ambient"
        s = await state(c, sid, h)
        assert s["risk_level"] == "CRITICAL" and s["rule_id"] == "HOT_OCCUPANT"


@pytest.mark.asyncio
async def test_low_battery_skips_climate_and_unknown_audio_is_refused(env):
    async with client() as c:
        sid, h = await critical(c)
        bad = await c.post(f"{base(sid)}/care/start", headers=h, json={"music": "heavy-metal", "surface": "PHONE"})
        assert bad.status_code == 409
        # battery unknown in the telemetry -> the climate step is skipped, not guessed
        care = (await c.post(f"{base(sid)}/care/start", headers=h, json={"profile": "PET", "surface": "PHONE"})).json()
        climate = next(s for s in care["plan"] if s["tool"] == "set_climate")
        assert climate["status"] == "SKIPPED" and climate["skipped"] == "BATTERY_UNKNOWN_OR_LOW"


@pytest.mark.asyncio
async def test_stop_resolution_and_audit_trail(env):
    service, clock, fake = env
    async with client() as c:
        sid, h = await critical(c)
        await c.post(f"{base(sid)}/care/start", headers=h, json={"surface": "PHONE"})
        stopped = (await c.post(f"{base(sid)}/care/stop", headers=h, json={"surface": "PHONE"})).json()
        assert stopped["status"] == "ENDED" and stopped["end_reason"] == "OWNER_STOPPED"
        assert (await c.post(f"{base(sid)}/care/stop", headers=h, json={"surface": "PHONE"})).status_code == 409
        await c.post(f"{base(sid)}/care/start", headers=h, json={"surface": "PHONE"})
        history = (await c.get(f"{base(sid)}/history", headers=h)).json()["items"]
        changes = [i["change"] for i in history if i["type"] == "care"]
        assert changes == ["START", "STOP", "START"]
        assert all(i["actor"]["kind"] == "OWNER_PHONE" for i in history if i["type"] == "care")
        # the incident closes by a person's cabin check only; care then ends with it
        fake.objects.clear()
        clock[0] += timedelta(seconds=1)
        await refresh(c, sid, h, "empty", {**HOT_PARKED, "temperature": 25.0})
        s = await state(c, sid, h)
        incident = s["incident"]
        if incident["status"] == "OPEN":
            r = await c.post(f"{base(sid)}/resolve", headers=h, json={"incident_id": incident["incident_id"], "revision": s["revision"],
                                                                      "cabin_checked": True, "surface": "PHONE"})
            assert r.status_code == 200
        assert (await state(c, sid, h))["care"]["status"] == "ENDED"


@pytest.mark.asyncio
async def test_care_inputs_reject_unknown_fields(env):
    async with client() as c:
        sid, h = await critical(c)
        for body in ({"surface": "PHONE", "risk_level": "SAFE"}, {"surface": "PHONE", "temperature": 18}):
            assert (await c.post(f"{base(sid)}/care/start", headers=h, json=body)).status_code == 422
