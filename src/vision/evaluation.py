"""Person detection metrics at one fixed IoU and confidence threshold."""


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
