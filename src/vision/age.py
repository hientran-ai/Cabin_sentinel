"""Person-crop age classifier for the V1 Vision boundary.

Ported from Tâm's ``src/vision/age.py`` (BaoTam-vision f7c04a0) so the backend and
the offline ``scripts/run_vision.py`` apply the same crop, resize, normalization and
decision rules. Scores are not calibrated probabilities. The class order is read from
the checkpoint; it is never assumed.

``age_group`` is a property of one ``person`` detection. It never replaces the
detector label and ``unknown`` means "no usable age evidence", not "adult".
"""

import copy
import hashlib
import math
from pathlib import Path

import torch
from PIL import Image
from torch import nn
from torchvision import transforms
from torchvision.models import mobilenet_v3_small

CLASSES = ["adult", "child"]
LEGACY_CLASSES = ["adult", "child", "infant"]
IMAGE_SIZE = 224
CROP_PADDING = 0.1
AGE_GROUPS = ("adult", "child", "unknown")


def padded_box(box, width, height, padding=CROP_PADDING):
    """Convert xyxy to a clipped, half-open PIL crop rectangle."""
    x1, y1, x2, y2 = map(float, box)
    if not all(math.isfinite(v) for v in (x1, y1, x2, y2)) or x2 <= x1 or y2 <= y1:
        return None
    dx, dy = (x2 - x1) * padding, (y2 - y1) * padding
    clipped = (
        max(0, math.floor(x1 - dx)),
        max(0, math.floor(y1 - dy)),
        min(width, math.ceil(x2 + dx)),
        min(height, math.ceil(y2 + dy)),
    )
    return clipped if clipped[2] > clipped[0] and clipped[3] > clipped[1] else None


def choose_group(child_score, child_threshold=0.5, adult_threshold=0.9):
    if not (0 < child_threshold <= 1 and 0 < adult_threshold <= 1):
        raise ValueError("Thresholds must be in (0, 1]")
    # Child requires p >= child_threshold; adult requires p <= 1 - adult_threshold.
    if child_threshold + adult_threshold <= 1:
        raise ValueError("Child and adult decision regions must not overlap")
    if not math.isfinite(child_score) or not 0 <= child_score <= 1:
        return "unknown"
    if child_score >= child_threshold:
        return "child"
    if 1 - child_score >= adult_threshold:
        return "adult"
    return "unknown"


def image_transform():
    # Whole crop is resized (no center crop) exactly like training; RGB, ImageNet statistics.
    return transforms.Compose([
        transforms.Resize((IMAGE_SIZE, IMAGE_SIZE), antialias=True),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])


def merge_age_scores(scores):
    """Merge historical infant probability into child before making a decision.

    Float32 softmax parts can sum to a hair above 1 (e.g. 1.0000000152), which the
    range check would turn into ``unknown`` for the most confident child/infant
    crops. Only rounding-sized overshoot is clamped; real out-of-range values and
    NaN still reach ``choose_group`` unchanged and stay ``unknown``.
    """
    child = scores.get("child", 0.0) + scores.get("infant", 0.0)
    if 1.0 < child <= 1.0 + 1e-6:
        child = 1.0
    return {"adult": scores.get("adult", 0.0), "child": child}


def choose_age(scores, child_threshold=0.5, adult_threshold=0.9):
    choose_group(0.5, child_threshold, adult_threshold)
    if not scores or any(not math.isfinite(value) or not 0 <= value <= 1 for value in scores.values()):
        return "unknown"
    return choose_group(merge_age_scores(scores)["child"], child_threshold, adult_threshold)


def build_model(classes):
    model = mobilenet_v3_small(weights=None)
    model.classifier[-1] = nn.Linear(model.classifier[-1].in_features, len(classes))
    return model


def file_sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


class AgeClassifier:
    """Loads a checkpoint written by Tâm's training code and classifies person crops."""

    def __init__(self, checkpoint, child_threshold=0.5, adult_threshold=0.9):
        choose_group(0.5, child_threshold, adult_threshold)
        path = Path(checkpoint)
        if not path.is_file():
            raise FileNotFoundError(f"AGE_CLASSIFIER_PATH is not a local file: {path}")
        saved = torch.load(path, map_location="cpu", weights_only=True)
        if (
            saved.get("format_version") not in (1, 2)
            or saved.get("classes") not in (CLASSES, LEGACY_CLASSES)
            or saved.get("image_size") != IMAGE_SIZE
            or saved.get("crop_padding") != CROP_PADDING
            or saved.get("trained_epochs", 0) < 1
            or (saved.get("format_version") == 2 and not saved.get("domain_adapter"))
        ):
            raise ValueError("Incompatible or untrained age classifier checkpoint")
        self.path = str(path)
        self.sha256 = file_sha256(path)
        self.model_classes = list(saved["classes"])
        self.model = build_model(self.model_classes)
        self.model.load_state_dict(saved["model_state"])
        self.model.eval()  # inference mode: no dropout, fixed batch-norm statistics
        self.real_head = self.domain_gate = None
        adapter = saved.get("domain_adapter")
        if adapter is not None:
            if adapter.get("version") != 1:
                raise ValueError("Incompatible real-domain age adapter")
            width = self.model.classifier[0].in_features
            self.real_head = copy.deepcopy(self.model.classifier)
            self.real_head.load_state_dict(adapter["real_head_state"])
            self.real_head.eval()
            self.domain_gate = nn.Linear(width, 1)
            self.domain_gate.load_state_dict(adapter["gate_state"])
            self.domain_gate.eval()
            self.domain_mean = adapter["feature_mean"]
            self.domain_scale = adapter["feature_scale"]
            if (
                self.domain_mean.shape != (width,) or self.domain_scale.shape != (width,)
                or not torch.isfinite(self.domain_mean).all() or not torch.isfinite(self.domain_scale).all()
                or not (self.domain_scale > 0).all()
            ):
                raise ValueError("Invalid domain-adapter feature normalization")
        self.transform = image_transform()
        self.child_threshold = child_threshold
        self.adult_threshold = adult_threshold

    def describe(self):
        return {
            "checkpoint_sha256": self.sha256, "model_classes": self.model_classes,
            "thresholds": {"child": self.child_threshold, "adult": self.adult_threshold},
        }

    @torch.inference_mode()
    def classify(self, bgr_frame, boxes):
        """One answer per box, in order. Invalid boxes stay ``unknown`` with no scores.

        ``bgr_frame`` is the original OpenCV (BGR) image; it is converted to RGB for the crop.
        """
        height, width = bgr_frame.shape[:2]
        image = Image.fromarray(bgr_frame[:, :, ::-1])
        answers = [{"age_group": "unknown", "age_scores": None, "age_crop": None} for _ in boxes]
        crops, indices = [], []
        for index, box in enumerate(boxes):
            rect = padded_box(box, width, height)
            if rect is not None:
                crops.append(self.transform(image.crop(rect)))
                indices.append(index)
                answers[index]["age_crop"] = list(rect)
        if not crops:
            return answers
        batch = torch.stack(crops)
        domains = None
        if self.domain_gate is None:
            logits = self.model(batch)
        else:
            features = self.model.avgpool(self.model.features(batch)).flatten(1)
            domains = self.domain_gate((features - self.domain_mean) / self.domain_scale).flatten() >= 0
            logits = self.model.classifier(features)
            if domains.any():
                logits[domains] = self.real_head(features[domains])
        for index, values in zip(indices, logits.softmax(dim=1).tolist(), strict=True):
            raw = dict(zip(self.model_classes, values, strict=True))
            scores = merge_age_scores(raw)
            answers[index].update({
                "age_group": choose_age(scores, self.child_threshold, self.adult_threshold),
                "age_scores": scores, "age_raw_scores": raw,
            })
        if domains is not None:
            for index, real in zip(indices, domains.tolist(), strict=True):
                answers[index]["age_domain"] = "real" if real else "synthetic"
        return answers
