"""Age classifier wiring: person stays the detector label, age_group is separate evidence.

The checkpoints built here are synthetic (random weights with a forced output bias).
They prove loading, class mapping, preprocessing and fail-safe plumbing only; they say
nothing about the accuracy of Tâm's trained model.
"""

from types import SimpleNamespace

import pytest

from tests.test_demo_api import post_demo

PERSON = {"class": "person", "confidence": 0.9, "bbox": [2, 2, 30, 30]}


def test_adapter_age_evidence_is_never_defaulted_to_adult():
    from src.cabinsentinel.vision_adapter import to_age_evidence

    frame = {"detections": [
        {**PERSON},                                        # classifier absent
        {**PERSON, "age_group": "bogus"},                  # malformed
        {**PERSON, "age_group": "adult", "age_scores": {"adult": 0.97, "child": 0.03}},
        {"class": "dog", "confidence": 0.8, "bbox": [0, 0, 5, 5], "age_group": "adult"},
    ]}
    groups = [item["age_group"] for item in to_age_evidence(frame)]
    assert groups == ["unknown", "unknown", "adult", None]


@pytest.mark.asyncio
@pytest.mark.parametrize("group", ["adult", "child", "unknown"])
async def test_response_keeps_person_label_and_reports_age_group(tmp_path, group):
    scores = None if group == "unknown" else {"adult": 0.95, "child": 0.05}
    response, _, _ = await post_demo(
        tmp_path, scenario="hot_locked",
        detections=[{**PERSON, "age_group": group, "age_scores": scores, "age_crop": [0, 0, 32, 32]}],
    )
    assert response.status_code == 200
    body = response.json()
    detection = body["vision"]["detections"][0]
    assert detection["class"] == "person"
    assert detection["age_group"] == group
    assert detection["bbox"] == [2.0, 2.0, 30.0, 30.0]
    assert detection["age_crop"] == [0, 0, 32, 32]
    assert body["vision"]["age_classifier"]["status"] == "disabled"  # fixture frame carries none


@pytest.mark.asyncio
async def test_age_group_does_not_change_risk_or_actions(tmp_path):
    outcomes = []
    for group in ("adult", "child", "unknown"):
        response, _, _ = await post_demo(
            tmp_path / group if (tmp_path / group).mkdir() is None else tmp_path,
            scenario="hot_locked", detections=[{**PERSON, "age_group": group}],
        )
        body = response.json()
        outcomes.append((body["reasoning"]["risk_level"], body["reasoning"]["rule_id"],
                         body["reasoning"]["occupancy_state"],
                         [a["status"] for a in body["actions"]]))
    assert outcomes[0] == outcomes[1] == outcomes[2]
    assert outcomes[0][0] == "CRITICAL"


@pytest.mark.asyncio
async def test_legacy_replaced_label_is_still_rejected(tmp_path):
    response, _, _ = await post_demo(
        tmp_path, scenario="hot_locked", detections=[{"class": "adult", "confidence": 0.5}],
    )
    assert response.status_code == 503


# ---- provider with an injected classifier -------------------------------------------------

def make_provider(monkeypatch, tmp_path, classifier, load_error=None):
    import sys

    from src.vision.provider import TamVisionProvider

    model_path = tmp_path / "model.pt"
    model_path.write_bytes(b"fixture")

    class Scalar:
        def __init__(self, v):
            self.v = v

        def item(self):
            return self.v

    def box(cls, conf, xyxy):
        return SimpleNamespace(cls=Scalar(cls), conf=Scalar(conf), xyxy=[SimpleNamespace(tolist=lambda: xyxy)])

    class Model:
        def __init__(self, path):
            pass

        def predict(self, image, **options):
            return [SimpleNamespace(
                boxes=[box(0, 0.9, [1, 2, 20, 30]), box(16, 0.8, [5, 5, 9, 9]), box(0, 0.7, [3, 3, 15, 25])],
                names={0: "person", 16: "dog"},
            )]

    monkeypatch.setitem(sys.modules, "ultralytics", SimpleNamespace(YOLO=Model))
    monkeypatch.setitem(sys.modules, "numpy", SimpleNamespace(frombuffer=lambda d, dtype: d, uint8="u8"))
    monkeypatch.setitem(sys.modules, "cv2", SimpleNamespace(IMREAD_COLOR=1, imdecode=lambda d, m: "frame"))
    return TamVisionProvider(model_path, age_classifier=classifier, age_load_error=load_error)


def test_provider_labels_only_people_and_keeps_detector_class(monkeypatch, tmp_path):
    seen = {}

    class Classifier:
        def classify(self, frame, boxes):
            seen["frame"], seen["boxes"] = frame, boxes
            return [{"age_group": "adult", "age_scores": {"adult": 0.97, "child": 0.03}, "age_crop": [0, 0, 22, 33]},
                    {"age_group": "child", "age_scores": {"adult": 0.1, "child": 0.9}, "age_crop": [0, 0, 17, 27]}]

        def describe(self):
            return {"checkpoint_sha256": "abc", "model_classes": ["adult", "child"],
                    "thresholds": {"child": 0.5, "adult": 0.9}}

    frame = make_provider(monkeypatch, tmp_path, Classifier()).infer(b"x")
    assert seen["frame"] == "frame" and seen["boxes"] == [[1, 2, 20, 30], [3, 3, 15, 25]]
    classes = [(d["class"], d.get("age_group")) for d in frame["detections"]]
    assert classes == [("person", "adult"), ("dog", None), ("person", "child")]
    assert frame["age_classifier"]["status"] == "ok"


def test_classifier_failure_yields_unknown_not_adult(monkeypatch, tmp_path):
    class Broken:
        def classify(self, frame, boxes):
            raise RuntimeError("boom")

        def describe(self):
            return {}

    frame = make_provider(monkeypatch, tmp_path, Broken()).infer(b"x")
    assert [d["age_group"] for d in frame["detections"] if d["class"] == "person"] == ["unknown", "unknown"]
    assert frame["age_classifier"]["status"] == "error"


def test_missing_checkpoint_is_reported_and_people_are_unknown(monkeypatch, tmp_path):
    provider = make_provider(monkeypatch, tmp_path, None, load_error="FileNotFoundError: x")
    frame = provider.infer(b"x")
    assert provider.age_status == "load_failed"
    assert frame["age_classifier"]["status"] == "load_failed"
    assert all(d["age_group"] == "unknown" for d in frame["detections"] if d["class"] == "person")


# ---- real AgeClassifier code path with synthetic weights ------------------------------------

torch = pytest.importorskip("torch")
pytest.importorskip("torchvision")


def write_checkpoint(path, classes, favoured):
    from src.vision.age import CROP_PADDING, IMAGE_SIZE, build_model

    model = build_model(classes=classes)
    with torch.no_grad():
        model.classifier[-1].weight.zero_()
        model.classifier[-1].bias.fill_(-9.0)
        model.classifier[-1].bias[favoured] = 9.0
    torch.save({"format_version": 1, "classes": classes, "image_size": IMAGE_SIZE,
                "crop_padding": CROP_PADDING, "trained_epochs": 1, "model_state": model.state_dict()}, path)


@pytest.mark.parametrize(("classes", "favoured", "expected"), [
    (["adult", "child"], 0, "adult"),
    (["adult", "child"], 1, "child"),
    (["adult", "child", "infant"], 0, "adult"),
    (["adult", "child", "infant"], 2, "child"),  # historical infant is merged into child
])
def test_class_mapping_comes_from_checkpoint_metadata(tmp_path, classes, favoured, expected):
    import numpy as np

    from src.vision.age import AgeClassifier

    write_checkpoint(tmp_path / "age.pt", classes, favoured)
    classifier = AgeClassifier(tmp_path / "age.pt")
    assert classifier.model.training is False
    answer = classifier.classify(np.zeros((64, 64, 3), dtype=np.uint8), [[8, 8, 40, 50]])[0]
    assert answer["age_group"] == expected
    assert set(answer["age_scores"]) == {"adult", "child"}


def test_unapproved_class_order_is_rejected(tmp_path):
    from src.vision.age import AgeClassifier

    write_checkpoint(tmp_path / "age.pt", ["child", "adult"], 0)
    with pytest.raises(ValueError, match="Incompatible"):
        AgeClassifier(tmp_path / "age.pt")


def test_invalid_box_is_unknown_and_order_is_preserved(tmp_path):
    import numpy as np

    from src.vision.age import AgeClassifier

    write_checkpoint(tmp_path / "age.pt", ["adult", "child"], 1)
    answers = AgeClassifier(tmp_path / "age.pt").classify(
        np.zeros((64, 64, 3), dtype=np.uint8), [[10, 10, 10, 20], [8, 8, 40, 50], [float("nan"), 0, 5, 5]],
    )
    assert [a["age_group"] for a in answers] == ["unknown", "child", "unknown"]
    assert answers[0]["age_scores"] is None


def test_frame_is_converted_from_bgr_to_rgb_before_the_crop(tmp_path):
    import numpy as np

    from src.vision.age import AgeClassifier

    write_checkpoint(tmp_path / "age.pt", ["adult", "child"], 0)
    classifier = AgeClassifier(tmp_path / "age.pt")
    captured = []
    real = classifier.transform
    classifier.transform = lambda image: captured.append(image.getpixel((0, 0))) or real(image)
    bgr = np.zeros((32, 32, 3), dtype=np.uint8)
    bgr[:, :, 0] = 255  # OpenCV blue channel
    classifier.classify(bgr, [[0, 0, 32, 32]])
    assert captured == [(0, 0, 255)]  # blue in RGB order


@pytest.mark.parametrize(("child_score", "expected"), [
    (0.5, "child"), (0.49, "unknown"), (0.1, "adult"), (0.11, "unknown"),
    (float("nan"), "unknown"), (1.2, "unknown"),
])
def test_threshold_and_unknown_boundaries(child_score, expected):
    from src.vision.age import choose_group

    assert choose_group(child_score, 0.5, 0.9) == expected


def test_float_rounding_does_not_turn_a_confident_child_into_unknown():
    from src.vision.age import choose_age

    assert choose_age({"adult": 1.5e-08, "child": 1.5e-08, "infant": 1.0}) == "child"
    assert choose_age({"adult": 0.0, "child": 1.0, "infant": 0.5}) == "unknown"  # real overshoot stays rejected


def test_provider_records_the_padded_crop_rectangle(monkeypatch, tmp_path):
    import numpy as np

    from src.vision.provider import TamVisionProvider

    assert TamVisionProvider._crop_rect([8, 8, 40, 50], np.zeros((64, 64, 3), dtype=np.uint8)) == [4, 3, 44, 55]
    assert TamVisionProvider._crop_rect([10, 10, 10, 20], np.zeros((64, 64, 3), dtype=np.uint8)) is None
