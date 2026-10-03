"""Preview privacy must not change evidence, risk or session lifecycle."""
import importlib
import importlib.util
import inspect
from datetime import UTC, datetime, timedelta

import pytest
from PIL import Image

from src.cabinsentinel.camera import CameraSessions
from src.cabinsentinel.service import CabinService


def test_privacy_rejects_untrusted_model_and_corrupt_image(tmp_path, monkeypatch):
    from src.vision.preview import FacePreview
    model = tmp_path / 'wrong.onnx'
    model.write_bytes(b'not the pinned model')
    monkeypatch.setenv('FACE_MODEL_PATH', str(model))
    with pytest.raises(ValueError, match='checksum'):
        FacePreview()
    with pytest.raises(ValueError, match='decode'):
        FacePreview(blurrer=object())(b'not an image')


def test_privacy_preserves_original_and_returns_only_processed_jpeg():
    assert importlib.util.find_spec('src.vision.preview'), 'Privacy preview module missing'
    import base64
    from io import BytesIO

    import numpy as np

    from src.vision.preview import FacePreview
    original = np.random.default_rng(5).integers(0, 255, (80, 80, 3), dtype=np.uint8)
    image = Image.fromarray(original)
    buffer = BytesIO()
    image.save(buffer, format='PNG')
    seen = []

    class Blurrer:
        def apply(self, frame):
            from src.vision.privacy import blur_boxes
            seen.append(frame.copy())
            return blur_boxes(frame, [[0, 0, 80, 80]]), {'detected_faces': 1, 'masked_boxes': [[0, 0, 80, 80]]}

    output = FacePreview(blurrer=Blurrer())(buffer.getvalue())
    np.testing.assert_array_equal(seen[0][:, :, ::-1], original)
    assert output['status'] == 'PROCESSED'
    assert output['detected_faces'] == 1
    decoded = np.array(Image.open(BytesIO(base64.b64decode(output['data_url'].split(',')[1]))))
    assert decoded[25:55, 25:55].var() < original[25:55, 25:55].var() / 10
    assert output['width'] == output['height'] == 80


@pytest.fixture
def rig(tmp_path):
    assert 'preview_factory' in inspect.signature(CameraSessions).parameters, 'Camera privacy integration missing'
    clock = [datetime(2026, 10, 3, tzinfo=UTC)]
    service = CabinService(tmp_path / 'privacy.db', clock=lambda: clock[0])
    yield service, clock
    service._db.close()


def infer(_image):
    return {'frame_id': 1, 'detections': [{'class': 'person', 'confidence': .9}], 'latency_ms': 1}


def submit(sessions, credentials, clock, sequence=1):
    clock[0] += timedelta(milliseconds=100)
    return sessions.frame(credentials['session_id'], credentials['session_token'], Image.new('RGB', (32, 32)), sequence, clock[0].isoformat(), infer)


def test_processed_preview_bound_to_frame_and_not_stored_in_state_or_reads(rig):
    service, clock = rig
    processed = {'status': 'PROCESSED', 'data_url': 'data:image/jpeg;base64,cHJvY2Vzc2Vk', 'detected_faces': 1}
    sessions = CameraSessions(service, preview_factory=lambda: lambda image: processed)
    creds = sessions.start('hot_locked', 'browser')
    result = submit(sessions, creds, clock)
    assert result['preview']['sequence'] == result['frame']['sequence'] == 1
    assert result['preview']['captured_at'] == result['frame']['captured_at']
    assert result['preview']['data_url'] == processed['data_url']
    assert result['risk_level'] == 'CRITICAL'
    assert any(a['status'] == 'simulated' for a in result['actions'])
    assert 'preview' not in sessions.status(creds['session_id'], creds['session_token'])
    assert 'preview' not in service.get_state('DEMO_' + creds['session_id'])
    duplicate = sessions.frame(creds['session_id'], creds['session_token'], Image.new('RGB', (32, 32)), 1, clock[0].isoformat(), infer)
    assert duplicate['revision'] == result['revision']
    assert duplicate['frame_result'] == 'DUPLICATE'
    assert 'preview' not in duplicate


def test_privacy_error_withholds_image_but_preserves_backend_risk(rig):
    service, clock = rig
    def unavailable():
        raise FileNotFoundError('Missing local face weights')
    sessions = CameraSessions(service, preview_factory=unavailable)
    result = submit(sessions, sessions.start('hot_locked', 'browser'), clock)
    assert result['preview']['status'] == 'UNAVAILABLE'
    assert 'data_url' not in result['preview']
    assert result['risk_level'] == 'CRITICAL'
    assert result['decision_current'] is True


def test_each_session_has_own_face_history(rig):
    service, clock = rig
    def factory():
        count = 0
        def process(image):
            nonlocal count
            count += 1
            return {'status': 'PROCESSED', 'detected_faces': count}
        return process
    sessions = CameraSessions(service, preview_factory=factory)
    a, b = sessions.start('hot_locked', 'browser'), sessions.start('hot_locked', 'browser')
    assert submit(sessions, a, clock)['preview']['detected_faces'] == 1
    assert submit(sessions, a, clock, 2)['preview']['detected_faces'] == 2
    assert submit(sessions, b, clock)['preview']['detected_faces'] == 1


def test_privacy_delay_cannot_commit_a_stale_frame(rig):
    service, clock = rig
    from src.cabinsentinel.camera import CameraError
    def slow_preview(image):
        clock[0] += timedelta(seconds=4)
        return {'status': 'PROCESSED'}
    sessions = CameraSessions(service, preview_factory=lambda: slow_preview)
    creds = sessions.start('hot_locked', 'browser')
    with pytest.raises(CameraError, match='STALE_FRAME'):
        submit(sessions, creds, clock)
    state = sessions.status(creds['session_id'], creds['session_token'])
    assert state['revision'] == creds['revision']
    assert state['decision_current'] is False
    assert state['frame'] is None


def test_stop_during_privacy_processing_discards_result(rig):
    service, clock = rig
    from src.cabinsentinel.camera import CameraError
    def interrupted(image):
        sessions.stop(creds['session_id'], creds['session_token'])
        return {'status': 'PROCESSED'}
    sessions = CameraSessions(service, preview_factory=lambda: interrupted)
    creds = sessions.start('hot_locked', 'browser')
    with pytest.raises(CameraError, match='STOPPED'):
        submit(sessions, creds, clock)
    state = sessions.status(creds['session_id'], creds['session_token'])
    assert state['camera']['requested'] == 'STOPPED'
    assert state['decision_current'] is False
    assert state['frame'] is None
