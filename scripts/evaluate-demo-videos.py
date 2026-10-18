"""Actual supplied clip -> same resized JPEG -> real provider -> API/service/rules.
No mock model, no labels from the scenario name, no external notifications.
Detection frequencies are observations, not precision/recall without ground truth.
"""
import asyncio
from collections import Counter
from datetime import UTC, datetime, timedelta
import hashlib
import json
from pathlib import Path

import cv2
from httpx import ASGITransport, AsyncClient

from src.cabinsentinel.actions import DemoActions
from src.cabinsentinel.api import get_cabin_service
from src.cabinsentinel.service import CabinService
from src.main import app
from src.vision.provider import TamVisionProvider

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / 'apps/cockpit-web/public/samples/scenarios'
OUT = ROOT / 'docs/final-integration-20261017'
MODEL = ROOT / 'models/yolov8n.pt'


def telemetry(s):
    f = s['demo_telemetry_fixture_SIMULATED']
    if f.get('radar_presence') is None:
        return None  # missing radar is never coerced to a negative reading
    moving = f.get('vehicle_moving') is True
    return {'temperature': f.get('cabin_temp_c', 25.0), 'engine_status': 'ON' if f.get('ignition_on') else 'OFF',
            'doors_locked': f.get('locked', False), 'radar_presence': f['radar_presence'],
            'driver_present': moving or s['id'] == 'DEMO-06', 'gear': 'D' if moving else 'P',
            'vehicle_speed_kph': 30 if moving else 0, 'hvac_status': 'ACTIVE' if moving else 'INACTIVE',
            'powertrain_type': 'EV', 'operation_mode': 'NONE', 'battery_soc_pct': 80,
            'trip_ended': f.get('trip_ended', False)}


async def main():
    provider = TamVisionProvider(MODEL, confidence=0.25)
    app.state.vision_provider = provider
    manifest = json.loads((MEDIA / 'scenario_manifest.json').read_text())
    results = []
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://local-evaluation') as c:
        for scenario in manifest['scenarios']:
            clock = [datetime.now(UTC)]
            service = CabinService(':memory:', clock=lambda: clock[0], actions=DemoActions())
            app.dependency_overrides[get_cabin_service] = lambda: service
            created = (await c.post('/api/v1/e2e/sessions')).json()
            sid = created['session_id']; h = {'Authorization': 'Bearer ' + created['session_token']}
            base = f'/api/v1/e2e/sessions/{sid}'
            cap = cv2.VideoCapture(str(MEDIA / scenario['video']))
            inputs = telemetry(scenario)
            rows = []
            for second in range(10):
                cap.set(cv2.CAP_PROP_POS_MSEC, (second + .5) * 1000)
                ok, image = cap.read()
                if not ok: raise RuntimeError('Decode failed: ' + scenario['id'])
                image = cv2.resize(image, (640, round(image.shape[0] * 640 / image.shape[1])))
                ok, encoded = cv2.imencode('.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, 80])
                if not ok: raise RuntimeError('JPEG encoding failed')
                clock[0] += timedelta(seconds=1)
                if inputs is not None:
                    response = await c.post(base + '/sensor', headers=h, json=inputs)
                    assert response.status_code == 200, response.text
                response = await c.post(base + '/observations', headers=h,
                    data={'frame_id': scenario['id'] + f'-{second}', 'source': 'CLIP_FRAME', 'source_label': scenario['id'], 'media_time_s': second + .5},
                    files={'image': ('frame.jpg', encoded.tobytes(), 'image/jpeg')})
                assert response.status_code == 200, response.text
                obs = response.json()
                state = (await c.get(base + '/state', headers=h)).json()
                rows.append({'video_time_s': second + .5, 'frame_id': obs['frame_id'], 'accepted': obs['accepted'],
                    'detections': obs['vision']['detections'], 'items': obs['vision'].get('items', []), 'timings_ms': obs['timings_ms'],
                    'risk': state['risk_level'], 'rule': state['rule_id'], 'occupancy': state['occupancy_state'],
                    'incident_status': (state.get('incident') or {}).get('status'),
                    'item_reminders': state.get('items', {}).get('reminders', [])})
            notifications = (await c.get(base + '/notifications', headers=h)).json()
            cap.release()
            counts = Counter(d['class'] for r in rows for d in [*r['detections'], *r['items']])
            result = {'id': scenario['id'], 'filename': scenario['video'], 'clip_sha256': hashlib.sha256((MEDIA / scenario['video']).read_bytes()).hexdigest(),
                      'ground_truth': 'NOT_INDEPENDENTLY_ANNOTATED', 'manifest_visual_notes_NOT_MODEL_OUTPUT': scenario['human_review_observations_NOT_model_outputs'],
                      'simulated_sensor_values': inputs, 'frames': rows, 'detections_by_label': dict(counts),
                      'notifications': notifications, 'notification_count': len(notifications)}
            results.append(result)
            (OUT / 'model-detection-evaluation.json').write_text(json.dumps({'model': {'file': MODEL.name, 'sha256': hashlib.sha256(MODEL.read_bytes()).hexdigest(), 'confidence': .25, 'age_classifier': 'disabled'}, 'scenarios': results}, ensure_ascii=False, indent=2))
            print(scenario['id'], dict(counts), sorted({r['risk'] for r in rows}), 'notifications', len(notifications), flush=True)
            service._db.close()
    app.dependency_overrides.pop(get_cabin_service, None)


if __name__ == '__main__':
    asyncio.run(main())
