"""COCO classes supported by the cabin detector (Ultralytics class IDs)."""

COCO_ITEMS = {
    24: "backpack", 25: "umbrella", 26: "handbag", 27: "tie", 28: "suitcase",
    29: "frisbee", 30: "skis", 31: "snowboard", 32: "sports ball", 33: "kite",
    34: "baseball bat", 35: "baseball glove", 36: "skateboard", 37: "surfboard",
    38: "tennis racket",
    39: "bottle", 40: "wine glass", 41: "cup", 42: "fork", 43: "knife", 44: "spoon",
    45: "bowl", 46: "banana", 47: "apple", 48: "sandwich", 49: "orange",
    50: "broccoli", 51: "carrot", 52: "hot dog", 53: "pizza", 54: "donut", 55: "cake",
    56: "chair", 57: "couch", 58: "potted plant", 59: "bed", 60: "dining table",
    61: "toilet", 62: "tv", 63: "laptop", 64: "mouse", 65: "remote", 66: "keyboard",
    67: "cell phone", 68: "microwave", 69: "oven", 70: "toaster", 71: "sink",
    72: "refrigerator", 73: "book", 74: "clock", 75: "vase", 76: "scissors",
    77: "teddy bear", 78: "hair drier", 79: "toothbrush",
}
GENERIC_OBJECT = "object"
OBJECT_TYPE_THRESHOLD = 0.5
ITEM_LABELS = frozenset(COCO_ITEMS.values()) | {GENERIC_OBJECT, 'wallet'}
DETECTION_LABELS = ITEM_LABELS | {"person", "cat", "dog", "pet_unknown"}
PERSONAL_ITEM_IDS = {24: 'backpack', 25: 'umbrella', 26: 'handbag', 28: 'suitcase',
                     39: 'bottle', 41: 'cup', 63: 'laptop', 67: 'cell phone',
                     73: 'book', 77: 'teddy bear'}
PERSONAL_ITEM_LABELS = frozenset(PERSONAL_ITEM_IDS.values()) | {'wallet'}
DETECTION_CLASSES = [0, 15, 16, *PERSONAL_ITEM_IDS]


def user_visible_detection(detection):
    """Keep living evidence; expose only confidently named personal items."""
    import math
    label = detection.get('class')
    if label in {'person', 'cat', 'dog', 'pet_unknown', 'adult', 'child'}:
        return True
    confidence = detection.get('confidence')
    return (label in PERSONAL_ITEM_LABELS and isinstance(confidence, (int, float))
            and not isinstance(confidence, bool) and math.isfinite(confidence)
            and confidence >= OBJECT_TYPE_THRESHOLD)


def object_fallback(detection, threshold=OBJECT_TYPE_THRESHOLD):
    """Hide an uncertain subtype only for detections predicted as known items.

    Confidence remains the original YOLO class score, not an independently
    measured probability that the region contains an arbitrary inanimate object.
    Unknown labels and living classes are never converted to objects.
    """
    if not 0 < threshold <= 1:
        raise ValueError("Object type threshold must be in (0, 1]")
    label = detection.get("class")
    confidence = detection.get("confidence")
    if (isinstance(label, str) and label in ITEM_LABELS and label != GENERIC_OBJECT
            and isinstance(confidence, (int, float)) and not isinstance(confidence, bool)
            and 0 <= confidence < threshold):
        return {**detection, "class": GENERIC_OBJECT}
    return detection
