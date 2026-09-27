"""Small, offline person-crop classifier. Scores are not calibrated probabilities."""

import math
from pathlib import Path

import torch
from PIL import Image
from torch import nn
from torchvision import transforms
from torchvision.models import mobilenet_v3_small

CLASSES = ["adult", "child"]
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


def build_model(backbone=None):
    model = mobilenet_v3_small(weights=None)
    if backbone is not None:
        model.load_state_dict(torch.load(backbone, map_location="cpu", weights_only=True))
    model.classifier[-1] = nn.Linear(model.classifier[-1].in_features, len(CLASSES))
    return model


class AgeClassifier:
    def __init__(self, checkpoint, child_threshold=0.5, adult_threshold=0.9):
        choose_group(0.5, child_threshold, adult_threshold)
        saved = torch.load(Path(checkpoint), map_location="cpu", weights_only=True)
        if (
            saved.get("format_version") != 1
            or saved.get("classes") != CLASSES
            or saved.get("image_size") != IMAGE_SIZE
            or saved.get("crop_padding") != CROP_PADDING
            or saved.get("trained_epochs", 0) < 1
        ):
            raise ValueError("Incompatible or untrained age classifier checkpoint")
        self.model = build_model()
        self.model.load_state_dict(saved["model_state"])
        self.model.eval()
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
            scores = self.model(torch.stack(crops)).softmax(dim=1).tolist()
            for index, (adult, child) in zip(indices, scores, strict=True):
                answers[index] = {
                    "age_group": choose_group(child, self.child_threshold, self.adult_threshold),
                    "age_scores": {"adult": adult, "child": child},
                }
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
