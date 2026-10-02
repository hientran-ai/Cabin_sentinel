"""Small, offline person-crop classifier. Scores are not calibrated probabilities."""

import copy
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
    if child_threshold + adult_threshold <= 1:
        raise ValueError("Child and adult decision regions must not overlap")
    if not math.isfinite(child_score) or not 0 <= child_score <= 1:
        return "unknown"
    if child_score >= child_threshold:
        return "child"
    if 1 - child_score >= adult_threshold:
        return "adult"
    return "unknown"


def image_transform(training=False):
    # Preserve the whole crop; ImageNet's center crop can discard a child's head.
    steps = [transforms.Resize((IMAGE_SIZE, IMAGE_SIZE), antialias=True)]
    if training:
        steps += [transforms.RandomHorizontalFlip(), transforms.ColorJitter(brightness=0.2, contrast=0.2)]
    return transforms.Compose(
        steps
        + [
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )


def merge_age_scores(scores):
    """Merge historical infant probability into child before making a decision."""
    return {"adult": scores.get("adult", 0.0),
            "child": scores.get("child", 0.0) + scores.get("infant", 0.0)}


def choose_age(scores, child_threshold=0.5, adult_threshold=0.9):
    choose_group(0.5, child_threshold, adult_threshold)
    if not scores or any(not math.isfinite(value) or not 0 <= value <= 1 for value in scores.values()):
        return "unknown"
    merged = merge_age_scores(scores)
    return choose_group(merged["child"], child_threshold, adult_threshold)


def build_model(backbone=None, classes=None):
    model = mobilenet_v3_small(weights=None)
    if backbone is not None:
        model.load_state_dict(torch.load(backbone, map_location="cpu", weights_only=True))
    model.classifier[-1] = nn.Linear(model.classifier[-1].in_features, len(CLASSES if classes is None else classes))
    return model


class AgeClassifier:
    def __init__(self, checkpoint, child_threshold=0.5, adult_threshold=0.9):
        choose_group(0.5, child_threshold, adult_threshold)
        saved = torch.load(Path(checkpoint), map_location="cpu", weights_only=True)
        if (
            saved.get("format_version") not in (1, 2)
            or saved.get("classes") not in (CLASSES, LEGACY_CLASSES)
            or saved.get("image_size") != IMAGE_SIZE
            or saved.get("crop_padding") != CROP_PADDING
            or saved.get("trained_epochs", 0) < 1
            or (saved.get("format_version") == 2 and not saved.get("domain_adapter"))
        ):
            raise ValueError("Incompatible or untrained age classifier checkpoint")
        self.classes = list(CLASSES)
        self.model_classes = saved["classes"]
        if self.model_classes == CLASSES:
            choose_group(0.5, child_threshold, adult_threshold)
        self.model = build_model(classes=self.model_classes)
        self.model.load_state_dict(saved["model_state"])
        self.model.eval()
        self.real_head = None
        self.domain_gate = None
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

    @torch.inference_mode()
    def classify(self, bgr_frame, boxes):
        """Return one decision per input box, preserving order and invalid boxes."""
        height, width = bgr_frame.shape[:2]
        image = Image.fromarray(bgr_frame[:, :, ::-1])
        answers = [{"age_group": "unknown", "age_scores": None} for _ in boxes]
        crops, indices = [], []
        for index, box in enumerate(boxes):
            rect = padded_box(box, width, height)
            if rect is not None:
                crops.append(self.transform(image.crop(rect)))
                indices.append(index)
        if crops:
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
            scores = logits.softmax(dim=1).tolist()
            for index, values in zip(indices, scores, strict=True):
                age_scores = merge_age_scores(dict(zip(self.model_classes, values, strict=True)))
                group = choose_age(age_scores, self.child_threshold, self.adult_threshold)
                answers[index] = {
                    "age_group": group,
                    "age_scores": age_scores,
                }
            if domains is not None:
                for index, real in zip(indices, domains.tolist(), strict=True):
                    answers[index]["age_domain"] = "real" if real else "synthetic"
        return answers


def apply_age(detection, age):
    """Keep detector confidence distinct from the uncalibrated combined score."""
    result = dict(detection, **age)
    if detection["class"] != "person":
        raise ValueError("Age classification only applies to person detections")
    if age["age_group"] in CLASSES:
        group = age["age_group"]
        result.update(
            {
                "class": group,
                "detector_confidence": detection["confidence"],
                "confidence": detection["confidence"] * age["age_scores"][group],
                "confidence_type": "uncalibrated_detector_times_age",
            }
        )
    return result
