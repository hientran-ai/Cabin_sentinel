"""Detection and crop-classification metrics without third-party dependencies."""

from numbers import Integral


def classification_metrics(confusion, classes, *, abstentions=False):
    """Actual rows, predicted columns; optional final column is unknown.

    Unknown decisions count as false negatives. Undefined ratios are None;
    macro scores average only classes with actual support.
    """
    size = len(classes)
    if not size or len(set(classes)) != size or len(confusion) != size:
        raise ValueError("Provide unique classes and one row per class")
    if any(len(row) != size + int(abstentions) for row in confusion):
        raise ValueError("Confusion matrix has incorrect column count")
    if any(not isinstance(value, Integral) or isinstance(value, bool) or value < 0
           for row in confusion for value in row):
        raise ValueError("Confusion counts must be nonnegative integers")
    matrix = [[int(value) for value in row] for row in confusion]
    support = [sum(row) for row in matrix]
    total = sum(support)
    correct = sum(matrix[i][i] for i in range(size))
    unknown = sum(row[-1] for row in matrix) if abstentions else 0
    per_class = {}
    for i, name in enumerate(classes):
        tp = matrix[i][i]
        fp = sum(row[i] for row in matrix) - tp
        fn = support[i] - tp
        per_class[name] = {**metrics(tp, fp, fn), "support": support[i]}
    present = [per_class[name] for i, name in enumerate(classes) if support[i]]

    def macro(key):
        values = [item[key] for item in present if item[key] is not None]
        return sum(values) / len(values) if values else None

    return {
        "classes": list(classes),
        "prediction_columns": [*classes, "unknown"] if abstentions else list(classes),
        "confusion_matrix_actual_rows": matrix,
        "samples": total,
        "accuracy": correct / total if total else None,
        "balanced_accuracy": macro("recall"),
        "macro_precision": macro("precision"),
        "macro_recall": macro("recall"),
        "macro_f1": macro("f1"),
        "weighted_f1": sum(item["f1"] * item["support"] for item in present) / total if total else None,
        "per_class": per_class,
        "unknown_count": unknown,
        "unknown_rate": unknown / total if total else None,
        "coverage": (total - unknown) / total if total else None,
        "selective_accuracy": correct / (total - unknown) if total > unknown else None,
        "macro_policy": "Actual-supported classes; undefined precision excluded from macro precision.",
    }


def box_iou(a, b):
    intersection = max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(
        0, min(a[3], b[3]) - max(a[1], b[1])
    )
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - intersection
    return intersection / union if union > 0 else 0.0


def match_counts(predictions, targets, threshold=0.5):
    """Confidence-ordered, one-to-one matching; duplicate boxes count as FP."""
    remaining = set(range(len(targets)))
    tp = 0
    for prediction in sorted(predictions, key=lambda item: item['confidence'], reverse=True):
        best = max(remaining, key=lambda index: box_iou(prediction['bbox'], targets[index]), default=None)
        if best is not None and box_iou(prediction['bbox'], targets[best]) >= threshold:
            remaining.remove(best)
            tp += 1
    return tp, len(predictions) - tp, len(remaining)


def metrics(tp, fp, fn):
    return {
        'tp': tp, 'fp': fp, 'fn': fn,
        'precision': tp / (tp + fp) if tp + fp else None,
        'recall': tp / (tp + fn) if tp + fn else None,
        'f1': 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None,
    }


def detection_ap(predictions, targets, threshold=0.5):
    """Single-class 101-point interpolated AP, matched within each image.

    Predictions must include low-confidence candidates, not just display boxes.
    No area ranges, crowd annotations, or max-detection caps are applied.
    """
    if len(predictions) != len(targets) or not 0 < threshold <= 1:
        raise ValueError("Use aligned image lists and IoU in (0, 1]")
    support = sum(map(len, targets))
    if not support:
        return None
    candidates = [(image, prediction) for image, group in enumerate(predictions) for prediction in group]
    candidates.sort(key=lambda item: item[1]["confidence"], reverse=True)
    remaining = [set(range(len(group))) for group in targets]
    tp = 0
    curve = []
    for rank, (image, prediction) in enumerate(candidates, start=1):
        best = max(remaining[image], key=lambda i: box_iou(prediction["bbox"], targets[image][i]), default=None)
        if best is not None and box_iou(prediction["bbox"], targets[image][best]) >= threshold:
            remaining[image].remove(best)
            tp += 1
        curve.append((tp / support, tp / rank))
    return sum(max((precision for recall, precision in curve if recall >= point / 100), default=0.0)
               for point in range(101)) / 101


def detection_ap_metrics(predictions, targets):
    values = {f"{(50 + i * 5) / 100:.2f}": detection_ap(predictions, targets, (50 + i * 5) / 100)
              for i in range(10)}
    present = [value for value in values.values() if value is not None]
    return {"ap50": values["0.50"], "ap75": values["0.75"],
            "person_ap50_95": sum(present) / len(present) if present else None,
            "ap_by_iou": values}
