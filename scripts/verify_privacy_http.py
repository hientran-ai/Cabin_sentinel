"""Local model-backed camera smoke test. Never prints session credentials/images."""
import argparse
import json
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path

import httpx
from PIL import Image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:7863')
    parser.add_argument('--image', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    receipt = {'base': args.base, 'checks': {}, 'hardware': 'NOT_VERIFIED'}
    with httpx.Client(base_url=args.base, timeout=90) as client:
        def call(name, data):
            response = client.post('/gradio_api/call/' + name, json={'data': data})
            response.raise_for_status()
            event_id = response.json()['event_id']
            result = client.get('/gradio_api/call/' + name + '/' + event_id)
            result.raise_for_status()
            for block in result.text.split('\n\n'):
                if 'event: complete' in block:
                    return json.loads(next(line[6:] for line in block.splitlines() if line.startswith('data: ')))[0]
            raise AssertionError('No completed Gradio result')

        health = client.get('/health').json()
        assert health['vision'] == health['backend'] == 'ready'
        receipt['checks']['health'] = health
        cors = client.options('/api/v1/demo/analyze', headers={
            'Origin': 'http://127.0.0.1:5183', 'Access-Control-Request-Method': 'POST'})
        assert cors.headers['access-control-allow-origin'] == 'http://127.0.0.1:5183'
        receipt['checks']['cors'] = cors.status_code
        creds = call('camera_start', ['hot_locked', 'browser'])
        credentials = [creds['session_id'], creds['session_token']]
        try:
            assert creds['risk_level'] == 'ERROR' and creds['decision_current'] is False
            receipt['checks']['missing_frame'] = 'ERROR / not current'
            image = Image.open(args.image).convert('RGB'); image.thumbnail((640, 480))
            encoded = BytesIO(); image.save(encoded, format='JPEG')
            uploaded = client.post('/gradio_api/upload', files={'files': ('sample.jpg', encoded.getvalue(), 'image/jpeg')})
            uploaded.raise_for_status()
            file = {'path': uploaded.json()[0], 'meta': {'_type': 'gradio.FileData'}}
            capture = datetime.now(timezone.utc).isoformat()
            data = [*credentials, file, 1, capture]
            result = call('camera_frame', data)
            assert result['frame_result'] == 'ACCEPTED', result.get('code')
            assert result['risk_level'] == 'CRITICAL' and result['decision_current'] is True
            assert result['preview']['status'] == 'PROCESSED'
            assert result['preview']['sequence'] == result['frame']['sequence']
            assert result['preview']['detected_faces'] > 0
            assert any(action['status'] == 'simulated' for action in result['actions'])
            receipt['checks']['frame'] = {
                'risk': result['risk_level'], 'current': result['decision_current'],
                'sequence': result['frame']['sequence'], 'privacy': {k: v for k, v in result['preview'].items() if k != 'data_url'},
                'actions': [{'action': a.get('action', a.get('tool')), 'status': a['status']} for a in result['actions']],
            }
            duplicate = call('camera_frame', data)
            assert duplicate['frame_result'] == 'DUPLICATE'
            assert duplicate['revision'] == result['revision']
            receipt['checks']['duplicate'] = 'same revision; no second ingest'
            status = call('camera_status', credentials)
            assert 'preview' not in status
            receipt['checks']['read_no_image'] = True
            denied = call('camera_status', [credentials[0], 'wrong-token'])
            assert denied['code'] == 'UNAUTHORIZED'
            receipt['checks']['auth'] = 'UNAUTHORIZED'
            old_capture = (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat()
            stale = call('camera_frame', [*credentials, file, 2, old_capture])
            assert stale['code'] == 'STALE_FRAME' and stale['decision_current'] is False
            receipt['checks']['stale'] = 'STALE_FRAME / not current'
        finally:
            stopped = call('camera_stop', credentials)
            assert stopped['camera']['requested'] == 'STOPPED' and stopped['decision_current'] is False
            receipt['checks']['stop'] = 'STOPPED / not current'
        receipt['verified_at'] = datetime.now(timezone.utc).isoformat()
        args.output.write_text(json.dumps(receipt, indent=2) + '\n')
        print(json.dumps({'checks': list(receipt['checks']), 'passed': True}))


if __name__ == '__main__':
    main()
