"""Tâm's CPU YOLO contract without needing private model weights in CI."""

import sys
from datetime import datetime
from types import SimpleNamespace

import pytest

from src.vision.provider import TamVisionProvider


def test_provider_requires_a_local_model_artifact(tmp_path):
    with pytest.raises(FileNotFoundError, match="MODEL_PATH"):
        TamVisionProvider(tmp_path / "missing.pt")


def test_provider_loads_once_and_returns_tam_frame(monkeypatch, tmp_path):
    model_path = tmp_path / "model.pt"
    model_path.write_bytes(b"fixture")
    calls = {"loads": 0, "predict": []}

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
            assert image == "decoded-image"
            calls["predict"].append(options)
            return [SimpleNamespace(boxes=[Box()], names={0: "person"})]

    monkeypatch.setitem(sys.modules, "ultralytics", SimpleNamespace(YOLO=Model))
    monkeypatch.setitem(sys.modules, "numpy", SimpleNamespace(frombuffer=lambda data, dtype: data, uint8="u8"))
    monkeypatch.setitem(sys.modules, "cv2", SimpleNamespace(IMREAD_COLOR=1, imdecode=lambda data, mode: "decoded-image"))

    provider = TamVisionProvider(model_path, confidence=0.25)
    first = provider.infer(b"image-1")
    second = provider.infer(b"image-2")

    assert calls["loads"] == 1
    assert calls["predict"] == [
        # Approved separate item analytics; occupant detections remain person/cat/dog only.
        {"classes": [0, 15, 16, 24, 67], "device": "cpu", "conf": 0.25, "imgsz": 640, "verbose": False},
    ] * 2
    assert first["frame_id"] == second["frame_id"] == 1
    # Without a classifier a person is never assumed adult: age_group stays unknown.
    assert first["detections"] == [{
        "class": "person", "confidence": 0.92, "bbox": [1, 2, 20, 30],
        "age_group": "unknown", "age_scores": None,
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
