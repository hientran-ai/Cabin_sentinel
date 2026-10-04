"""Draw two age labels without changing model decisions or source frames."""

import math

import cv2

AGE_CLASSES = ("adult", "child")
COLORS = {"adult": (80, 220, 80), "child": (0, 200, 255)}


def display_age(detection):
    """Use argmax for uncertain people, explicitly marked with a question mark."""
    label = detection["class"]
    if label == "infant":
        label = "child"
    if label in AGE_CLASSES:
        return label, False
    if label != "person":
        return None, False
    scores = detection.get("age_scores")
    if not scores or any(name not in scores or not math.isfinite(scores[name]) for name in AGE_CLASSES):
        return None, True
    merged = {"adult": scores["adult"], "child": scores["child"] + scores.get("infant", 0.0)}
    return max(AGE_CLASSES, key=merged.get), True


def draw_detections(frame, detections, source_size=None):
    result = frame.copy()
    height, width = result.shape[:2]
    source_width, source_height = source_size or (width, height)
    for detection in detections:
        label, uncertain = display_age(detection)
        if label is None:
            continue
        coords = detection["bbox"]
        if not all(math.isfinite(value) for value in coords):
            continue
        x1, y1, x2, y2 = [
            round(value * scale)
            for value, scale in zip(coords, (width / source_width, height / source_height) * 2, strict=True)
        ]
        x1, x2 = max(0, min(width - 1, x1)), max(0, min(width - 1, x2))
        y1, y2 = max(0, min(height - 1, y1)), max(0, min(height - 1, y2))
        if x2 <= x1 or y2 <= y1:
            continue
        color = COLORS[label]
        text = label + (" ?" if uncertain else "")
        if "moving" in detection:
            motion = detection["moving"]
            text += " | motion: " + ("yes" if motion is True else "no" if motion is False else "pending")
        cv2.rectangle(result, (x1, y1), (x2, y2), color, 2)
        (text_width, text_height), baseline = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        tx = max(0, min(x1, width - text_width - 8))
        ty = min(height - baseline - 3, max(text_height + 6, y1 + text_height + 6))
        cv2.rectangle(
            result, (tx, ty - text_height - 5), (min(width - 1, tx + text_width + 8), ty + baseline + 2), color, -1
        )
        cv2.putText(result, text, (tx + 4, ty), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2, cv2.LINE_AA)
    return result
