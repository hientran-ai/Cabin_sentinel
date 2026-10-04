"""Blur detected faces on a copy; inference retains the original frame."""

import math
from collections import deque
from pathlib import Path

import cv2
import numpy as np


# Ported from BaoTam f7c04a0; crop math kept local to avoid loading the age model.
def padded_box(box, width, height, padding=0.1):
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


def blur_boxes(frame, boxes):
    result = frame.copy()
    height, width = frame.shape[:2]

    for box in boxes:
        rect = padded_box(box, width, height, padding=0)
        if rect is None:
            continue

        x1, y1, x2, y2 = rect
        region = frame[y1:y2, x1:x2]
        rh, rw = region.shape[:2]

        # Smooth facial detail while keeping a feathered oval around the face.
        small = cv2.resize(
            region,
            (min(16, rw), min(16, rh)),
            interpolation=cv2.INTER_AREA,
        )
        small = cv2.GaussianBlur(small, (0, 0), sigmaX=2)
        blurred = cv2.resize(small, (rw, rh), interpolation=cv2.INTER_LINEAR)

        yy, xx = np.ogrid[:rh, :rw]
        radius = np.sqrt(
            ((xx + 0.5 - rw / 2) / (rw / 2)) ** 2
            + ((yy + 0.5 - rh / 2) / (rh / 2)) ** 2
        )
        alpha = np.clip((1 - radius) / 0.15, 0, 1)
        alpha = (alpha * alpha * (3 - 2 * alpha))[..., None]

        current = result[y1:y2, x1:x2]
        result[y1:y2, x1:x2] = np.rint(
            blurred * alpha + current * (1 - alpha)
        ).astype(frame.dtype)

    return result


class FaceBlurrer:
    def __init__(self, model, score_threshold=0.3, max_width=960, hold_frames=3):
        if not Path(model).is_file():
            raise FileNotFoundError(f"Local face model required: {model}")
        if not 0 < score_threshold <= 1 or max_width < 32 or hold_frames < 0:
            raise ValueError("Invalid face detector threshold, width or hold frames")

        self.detector = cv2.FaceDetectorYN.create(
            str(model), "", (320, 320), score_threshold, 0.3, 5000
        )
        self.max_width = max_width
        self.history = deque(maxlen=hold_frames + 1)
        self.shape = None

    def apply(self, frame):
        height, width = frame.shape[:2]
        if self.shape != (height, width):
            self.history.clear()
            self.shape = (height, width)

        processing = frame
        if width > self.max_width:
            processing = cv2.resize(
                frame,
                (self.max_width, max(1, round(height * self.max_width / width))),
            )

        ph, pw = processing.shape[:2]
        self.detector.setInputSize((pw, ph))
        _, faces = self.detector.detect(processing)

        boxes = []
        if faces is not None:
            for face in faces:
                x, y, w, h = map(float, face[:4])
                rect = padded_box(
                    [
                        x * width / pw,
                        y * height / ph,
                        (x + w) * width / pw,
                        (y + h) * height / ph,
                    ],
                    width,
                    height,
                    padding=0.10,
                )
                if rect is not None:
                    boxes.append(list(rect))

        # Replace overlapping historical positions instead of leaving a mask trail.
        # Unmatched faces are still held briefly when detection misses them.
        for previous in self.history:
            previous[:] = [
                old
                for old in previous
                if not any(_same_face(old, new) for new in boxes)
            ]

        self.history.append(boxes)
        masked = [box for previous in self.history for box in previous]

        return blur_boxes(frame, masked), {
            "detected_faces": len(boxes),
            "masked_boxes": masked,
        }


def _same_face(old, new):
    intersection = (
        max(0, min(old[2], new[2]) - max(old[0], new[0]))
        * max(0, min(old[3], new[3]) - max(old[1], new[1]))
    )
    smaller_area = min(
        (old[2] - old[0]) * (old[3] - old[1]),
        (new[2] - new[0]) * (new[3] - new[1]),
    )
    return intersection >= smaller_area * 0.3