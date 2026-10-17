"""Tâm's CPU YOLO contract without needing private model weights in CI."""

import sys
from datetime import datetime
from types import SimpleNamespace

import pytest
from p068_vision.labels import DETECTION_CLASSES
from p068_vision.provider import TamVisionProvider


def test_provider_requires_a_local_model_artifact(tmp_path):
    with pytest.raises(FileNotFoundError, match="MODEL_PATH"):
        TamVisionProvider(tmp_path / "missing.pt")


def test_provider_loads_once_and_returns_tam_frame(monkeypatch, tmp_path):
    model_path = tmp_path / "model.pt"
    model_path.write_bytes(b"fixture")
    calls = {"loads": 0, "predict": []}
    decoded = SimpleNamespace(shape=(64, 64, 3))

    class Scalar:
        def __init__(self, value):
            self.value = value

        def item(self):
            return self.value

    class Box:
        cls = Scalar(0)
        conf = Scalar(0.92)
        xyxy = [SimpleNamespace(tolist=lambda: [1, 2, 20, 30])]

    class Model:
        def __init__(self, path):
            assert path == str(model_path)
            calls["loads"] += 1

        def predict(self, image, **options):
            assert image is decoded
            calls["predict"].append(options)
            return [SimpleNamespace(boxes=[Box()], names={0: "person"})]

    monkeypatch.setitem(sys.modules, "ultralytics", SimpleNamespace(YOLO=Model))
    monkeypatch.setitem(sys.modules, "numpy", SimpleNamespace(frombuffer=lambda data, dtype: data, uint8="u8"))
    monkeypatch.setitem(sys.modules, "cv2", SimpleNamespace(IMREAD_COLOR=1, imdecode=lambda data, mode: decoded))

    provider = TamVisionProvider(model_path, confidence=0.25)
    first = provider.infer(b"image-1")
    second = provider.infer(b"image-2")

    assert calls["loads"] == 1
    assert calls["predict"] == [
        {"classes": DETECTION_CLASSES, "device": "cpu", "conf": 0.25, "imgsz": 640, "verbose": False},
    ] * 2
    assert first["frame_id"] == second["frame_id"] == 1
    # Without a classifier a person is never assumed adult: age_group stays unknown.
    assert first["detections"] == [{
        "class": "person", "confidence": 0.92, "bbox": [1, 2, 20, 30],
        "age_group": "unknown", "age_scores": None,
        "track_id": 1, "moving": None, "track_displacement_ratio": None, "motion_samples": 1,
    }]
    assert first["age_classifier"] == {"status": "disabled"}
    assert datetime.fromisoformat(first["timestamp"]).tzinfo is not None
    assert first["latency_ms"] >= 0


def test_provider_rejects_decode_failure(monkeypatch, tmp_path):
    model_path = tmp_path / "model.pt"
    model_path.write_bytes(b"fixture")
    monkeypatch.setitem(sys.modules, "ultralytics", SimpleNamespace(YOLO=lambda path: object()))
    monkeypatch.setitem(sys.modules, "numpy", SimpleNamespace(frombuffer=lambda data, dtype: data, uint8="u8"))
    monkeypatch.setitem(sys.modules, "cv2", SimpleNamespace(IMREAD_COLOR=1, imdecode=lambda data, mode: None))
    provider = TamVisionProvider(model_path)
    with pytest.raises(ValueError, match="decode"):
        provider.infer(b"bad image")


@pytest.mark.parametrize('existing_phone', [False, True])
@pytest.mark.parametrize('mode', ['phone', 'items'])
@pytest.mark.parametrize('main_score', [.7, .95])
def test_phone_specialist_maps_custom_class_and_avoids_duplicates(monkeypatch, tmp_path, existing_phone, mode, main_score):
    import numpy as np

    model_path = tmp_path / 'main.pt'
    phone_path = tmp_path / 'phone.pt'
    model_path.write_bytes(b'fixture')
    phone_path.write_bytes(b'fixture')
    calls = []

    class Model:
        def __init__(self, path):
            self.phone = path == str(phone_path)
            self.names = {3: 'cell phone', 8: 'backpack', 6: 'chair'} if self.phone else {0: 'person', 67: 'cell phone', 24: 'backpack'}

        def predict(self, image, **options):
            calls.append((self.phone, options))
            rows = [[25, 30, 45, 50, .8, 3]] if self.phone else [[1, 1, 20, 60, .9, 0]]
            if self.phone and mode == 'items':
                rows.extend([[30, 5, 55, 25, .85, 8], [0, 0, 64, 64, .99, 6]])
            if not self.phone and mode == 'items':
                # Preserve a separate main-model item missed by the specialist.
                rows.append([2, 40, 15, 60, .95, 24])
            if not self.phone and existing_phone:
                rows.append([25, 30, 45, 50, main_score, 67])
            data = SimpleNamespace(cpu=lambda: SimpleNamespace(tolist=lambda: rows))
            return [SimpleNamespace(boxes=SimpleNamespace(data=data), names=self.names)]

    monkeypatch.setitem(sys.modules, 'ultralytics', SimpleNamespace(YOLO=Model))
    options = {'items_model_path' if mode == 'items' else 'phone_model_path': phone_path}
    provider = TamVisionProvider(model_path, **options)
    try:
        frame, _ = provider.infer_frame_with_context(np.zeros((64, 64, 3), dtype=np.uint8))
        phones = [d for d in frame['detections'] if d['class'] == 'cell phone']
        assert len(phones) == 1
        assert phones[0]['bbox'] == [25, 30, 45, 50]
        assert phones[0]['confidence'] == (max(.8, main_score) if existing_phone else .8)
        assert calls[1][1]['classes'] == ([3, 8] if mode == 'items' else [3])
        assert calls[1][1]['conf'] == .5
        assert calls[0][1]['classes'] == DETECTION_CLASSES
        assert len([d for d in frame['detections'] if d['class'] == 'backpack']) == (2 if mode == 'items' else 0)
        assert not any(d['class'] == 'chair' for d in frame['detections'])
        assert [d['age_group'] for d in frame['detections'] if d['class'] == 'person'] == ['unknown']
    finally:
        provider.close()
