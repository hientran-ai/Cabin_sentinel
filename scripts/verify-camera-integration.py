"""Verify approved camera API over real Gradio HTTP/SSE + YOLO.
Uses public test images, never a webcam. Credentials remain in memory.
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import httpx

root = Path(__file__).resolve().parents[1]
client = httpx.Client(base_url='http://127.0.0.1:7861', timeout=90)
checks = []

def check(name, condition):
    checks.append({'name': name, 'passed': bool(condition)})
    assert condition, name

def call(name, data):
    event = client.post('/gradio_api/call/' + name, json={'data': data})
    event.raise_for_status()
    response = client.get('/gradio_api/call/' + name + '/' + event.json()['event_id'])
    response.raise_for_status()
    for chunk in response.text.split('\n\n'):
        if 'event: error' in chunk: return {'transport_error': 'SSE_ERROR'}
        if 'event: complete' in chunk:
            line = next(line for line in chunk.splitlines() if line.startswith('data:'))
            return json.loads(line[5:])[0]
    raise RuntimeError('SSE stream did not complete')

def upload(filename, content):
    response = client.post('/gradio_api/upload', files={'files': (filename, content)})
    response.raise_for_status()
    return {'path': response.json()[0], 'meta': {'_type': 'gradio.FileData'}}

def now(): return datetime.now(timezone.utc).isoformat()

info = client.get('/gradio_api/info', headers={'Origin': 'http://127.0.0.1:5183'})
check('discovery + production preview CORS', info.status_code == 200 and
      info.headers.get('access-control-allow-origin') == 'http://127.0.0.1:5183' and
      all('/' + name in info.json()['named_endpoints'] for name in ['camera_start', 'camera_status', 'camera_frame', 'camera_stop', 'camera_report']))
created = call('camera_start', ['hot_locked', 'browser'])
credentials = [created['session_id'], created['session_token']]
try:
    check('initial no evidence is unavailable, never SAFE', created['camera_status'] == 'NO_FEED' and not created['decision_current'] and created['risk_level'] != 'SAFE')
    check('wrong session token rejected', call('camera_status', [credentials[0], 'invalid-test-token']).get('code') == 'UNAUTHORIZED')
    image = upload('public-bus.jpg', (root / 'docs/integration-evidence/public-ultralytics-bus.jpg').read_bytes())
    captured = now()
    data = credentials + [image, 1, captured]
    result = call('camera_frame', data)
    check('real YOLO + simulated car + backend CRITICAL', result['risk_level'] == 'CRITICAL' and result['decision_current'] and
          any(d['class'] == 'person' and len(d['bbox']) == 4 for d in result['vision_detections']))
    check('truthful simulated action and pending unlock', any(a['status'] == 'simulated' for a in result['actions']) and
          any(a['tool'] == 'request_unlock' and a['status'] == 'pending_human_confirmation' for a in result['actions']))
    duplicate = call('camera_frame', data)
    check('duplicate does not increment revision or replay action', duplicate.get('frame_result') == 'DUPLICATE' and duplicate['revision'] == result['revision'] and duplicate['actions'] == result['actions'])
    check('same sequence different payload conflict', call('camera_frame', credentials + [image, 1, now()]).get('code') == 'FRAME_CONFLICT')
    read1, read2 = call('camera_status', credentials), call('camera_status', credentials)
    check('status only reads committed revision', read1['revision'] == read2['revision'] == result['revision'])
    stale = (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat()
    check('old capture explicitly rejected', call('camera_frame', credentials + [image, 2, stale]).get('code') == 'STALE_FRAME')
    broken = upload('corrupt.png', b'not an image')
    failure = call('camera_frame', credentials + [broken, 2, now()])
    check('invalid image fails explicitly', bool(failure.get('transport_error') or failure.get('error')))
    stopped = call('camera_stop', credentials)
    repeated = call('camera_stop', credentials)
    check('stop repeat idempotent + no current SAFE', stopped['revision'] == repeated['revision'] and not repeated['decision_current'] and repeated['camera_status'] == 'NO_FEED')
    check('late frame cannot revive stopped session', call('camera_frame', credentials + [image, 2, now()]).get('code') == 'STOPPED')
finally:
    call('camera_stop', credentials)
    call('camera_report', credentials + ['STOPPED'])
    client.close()
output = {'backend': 'localhost verification harness importing existing approved camera contract', 'model': 'existing yolov8n.pt, real CPU inference',
          'camera': 'public image fixture, no hardware', 'checks': checks, 'passed': all(c['passed'] for c in checks)}
(root / 'docs/realtime-evidence/http-camera-results.json').write_text(json.dumps(output, indent=2) + '\n')
print(json.dumps(output, indent=2))
