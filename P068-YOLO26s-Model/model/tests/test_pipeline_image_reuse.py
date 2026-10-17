"""Pixel parity and request-local image reuse in the model/preview pipeline."""

from types import SimpleNamespace
from unittest.mock import Mock

import cv2
import numpy as np
import pytest
from p068_vision.age import AgeClassifier
from p068_vision.decoded_image import DecodedImage
from p068_vision.preview import FacePreview
from p068_vision.provider import TamVisionProvider
from p068_vision.resources import ResourceLayer
from PIL import Image


@pytest.mark.parametrize("rect", [(0, 0, 30, 25), (641, 501, 711, 591), (1200, 700, 1280, 720)])
def test_crop_first_rgb_preserves_full_frame_pil_pixels(rect):
    frame = np.random.default_rng(3).integers(0, 256, (720, 1280, 3), dtype=np.uint8)
    reference = Image.fromarray(frame[:, :, ::-1]).crop(rect)
    candidate = AgeClassifier._crop_image(frame, rect)
    assert candidate.mode == reference.mode == "RGB"
    assert candidate.size == reference.size
    assert candidate.tobytes() == reference.tobytes()


def test_provider_and_preview_decode_once_and_leave_source_pixels_unchanged(monkeypatch):
    pixels = np.random.default_rng(2).integers(0, 256, (64, 96, 3), dtype=np.uint8)
    ok, encoded = cv2.imencode(".jpg", pixels)
    assert ok
    image = encoded.tobytes()
    decode = Mock(wraps=cv2.imdecode)
    monkeypatch.setattr(cv2, "imdecode", decode)
    provider = TamVisionProvider.__new__(TamVisionProvider)
    provider._items_authoritative = False
    provider._phone_model = None
    provider.resources = ResourceLayer()
    provider._model = Mock()
    provider._model.predict.return_value = [SimpleNamespace(boxes=[], names={})]
    provider._options = {}
    provider._age, provider._age_load_error = None, None
    provider._opencv_threads = provider._torch_threads = 4
    blurrer = Mock()
    blurrer.apply.side_effect = lambda frame, **kwargs: (frame.copy(), {"detected_faces": 0, "masked_boxes": []})
    try:
        result, context = provider.infer_with_context(image)
        before = context.pixels.copy()
        preview = FacePreview(blurrer=blurrer)
        masked = preview(image, decoded_image=context)
        assert decode.call_count == 1
        assert masked["status"] == "PROCESSED"
        assert all(not isinstance(v, np.ndarray) for v in result.values())
        np.testing.assert_array_equal(before, context.pixels)
        with pytest.raises(ValueError, match="does not match"):
            preview(b"different request", decoded_image=context)
        assert decode.call_count == 1
    finally:
        provider.close()


def test_invalid_shared_source_is_rejected_before_preview_processing():
    blurrer = Mock()
    context = DecodedImage(b"old", np.zeros((32, 32, 3), dtype=np.uint8))
    with pytest.raises(ValueError, match="does not match"):
        FacePreview(blurrer=blurrer)(b"new", decoded_image=context)
    blurrer.apply.assert_not_called()
