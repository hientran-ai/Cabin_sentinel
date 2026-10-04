"""Stateful foreground motion for a fixed camera; not person tracking."""

import math

import cv2
import numpy as np


class MotionDetector:
    def __init__(self, warmup_frames=30, min_area_ratio=0.001, moving_threshold=0.02, max_width=640):
        if warmup_frames < 1 or not 0 < min_area_ratio <= 1 or not 0 < moving_threshold <= 1:
            raise ValueError("Use warmup >= 1 and ratios in (0, 1]")
        if max_width < 32:
            raise ValueError("Motion processing width must be >= 32")
        self.warmup_frames = warmup_frames
        self.min_area_ratio = min_area_ratio
        self.moving_threshold = moving_threshold
        self.max_width = max_width
        self.shape = None
        self.frames = 0
        self.background = None

    def update(self, frame):
        """Process each source frame once. Return metadata and a filtered pixel mask."""
        if frame.dtype != np.uint8 or frame.ndim != 3 or frame.shape[2] != 3:
            raise ValueError("Expected a uint8 BGR frame")
        shape = frame.shape[:2]
        if shape != self.shape:
            self.shape = shape
            self.frames = 0
            self.background = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=16, detectShadows=True)
        self.frames += 1
        original_height, original_width = shape
        if original_width > self.max_width:
            frame = cv2.resize(
                frame,
                (self.max_width, max(1, round(original_height * self.max_width / original_width))),
                interpolation=cv2.INTER_AREA,
            )
        scale_x, scale_y = original_width / frame.shape[1], original_height / frame.shape[0]
        blurred = cv2.GaussianBlur(frame, (5, 5), 0)
        foreground = self.background.apply(blurred)
        # MOG2 shadows are 127; retain only foreground 255.
        mask = np.where(foreground == 255, 255, 0).astype(np.uint8)
        kernel = np.ones((3, 3), dtype=np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        status = "warming_up" if self.frames <= self.warmup_frames else "ready"
        if status == "ready" and np.count_nonzero(mask) / mask.size > 0.65:
            status = "global_change"
        filtered = np.zeros_like(mask)
        regions = []
        if status == "ready":
            count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
            minimum = max(1, math.ceil(mask.size * self.min_area_ratio))
            for label in range(1, count):
                x, y, width, height, area = map(int, stats[label])
                if area >= minimum:
                    filtered[labels == label] = 255
                    regions.append(
                        {
                            "bbox": [
                                math.floor(x * scale_x),
                                math.floor(y * scale_y),
                                min(original_width, math.ceil((x + width) * scale_x)),
                                min(original_height, math.ceil((y + height) * scale_y)),
                            ],
                            "area_ratio": float(area / mask.size),
                        }
                    )
        if filtered.shape != shape:
            filtered = cv2.resize(filtered, (original_width, original_height), interpolation=cv2.INTER_NEAREST)
        ratio = float(np.count_nonzero(filtered) / filtered.size) if status == "ready" else None
        return {
            "status": status,
            "motion_ratio": ratio,
            "has_motion": bool(regions) if status == "ready" else None,
            "regions": regions,
        }, filtered

    def for_box(self, mask, box, status="ready"):
        """Measure foreground pixels inside the current detection, without padding."""
        unknown = {"motion_ratio": None, "moving": None}
        if status != "ready":
            return unknown
        x1, y1, x2, y2 = map(float, box)
        if not all(math.isfinite(v) for v in (x1, y1, x2, y2)) or x2 <= x1 or y2 <= y1:
            return unknown
        height, width = mask.shape
        x1, y1 = max(0, math.floor(x1)), max(0, math.floor(y1))
        x2, y2 = min(width, math.ceil(x2)), min(height, math.ceil(y2))
        crop = mask[y1:y2, x1:x2]
        if x2 <= x1 or y2 <= y1:
            return unknown
        ratio = float(np.count_nonzero(crop) / crop.size)
        return {"motion_ratio": ratio, "moving": ratio >= self.moving_threshold}
