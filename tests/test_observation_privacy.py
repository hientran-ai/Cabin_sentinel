"""REST observation previews: masks are presentation only, never raw-image fallback."""
import base64
from unittest.mock import Mock

import cv2
import numpy as np
import pytest

from src.vision.preview import FacePreview


def encoded_frame():
    frame = np.random.default_rng(68).integers(0, 255, (200, 200, 3), dtype=np.uint8)
    ok, buf = cv2.imencode('.png', frame)
    assert ok
    return frame, buf.tobytes()


@pytest.mark.parametrize('detections,method,regions', [
    ([{'class': 'person', 'bbox': [20, 20, 60, 120]}, {'class': 'dog', 'bbox': [100, 50, 140, 150]}], 'YUNET_HEAD_FALLBACK', 2),
    ([], 'FULL_FRAME_FALLBACK', 1),
    ([{'class': 'person'}], 'FULL_FRAME_FALLBACK', 1),
])
def test_preview_covers_missing_faces_without_modifying_source(detections, method, regions):
    original, image = encoded_frame()
    blurrer = Mock()
    blurrer.apply.side_effect = lambda f: (f.copy(), {'detected_faces': 0, 'masked_boxes': []})
    output = FacePreview(blurrer=blurrer)(image, detections=detections)
    assert output['status'] == 'PROCESSED'
    assert output['method'] == method
    assert output['masked_regions'] == regions
    assert output['coverage_verified'] is False
    result = cv2.imdecode(np.frombuffer(base64.b64decode(output['data_url'].split(',')[1]), np.uint8), cv2.IMREAD_COLOR)
    assert result[25:40, 25:40].var() < original[25:40, 25:40].var() / 10
    if method == 'YUNET_HEAD_FALLBACK':
        # Background far from both masks remains clear (JPEG error allowed).
        assert result[130:180, 20:60].var() > 1000
        assert not (result[25:40, 25:40] < 40).all()   # pixelated, not a solid dark box
    np.testing.assert_array_equal(blurrer.apply.call_args.args[0], original)


def test_provider_invokes_privacy_and_withholds_errors(monkeypatch, tmp_path):
    from types import SimpleNamespace

    import src.vision.preview as preview
    from src.vision.provider import TamVisionProvider
    path = tmp_path / 'fixture.pt'
    path.touch()
    _, image = encoded_frame()
    model = Mock()
    model.predict.return_value = [SimpleNamespace(boxes=[], names={})]
    monkeypatch.setattr('ultralytics.YOLO', lambda _: model)
    masker = Mock(return_value={'status': 'PROCESSED', 'data_url': 'masked', 'coverage_verified': False})
    monkeypatch.setattr(preview, 'FacePreview', lambda: masker)
    provider = TamVisionProvider(path)
    assert provider.infer(image)['preview']['data_url'] == 'masked'
    masker.assert_called_once_with(image, detections=[], clip_sample=False)
    masker.side_effect = RuntimeError('masking failed')
    failed = provider.infer(image)
    assert failed['detections'] == []
    assert failed['preview']['status'] == 'UNAVAILABLE'
    assert not failed['preview'].get('data_url')


def test_clip_sample_frames_without_detection_keep_the_cabin_readable_but_uploads_stay_fully_masked():
    original, image = encoded_frame()
    blurrer = Mock()
    blurrer.apply.side_effect = lambda f: (f.copy(), {'detected_faces': 0, 'masked_boxes': []})
    clip = FacePreview(blurrer=blurrer)(image, detections=[], clip_sample=True)
    assert clip['method'] == 'CLIP_SAMPLE_PASSTHROUGH' and clip['masked_regions'] == 0 and clip['fallback_regions'] == 0
    decoded = cv2.imdecode(np.frombuffer(base64.b64decode(clip['data_url'].split(',')[1]), np.uint8), cv2.IMREAD_COLOR)
    assert decoded.var() > 1000
    upload = FacePreview(blurrer=blurrer)(image, detections=[])
    assert upload['method'] == 'FULL_FRAME_FALLBACK'
