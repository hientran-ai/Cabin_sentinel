"""Store visually reviewed labels, without inheriting old model predictions."""
import json
from collections import Counter
from pathlib import Path

base = Path('data/real-age-review-20261002')
records = json.loads((base / 'records.json').read_text())
annotations = []
for row in records:
    name, frame, index = row['video'], row['frame_id'], row['detection_index']
    label, split, reason = None, None, 'Insufficient visible person or ambiguous infant/child boundary'
    if name == 'instagram':
        label, split = 'child', 'train'
    elif name == 'people-original':
        split = 'train'
        label = 'adult' if (frame == 1 or (frame in [15, 30] and index == 1) or frame == 45) else 'child'
    elif name == 'funny-funny' and index == 0:
        label, split = 'child', 'val'
    elif name == 'family-vacation' and index < 2 and not (frame == 1 and index == 1):
        label, split = 'child', 'test'
    if label:
        reason = 'Assistant visual review of unblurred crop and source context; approximate age category, not verified age'
    annotations.append(dict(row, label=label, split=split, annotation_source='assistant_visual_review', reason=reason))
(base / 'annotations.json').write_text(json.dumps(annotations, indent=2), encoding='utf-8')
print(dict(Counter(f"{r['split']}/{r['label']}" for r in annotations)))
