"""Item analytics never become occupant evidence or emergency actions."""
from datetime import timedelta

import pytest

from tests.test_e2e_api import HOT_PARKED, client, frame, new_session  # noqa: F401
from tests.test_e2e_api import env as env


@pytest.mark.asyncio
async def test_item_reminder_requires_two_new_frames_and_explicit_trip_end(env, monkeypatch):
    service, clock, fake = env
    fake.objects = []
    original = fake.infer
    monkeypatch.setattr(fake, "infer", lambda data: {**original(data), "item_detections": [{"class": "backpack", "confidence": 0.8, "bbox": [2, 2, 30, 30]}]})
    async with client() as c:
        sid, h = await new_session(c)
        url = f"/api/v1/e2e/sessions/{sid}"
        assert (await c.post(url + '/sensor', headers=h, json={**HOT_PARKED, 'trip_ended': True, 'radar_presence': False})).status_code == 200
        await frame(c, sid, h, 'bag-1')
        s = (await c.get(url + '/state', headers=h)).json()
        assert s['items']['reminders'] == []
        await frame(c, sid, h, 'bag-1')  # replay cannot count toward continuity
        assert (await c.get(url + '/state', headers=h)).json()['items']['reminders'] == []
        clock[0] += timedelta(seconds=1)
        await c.post(url + '/sensor', headers=h, json={**HOT_PARKED, 'trip_ended': True, 'radar_presence': False})
        await frame(c, sid, h, 'bag-2')
        s = (await c.get(url + '/state', headers=h)).json()
        assert s['risk_level'] == 'ERROR' and s['occupancy_state'] == 'UNKNOWN'
        assert s['detected_objects'] == []
        assert len(s['items']['reminders']) == 1
        r = s['items']['reminders'][0]
        assert r['class'] == 'backpack' and r['status'] == 'OPEN'
        assert r['evidence_frames'] == ['bag-1', 'bag-2']
        clock[0] += timedelta(seconds=1)
        await frame(c, sid, h, 'bag-3')
        assert len((await c.get(url + '/state', headers=h)).json()['items']['reminders']) == 1
        action = await c.post(url + f"/items/{r['id']}/respond", headers=h, json={'response': 'TAKEN'})
        assert action.status_code == 200
        assert (await c.get(url + '/state', headers=h)).json()['items']['reminders'][0]['status'] == 'TAKEN'
        assert not any(e.get('tool') in {'trigger_horn', 'request_unlock', 'send_sms'} for e in service.events('DEMO_' + sid))


@pytest.mark.asyncio
async def test_old_clients_without_trip_end_and_stale_items_do_not_create_reminders(env, monkeypatch):
    _, clock, fake = env
    fake.objects = []
    original = fake.infer
    monkeypatch.setattr(fake, 'infer', lambda data: {**original(data), 'item_detections': [{'class': 'cell phone', 'confidence': 0.9, 'bbox': [1, 1, 5, 5]}]})
    async with client() as c:
        sid, h = await new_session(c)
        url = f'/api/v1/e2e/sessions/{sid}'
        await c.post(url + '/sensor', headers=h, json=HOT_PARKED)
        await frame(c, sid, h, 'i-1')
        clock[0] += timedelta(seconds=1)
        await frame(c, sid, h, 'i-2')
        assert (await c.get(url + '/state', headers=h)).json()['items']['reminders'] == []
        clock[0] += timedelta(seconds=10)
        await c.post(url + '/sensor', headers=h, json={**HOT_PARKED, 'trip_ended': True})
        assert (await c.get(url + '/state', headers=h)).json()['items']['reminders'] == []
