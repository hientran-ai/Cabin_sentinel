"""Frame-local reuse, cached telemetry and explicit device failure contracts."""

import hashlib
import sys
from threading import Event
from types import SimpleNamespace
from unittest.mock import Mock

import numpy as np
import pytest
from p068_vision.preview import MODEL_SHA256, FacePreview
from p068_vision.provider import TamVisionProvider
from p068_vision.resources import ResourceLayer


def test_periodic_telemetry_never_samples_in_request(monkeypatch):
    sampled = Event()
    calls = []

    def reading():
        calls.append(1)
        sampled.set()
        return {"process_rss_bytes": 42, "process_cpu_seconds": 1, "cuda": []}

    monkeypatch.setattr(ResourceLayer, "memory_snapshot", staticmethod(reading))
    layer = ResourceLayer(sample_interval=10)
    layer.start_sampling()
    try:
        assert sampled.wait(2)
        for _ in range(10):
            with layer.execution():
                pass
        assert len(calls) == 1
        assert layer.snapshot()["last_execution"]["process_cpu_seconds_delta"] is None
    finally:
        layer.close()
    assert not layer._sample_thread.is_alive()


def test_requested_cuda_unavailable_is_not_silent_cpu_fallback(monkeypatch, tmp_path):
    monkeypatch.setitem(sys.modules, "torch", SimpleNamespace(
        cuda=SimpleNamespace(is_available=lambda: False, device_count=lambda: 0),
    ))
    with pytest.raises(RuntimeError, match="device unavailable"):
        TamVisionProvider(tmp_path / "model.pt", device="cuda:0")


def test_frame_faces_keep_privacy_faces_and_reuse_age_detection():
    import torch
    from p068_vision.age import AgeClassifier
    from torch import nn

    class Model(nn.Module):
        def __init__(self):
            super().__init__()
            self.weight = nn.Parameter(torch.zeros(1))

        def forward(self, batch):
            assert batch.device == self.weight.device
            return torch.tensor([[0., 5.]], device=batch.device).repeat(len(batch), 1)

    faces = np.zeros((2, 15), dtype=np.float32)
    faces[:, :4] = [[10, 12, 40, 40], [70, 12, 20, 20]]
    faces[:, -1] = [.9, .4]
    detector = Mock()
    detector.detect.return_value = None, faces
    age = AgeClassifier.__new__(AgeClassifier)
    age.face_detector = detector
    age.model = Model()
    age.model_classes = ["adult", "child"]
    age.domain_gate = None
    age.input_kind = "face"
    age.child_threshold, age.adult_threshold = .5, .9
    age.transform = lambda image: torch.zeros(3, 224, 224)
    frame = np.zeros((96, 128, 3), dtype=np.uint8)
    shared = age.detect_frame_faces(frame, privacy=True)
    clear = age.age_faces(shared)
    people = age.face_only_people(frame, [], faces=clear)
    answers = age.classify(frame, [p["bbox"] for p in people], faces=clear)
    assert len(shared) == 2 and len(clear) == len(people) == len(answers) == 1
    assert answers[0]["age_group"] == "child"
    assert detector.detect.call_count == 1
    assert detector.setScoreThreshold.call_args_list[0].args == (.3,)
    assert detector.setScoreThreshold.call_args_list[-1].args == (.85,)
    # Empty evidence is a valid current frame, not a request to rerun the detector.
    assert age.face_only_people(frame, [], faces=[]) == []
    assert age.classify(frame, [people[0]["bbox"]], faces=[])[0]["age_group"] == "unknown"
    assert detector.detect.call_count == 1


def test_shared_full_frame_faces_skip_redundant_person_roi_scan():
    from p068_vision.age import AgeClassifier

    age = AgeClassifier.__new__(AgeClassifier)
    age.face_detector = Mock()
    frame = np.zeros((100, 200, 3), dtype=np.uint8)
    first = np.array([20, 10, 40, 40] + [0] * 10 + [.95], dtype=np.float32)
    second_roi = np.array([10, 10, 40, 40] + [0] * 10 + [.95], dtype=np.float32)
    age.face_detector.detect.return_value = None, np.array([second_roi])
    detections = [
        {"class": "person", "bbox": [0, 0, 100, 100]},
        {"class": "person", "bbox": [100, 0, 200, 100]},
    ]

    faces = age.detect_shared_pipeline_faces(
        frame, detections, [first], privacy=True,
    )

    assert age.face_detector.detect.call_count == 1
    assert len(faces) == 2
    assert sorted(round(float(face[0])) for face in faces) == [20, 110]


def test_full_frame_face_scan_bounds_long_side_and_restores_source_coordinates():
    from p068_vision.age import AgeClassifier

    age = AgeClassifier.__new__(AgeClassifier)
    age.face_max_side = 768
    age.face_detector = Mock()
    face = np.array([[57.6, 76.8, 115.2, 153.6] + [0] * 10 + [.95]], dtype=np.float32)
    age.face_detector.detect.return_value = None, face
    frame = np.zeros((1080, 810, 3), dtype=np.uint8)

    faces = age.detect_frame_faces(frame, privacy=True)

    age.face_detector.setInputSize.assert_called_once_with((576, 768))
    assert np.allclose(faces[0][:4], [81, 108, 162, 216])


def test_preview_rejects_stale_evidence_and_reuses_native_faces(tmp_path, monkeypatch):
    import cv2
    from p068_vision.privacy import FaceBlurrer

    model = tmp_path / "face.onnx"
    model.touch()
    detector = Mock()
    monkeypatch.setattr(cv2.FaceDetectorYN, "create", lambda *args: detector)
    blurrer = FaceBlurrer(model, max_width=64)
    preview = FacePreview(blurrer=blurrer)
    frame = np.random.default_rng(1).integers(0, 255, (96, 128, 3), dtype=np.uint8)
    ok, encoded = cv2.imencode('.jpg', frame)
    assert ok
    image = encoded.tobytes()
    face = [10, 12, 40, 40] + [0] * 10 + [.4]
    evidence = {"image_sha256": hashlib.sha256(image).hexdigest(), "model_sha256": MODEL_SHA256,
                "width": 128, "height": 96, "faces": [face]}
    result = preview(image, include_image=False, face_evidence=evidence)
    assert result["masked_boxes"] == [[6, 8, 54, 56]]
    assert result["detected_faces"] == 1
    detector.detect.assert_not_called()
    with pytest.raises(ValueError, match="does not match"):
        preview(image, face_evidence={**evidence, "image_sha256": "stale"})
    with pytest.raises(ValueError, match="Invalid shared"):
        preview(image, face_evidence={**evidence, "faces": [[float('nan')] * 15]})
