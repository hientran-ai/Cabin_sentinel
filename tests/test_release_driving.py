import pytest

from tests.test_e2e_api import HOT_PARKED, client, frame, new_session  # noqa: F401
from tests.test_e2e_api import env as env


@pytest.mark.asyncio
async def test_current_null_incident_is_not_migrated_as_an_unattended_legacy_incident(env):
    env[2].objects = [{"class": "person", "confidence": 0.9, "bbox": [1, 1, 20, 20]}]
    moving = {**HOT_PARKED, "temperature": 25, "engine_status": "ON", "doors_locked": False,
              "radar_presence": True, "driver_present": True, "gear": "D", "vehicle_speed_kph": 30, "hvac_status": "ACTIVE"}
    async with client() as c:
        sid, h = await new_session(c)
        base = f'/api/v1/e2e/sessions/{sid}'
        await c.post(base + '/sensor', headers=h, json=moving)
        await frame(c, sid, h, 'driving-1')
        s = (await c.get(base + '/state', headers=h)).json()
        assert s['rule_id'] == 'ATTENDED_DRIVING'
        assert s['risk_level'] == 'SAFE'
        assert s['incident'] is None and s['incident_id'] is None
        assert (await c.get(base + '/notifications', headers=h)).json() == []
