"""Adapter around the standalone p068_vision pipeline: only the mapping is tested here (fake pipeline, no weights)."""
import importlib.util

import pytest

from src.vision import p068_provider
from src.vision.p068_provider import P068VisionProvider


class FakePipeline:
    def __init__(self, result):
        self.result, self.calls = result, []

    def infer(self, image, **kwargs):
        self.calls.append(kwargs)
        return self.result

    def close(self):
        pass


def make(result):
    provider = P068VisionProvider.__new__(P068VisionProvider)
    provider._pipeline, provider._lock = FakePipeline(result), __import__("threading").Lock()
    provider.age_status, provider.age_describe, provider._last_stream, provider._face2 = "ok", {}, None, None
    return provider


BASE = {"timestamp": "t", "latency_ms": 5.0, "detector_latency_ms": 4.0, "age_latency_ms": 1.0, "age_classifier": {"status": "ok"}}


def test_person_keeps_class_person_and_age_is_separate_evidence():
    p = make({**BASE, "detections": [
        {"class": "person", "confidence": 0.9, "bbox": [1, 2, 30, 40], "age_group": "child", "age_scores": {"child": 0.9}, "track_id": 3},
        {"class": "person", "confidence": 0.8, "bbox": [5, 5, 9, 9], "age_group": "weird"},
        {"class": "person", "confidence": 0.7, "bbox": [6, 6, 9, 9]},
    ]})
    out = p.infer(b"x", "veh:r1")
    assert [d["class"] for d in out["detections"]] == ["person"] * 3
    assert [d["age_group"] for d in out["detections"]] == ["child", "unknown", "unknown"]   # anything unsupported is "no evidence", never adult
    assert p._pipeline.calls[0]["stream_id"] == "veh:r1"


def test_items_and_unsupported_labels_never_become_occupants():
    p = make({**BASE, "detections": [
        {"class": "backpack", "confidence": 0.8, "bbox": [1, 1, 5, 5]}, {"class": "cell phone", "confidence": 0.6, "bbox": [1, 1, 5, 5]},
        {"class": "pet_unknown", "confidence": 0.9, "bbox": [1, 1, 5, 5]}, {"class": "child", "confidence": 0.9, "bbox": [1, 1, 5, 5]},
        {"class": "dog", "confidence": 0.7, "bbox": [1, 1, 5, 5]},
    ]})
    out = p.infer(b"x")
    assert [d["class"] for d in out["detections"]] == ["dog"]
    assert [d["class"] for d in out["item_detections"]] == ["backpack", "cell phone"]


def test_exterior_people_are_counted_apart_and_are_not_occupants():
    p = make({**BASE, "detections": [], "exterior_detections": [{"class": "person", "confidence": 0.9, "bbox": [1, 1, 5, 5]}]})
    out = p.infer(b"x", None, "DEMO-WIDE-01")
    assert out["detections"] == [] and out["exterior_count"] == 1
    assert p._pipeline.calls[0]["camera_id"] == "DEMO-WIDE-01"


def test_age_status_comes_from_the_pipeline_and_unknown_status_is_disabled():
    p = make({**BASE, "detections": [], "age_classifier": {"status": "garbage"}})
    assert p.infer(b"x")["age_classifier"]["status"] == "disabled"


@pytest.mark.skipif(importlib.util.find_spec("p068_vision") is None, reason="p068_vision not installed")
def test_geometry_file_is_valid():
    import json
    from pathlib import Path

    from p068_vision.cabin_geometry import CabinGeometry

    CabinGeometry(json.loads((Path(p068_provider.__file__).parent / "geometry" / "demo-wide-01.json").read_text()))


def test_preview_is_returned_masked_or_marked_unavailable_never_invented():
    ok = make({**BASE, "detections": [], "preview": {"status": "PROCESSED", "data_url": "data:image/jpeg;base64,AA==", "method": "m", "masked_regions": 2}})
    assert ok.infer(b"x")["preview"]["status"] == "PROCESSED" and ok.infer(b"x")["preview"]["coverage_verified"] is False
    none = make({**BASE, "detections": []})
    assert none.infer(b"x")["preview"] == {"status": "UNAVAILABLE", "data_url": None}


def test_masker_history_is_cleared_when_another_stream_arrives():
    class Blur:
        history = [[1, 2, 3, 4]]

    p = make({**BASE, "detections": []})
    p._pipeline._preview = type("P", (), {"blurrer": Blur()})()
    p.infer(b"x", "A")
    Blur.history.append([5])
    p.infer(b"x", "A")
    assert Blur.history == [[5]]            # same stream: the hold is kept
    p.infer(b"x", "B")
    assert Blur.history == []               # another session: nothing of the previous picture leaks


def test_second_pass_covers_only_uncovered_small_faces():
    import base64

    import cv2
    import numpy as np

    img = np.full((100, 200, 3), 200, np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    pv = {"status": "PROCESSED", "data_url": "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode(), "masked_regions": 1, "boxes": [[0, 0, 40, 40]]}
    out = p068_provider.cover_uncovered_faces(pv, [[10, 10, 10, 10], [100, 30, 20, 20], [0, 0, 190, 90]], (200, 100))
    assert out["second_pass_regions"] == 1 and out["masked_regions"] == 2       # inside an existing mask and the huge false face are skipped
    edge = p068_provider.cover_uncovered_faces(pv, [[30, 10, 30, 20]], (200, 100))   # centre under the mask but half of the face sticks out
    assert edge["second_pass_regions"] == 1
    dec = cv2.imdecode(np.frombuffer(base64.b64decode(out["data_url"].split(",")[1]), np.uint8), 1)
    assert dec[40, 110].mean() < 80 and dec[90, 10].mean() > 150               # covered where the face was, untouched elsewhere
    same = p068_provider.cover_uncovered_faces(pv, [[10, 10, 10, 10]], (200, 100))
    assert same is pv or same["data_url"] == pv["data_url"]
