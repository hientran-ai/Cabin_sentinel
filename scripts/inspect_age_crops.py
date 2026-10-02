"""Export numbered, unlabelled person crops for visual age annotation."""
import json
from pathlib import Path

import cv2
import numpy as np

from src.vision.age import padded_box

base = Path('data/videos/test-batch-20261002')
output = Path('data/real-age-review-20261002')
output.mkdir(exist_ok=True)
records = []
for name in ['instagram', 'funny-funny', 'people-original', 'family-vacation', 'you-would-swear']:
    rows = [json.loads(line) for line in Path(f'eval/test-batch-20261002/{name}-preview.jsonl').read_text().splitlines()]
    capture = cv2.VideoCapture(str(base / f'{name}-sample.mp4'))
    tiles = []
    for frame_id in [1, 15, 30, 45]:
        capture.set(cv2.CAP_PROP_POS_FRAMES, frame_id - 1)
        ok, frame = capture.read()
        assert ok
        for index, detection in enumerate(rows[frame_id - 1]['detections']):
            if detection['class'] in ['cat', 'dog']:
                continue
            box = padded_box(detection['bbox'], frame.shape[1], frame.shape[0])
            if box is None:
                continue
            x1, y1, x2, y2 = box
            crop = frame[y1:y2, x1:x2]
            ident = f'{name}-f{frame_id}-d{index}'
            cv2.imwrite(str(output / f'{ident}.jpg'), crop)
            record = {'id': ident, 'video': name, 'frame_id': frame_id, 'detection_index': index,
                      'bbox': detection['bbox'], 'crop': f'{ident}.jpg'}
            records.append(record)
            tile = np.full((244, 200, 3), 25, np.uint8)
            height, width = crop.shape[:2]
            scale = min(200 / width, 215 / height)
            image = cv2.resize(crop, (round(width * scale), round(height * scale)))
            tile[29:29 + image.shape[0], :image.shape[1]] = image
            cv2.putText(tile, f'f{frame_id} d{index}', (5, 20), cv2.FONT_HERSHEY_SIMPLEX, .5, (255,255,255), 1)
            tiles.append(tile)
    capture.release()
    columns = 4
    while len(tiles) % columns:
        tiles.append(np.full((244, 200, 3), 25, np.uint8))
    grid = np.concatenate([np.concatenate(tiles[i:i+columns], axis=1) for i in range(0, len(tiles), columns)], axis=0)
    cv2.imwrite(str(output / f'{name}-review.jpg'), grid)
(output / 'records.json').write_text(json.dumps(records, indent=2))
