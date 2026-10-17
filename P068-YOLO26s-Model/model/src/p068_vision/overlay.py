"""Draw detected people, pets and objects without changing inference decisions."""

import math

import cv2

AGE_CLASSES = ("adult", "child")
COLORS = {"adult": (80, 220, 80), "child": (0, 200, 255)}


def draw_motion_status(frame, motion, *, copy=True):
    """Show frame-level motion even when no object was detected."""
    result = frame.copy() if copy else frame
    if motion is None:
        text = "MOTION: OFF (enable --motion)"
    elif motion["status"] == "warming_up":
        text = "MOTION: WARMING UP"
    elif motion["status"] != "ready" or motion.get("has_motion") is None:
        text = "MOTION: UNKNOWN (camera/light change)"
    else:
        text = "MOTION: " + ("YES" if motion["has_motion"] else "NO")
    height, width = result.shape[:2]
    scale = min(0.6, max(0.1, (width - 12) / max(1, cv2.getTextSize(
        text, cv2.FONT_HERSHEY_SIMPLEX, 1, 1)[0][0])))
    (_, text_height), baseline = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, scale, 1)
    y = max(text_height + 2, height - baseline - 6)
    cv2.rectangle(result, (0, max(0, y - text_height - 5)), (width - 1, height - 1), (20, 20, 20), -1)
    cv2.putText(result, text, (6, y), cv2.FONT_HERSHEY_SIMPLEX, scale,
                (0, 230, 255), 1, cv2.LINE_AA)
    return result


def display_age(detection):
    """Use argmax for uncertain people, explicitly marked with a question mark."""
    label = detection["class"]
    if label == "infant":
        label = "child"
    if label in AGE_CLASSES:
        return label, False
    if label != "person":
        return label, False
    group = detection.get("age_group")
    if group in AGE_CLASSES:
        return group, False
    if group == "unknown":
        return "person (age unknown)", True
    scores = detection.get("age_scores")
    if not scores or any(name not in scores or not math.isfinite(scores[name]) for name in AGE_CLASSES):
        return None, True
    merged = {"adult": scores["adult"], "child": scores["child"] + scores.get("infant", 0.0)}
    return max(AGE_CLASSES, key=merged.get), True


def draw_detections(frame, detections, source_size=None, *, copy=True):
    result = frame.copy() if copy else frame
    height, width = result.shape[:2]
    source_width, source_height = source_size or (width, height)
    # Auxiliary hypotheses remain visible; pet labels must not be hidden by them.
    def layer(d):
        return 0 if d.get('detector_source')=='grounded_person' else 2 if d['class'] in {'cat','dog','pet_unknown'} else 1
    for detection in sorted(detections,key=layer):
        proposal=detection.get('detector_source')=='grounded_person'
        label, uncertain = display_age(detection)
        if label is None:
            label, uncertain = detection["class"], False
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
        color = COLORS.get(label, (220, 180, 80))
        text = label + (" ?" if uncertain else "")
        if proposal:
            color=(160,160,160)
            text=f"person proposal {detection['confidence']:.2f}"
        if label == 'pet_unknown':
            text = 'pet (species unknown)'
        if detection.get('cabin_membership',{}).get('label')=='uncertain':
            color = (0,200,255)
            text += ' | cabin uncertain'
        elif detection.get('cabin_membership',{}).get('label')=='outside':
            color = (160,160,160)
            text += ' | outside cabin'
        elif detection.get('cabin_membership',{}).get('label')=='inside' and not proposal:
            text += ' | in cabin'
        if detection.get('age_label_held'):
            text += ' ~'
        if "moving" in detection and not proposal:
            motion = detection["moving"]
            text += " | motion: " + ("yes" if motion is True else "no" if motion is False else "pending")
        scale,thickness=(.42,1) if proposal else (.6,2)
        cv2.rectangle(result, (x1, y1), (x2, y2), color, thickness)
        (text_width, text_height), baseline = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, scale, thickness)
        tx = max(0, min(x1, width - text_width - 8))
        if y1>=text_height+baseline+8:
            ty=y1-baseline-4
        elif detection['class'] in {'cat','dog','pet_unknown'}:
            ty=min(height-baseline-3,y2+text_height+6)
        else:
            ty=min(height-baseline-3,max(text_height+6,y1+text_height+6))
        cv2.rectangle(
            result, (tx, ty - text_height - 5), (min(width - 1, tx + text_width + 8), ty + baseline + 2), color, -1
        )
        cv2.putText(result, text, (tx + 4, ty), cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), thickness, cv2.LINE_AA)
    return result
