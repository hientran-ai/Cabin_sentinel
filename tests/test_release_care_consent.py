"""Release contracts: no timer or missing selection grants audio consent."""
from datetime import timedelta

import pytest

from tests.test_care import CARE_AUTO_AFTER_S, EV, base, client, critical, refresh, state  # noqa: F401
from tests.test_care import env as env


@pytest.mark.asyncio
async def test_new_session_never_auto_consents_or_starts_when_timer_expires(env):
    async with client() as c:
        sid, h = await critical(c, EV)
        initial = (await state(c, sid, h))["care"]
        assert initial["auto_consent"] is False
        assert initial["countdown"]["armed"] is False
        env[1][0] += timedelta(seconds=CARE_AUTO_AFTER_S + 1)
        await refresh(c, sid, h, "after-timer", EV)
        assert (await state(c, sid, h))["care"]["status"] == "IDLE"


@pytest.mark.asyncio
@pytest.mark.parametrize("profile", ["CHILD", "ADULT", "PET", "UNKNOWN"])
async def test_starting_comfort_without_audio_selection_does_not_play_music(env, profile):
    async with client() as c:
        sid, h = await critical(c, EV)
        r = await c.post(f"{base(sid)}/care/start", headers=h, json={"profile": profile, "surface": "PHONE"})
        assert r.status_code == 200
        assert not any(step["tool"] == "play_comfort_audio" for step in r.json()["plan"])
        assert (await state(c, sid, h))["risk_level"] == "CRITICAL"


@pytest.mark.asyncio
async def test_explicit_auto_consent_persists_but_timer_still_never_grants_audio(env):
    async with client() as c:
        sid, h = await critical(c, EV)
        r = await c.post(f"{base(sid)}/care/consent", headers=h, json={"auto_start": True, "surface": "PHONE"})
        assert r.status_code == 200
        assert (await state(c, sid, h))["care"]["auto_consent"] is True
        env[1][0] += timedelta(seconds=CARE_AUTO_AFTER_S + 1)
        await refresh(c, sid, h, "after-timer", EV)
        care = (await state(c, sid, h))["care"]
        assert care["status"] == "ACTIVE"
        assert not any(step["tool"] == "play_comfort_audio" for step in care["plan"])
