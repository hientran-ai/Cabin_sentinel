"""Live contract checks using public/synthetic fixtures; never emit session credentials."""
import argparse
import hashlib
import json
import time
from datetime import datetime, timezone
from uuid import uuid4
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='https://khanh3636-cabinsentinel-backend.hf.space')
parser.add_argument('--output', default=str(ROOT / 'docs/integration-evidence/live-contract-results.json'))
args = parser.parse_args()
checks = []

def check(name, passed, evidence):
    checks.append({'name': name, 'passed': bool(passed), 'evidence': evidence})
    print(name, 'PASS' if passed else 'FAIL', flush=True)

with httpx.Client(base_url=args.base_url, timeout=90) as client:
    health = client.get('/health')
    check('health', health.status_code == 200 and health.json().get('vision') == 'ready', {'status': health.status_code, **health.json()})
    for origin in ('http://127.0.0.1:5173', 'http://127.0.0.1:4173'):
        cors = client.options('/api/v1/demo/analyze', headers={'Origin': origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization'})
        check('cors:' + origin, cors.status_code == 200 and cors.headers.get('access-control-allow-origin') == origin, {'status': cors.status_code, 'allow_origin': cors.headers.get('access-control-allow-origin')})
    fixtures = ROOT / 'docs/integration-evidence'
    empty = (fixtures / 'synthetic-empty.png').read_bytes()
    public = (fixtures / 'public-ultralytics-bus.jpg').read_bytes()
    for name, files, data, status in [
        ('missing-upload', None, {'scenario':'normal'}, 422),
        ('empty-upload', {'image':('empty.png', b'','image/png')}, {'scenario':'normal'}, 422),
        ('oversized-upload', {'image':('large.png', b'0'*(5*1024*1024+1),'image/png')}, {'scenario':'normal'}, 413),
        ('corrupt-upload', {'image':('corrupt.png', b'not an image','image/png')}, {'scenario':'normal'}, 422),
        ('unsupported-type', {'image':('notes.txt', b'test','text/plain')}, {'scenario':'normal'}, 415),
        ('invalid-scenario', {'image':('empty.png', empty,'image/png')}, {'scenario':'not-a-scenario'}, 422),
    ]:
        res = client.post('/api/v1/demo/analyze', files=files, data=data)
        check(name, res.status_code == status, {'status':res.status_code,'detail':res.json().get('detail')})
    start = client.post('/api/v1/demo/analyze', files={'image':('empty.png', empty,'image/png')}, data={'scenario':'normal'})
    start.raise_for_status()
    data = start.json()
    sid, token = data['session_id'], data['session_token']
    session_path = '/api/v1/demo/sessions/' + sid
    headers = {'Authorization':'Bearer ' + token}
    check('synthetic-empty-normal', data['reasoning']['risk_level'] == 'SAFE' and data['reasoning']['decision_current'] and not data['vision']['detections'], {'reasoning': data['reasoning'], 'detections': data['vision']['detections']})
    unauth = client.get(session_path)
    invalid = client.get(session_path, headers={'Authorization':'Bearer invalid-test-token'})
    check('session-unauthorized', unauth.status_code == 401 and invalid.status_code == 403, {'missing_token': unauth.status_code, 'invalid_token': invalid.status_code})
    # GET exposes normalized state, not the original VisionPayload. Submit a
    # documented synthetic packet once, then repeat that exact packet twice.
    packet = {'vehicle_id': data['vehicle_state']['vehicle_id'],
              'timestamp': datetime.now(timezone.utc).isoformat(),
              'frame_id': 'integration-duplicate-' + uuid4().hex,
              'camera_status': 'OK', 'detected_objects': []}
    first = client.post('/api/v1/vision', headers=headers, json=packet)
    first.raise_for_status()
    before = first.json()
    duplicate = client.post('/api/v1/vision', headers=headers, json=packet).json()
    duplicate2 = client.post('/api/v1/vision', headers=headers, json=packet).json()
    check('duplicate-vision-packet', duplicate['revision'] == before['revision'] == duplicate2['revision'] and duplicate['action_results'] == duplicate2['action_results'], {'revisions':[before['revision'],duplicate['revision'],duplicate2['revision']], 'action_statuses':[a['status'] for a in duplicate2['action_results']]})
    hot = client.post('/api/v1/demo/analyze', headers=headers, files={'image':('public-ultralytics-bus.jpg',public,'image/jpeg')}, data={'scenario':'hot_locked','session_id':sid})
    hot.raise_for_status()
    data = hot.json()
    actions = [{'tool':a['tool'],'status':a['status']} for a in data['actions']]
    check('public-yolo-hot-occupied', data['session_id'] == sid and data['reasoning']['risk_level'] == 'CRITICAL' and any(d['class']=='person' for d in data['vision']['detections']) and {'tool':'trigger_horn','status':'simulated'} in actions and {'tool':'request_unlock','status':'pending_human_confirmation'} in actions, {'fixture_sha256':hashlib.sha256(public).hexdigest(),'vision':data['vision'],'reasoning':data['reasoning'],'actions':actions})
    state = client.get(session_path, headers=headers).json()
    incident = state['incident']['incident_id']
    ack = client.post(session_path+'/acknowledge', headers=headers, json={'incident_id':incident})
    ack2 = client.post(session_path+'/acknowledge', headers=headers, json={'incident_id':incident})
    check('duplicate-acknowledge', ack.status_code == ack2.status_code == 200 and ack.json()['revision']==ack2.json()['revision'], {'statuses':[ack.status_code,ack2.status_code],'revisions':[ack.json().get('revision'),ack2.json().get('revision')]})
    time.sleep(4)
    stale = client.get(session_path, headers=headers).json()
    check('stale-evidence', stale['decision_current'] is False and stale['freshness']['vision']['status']=='STALE', {'risk':stale['risk_level'],'decision_current':stale['decision_current'],'freshness':stale['freshness'],'data_quality':stale['data_quality']})
    conflict = client.post(session_path+'/resolve', headers=headers, json={'incident_id':incident,'revision':stale['revision'],'cabin_checked':True})
    check('stale-resolution-rejected', conflict.status_code == 409, {'status':conflict.status_code,'detail':conflict.json().get('detail')})
    # Operator has inspected this generated blank demo fixture; this is not a real cabin check.
    clear = client.post('/api/v1/demo/analyze', headers=headers, files={'image':('empty.png',empty,'image/png')}, data={'scenario':'parked_locked','session_id':sid})
    clear.raise_for_status()
    clear_data = clear.json()
    resolved = client.post(session_path+'/resolve', headers=headers, json={'incident_id':incident,'revision':clear_data['reasoning']['revision'],'cabin_checked':True})
    check('fresh-synthetic-cabin-resolution', resolved.status_code == 200 and resolved.json()['incident']['status']=='RESOLVED', {'status':resolved.status_code,'incident_status':resolved.json().get('incident',{}).get('status'),'detail':resolved.json().get('detail')})
    repeated = client.post(session_path+'/resolve', headers=headers, json={'incident_id':incident,'revision':clear_data['reasoning']['revision'],'cabin_checked':True})
    check('duplicate-resolution', repeated.status_code == resolved.status_code == 200 and repeated.json()['revision'] == resolved.json()['revision'], {'statuses':[resolved.status_code,repeated.status_code],'revisions':[resolved.json().get('revision'),repeated.json().get('revision')]})
    history = client.get(session_path+'/events?limit=50', headers=headers)
    check('authorized-history', history.status_code == 200 and isinstance(history.json(),list) and any(e.get('event_type')=='evaluation' for e in history.json()), {'status':history.status_code,'event_types':sorted({e.get('event_type','unknown') for e in history.json()})})

result = {'base_url':args.base_url,'date':'2026-10-02','vision':'REAL_MODEL_INFERENCE','vehicle':'SIMULATED','actions':'SIMULATED_OR_PENDING','checks':checks}
Path(args.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
raise SystemExit(0 if all(c['passed'] for c in checks) else 1)
