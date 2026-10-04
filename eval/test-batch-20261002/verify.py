import argparse
import json
from pathlib import Path
import cv2
import numpy as np

root = Path(__file__).resolve().parents[2]
folder = Path(__file__).resolve().parent
names = ['instagram', 'funny-funny', 'people-original', 'family-vacation', 'you-would-swear']
parser = argparse.ArgumentParser()
parser.add_argument('--tag', default='preview')
args = parser.parse_args()
tiles, report = [], []
for name in names:
    summary = json.loads((folder / f'{name}-{args.tag}.summary.json').read_text())
    assert summary['complete'] and summary['processed_frames'] == summary['privacy']['exported_frames'] == 50
    capture = cv2.VideoCapture(str(root / 'data/videos/test-batch-20261002' / f'{name}-{args.tag}.mp4'))
    count, first = 0, None
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        count += 1
        if first is None:
            first = frame
    capture.release()
    assert count == 50
    tile = np.zeros((360, 220, 3), np.uint8)
    height, width = first.shape[:2]
    scale = min(220 / width, 330 / height)
    thumb = cv2.resize(first, (round(width * scale), round(height * scale)))
    tile[30:30 + thumb.shape[0], :thumb.shape[1]] = thumb
    cv2.putText(tile, name, (4, 20), cv2.FONT_HERSHEY_SIMPLEX, .4, (255, 255, 255), 1)
    tiles.append(tile)
    report.append({'name': name, 'decoded_frames': count, 'counts': summary['detections_by_class']})
cv2.imwrite(str(folder / f'contact-sheet-{args.tag}.jpg'), np.concatenate(tiles, axis=1))
(folder / f'verification-{args.tag}.json').write_text(json.dumps(report, indent=2))
print('Verified 5 videos, 250 decoded frames')
