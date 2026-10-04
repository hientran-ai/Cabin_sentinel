"""Render person-only boxes from completed vision logs, reusing recorded face masks."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--log', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    summary = json.loads(args.log.with_suffix('.summary.json').read_text(encoding='utf-8'))
    if not summary['complete'] or not summary.get('privacy'):
        parser.error('Requires a complete log with recorded face masks')
    partial = args.output.with_name(args.output.stem + '.partial.mp4')
    if args.output.suffix.lower() != '.mp4' or args.output.exists() or partial.exists():
        parser.error('Choose a new MP4 output')
    import cv2
    from src.vision.privacy import blur_boxes
    from src.vision.video import encode_h264

    cap = cv2.VideoCapture(summary['source'])
    width, height = summary['privacy']['export_size']
    args.output.parent.mkdir(parents=True, exist_ok=True)
    partial.touch(exist_ok=False)
    writer = cv2.VideoWriter(str(partial), cv2.VideoWriter_fourcc(*'mp4v'), summary['video_fps'], (width, height))
    count = 0
    try:
        if not cap.isOpened() or not writer.isOpened():
            raise RuntimeError('Cannot open video or output encoder')
        with args.log.open(encoding='utf-8') as log:
            for line in log:
                record = json.loads(line)
                ok, frame = cap.read()
                if not ok or record['frame_id'] != count + 1:
                    raise ValueError('Video/log frame mismatch')
                sx, sy = width / frame.shape[1], height / frame.shape[0]
                scale = lambda box: [v * (sx if i % 2 == 0 else sy) for i, v in enumerate(box)]
                view = cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA)
                view = blur_boxes(view, [scale(box) for box in record['privacy']['masked_boxes']])
                for detection in record['detections']:
                    if detection['class'] not in ('person', 'adult', 'child', 'infant'):
                        continue
                    x1, y1, x2, y2 = map(round, scale(detection['bbox']))
                    x1, x2 = max(0, min(width - 1, x1)), max(0, min(width - 1, x2))
                    y1, y2 = max(0, min(height - 1, y1)), max(0, min(height - 1, y2))
                    cv2.rectangle(view, (x1, y1), (x2, y2), (80, 220, 80), 2)
                    cv2.putText(view, 'person', (x1 + 4, max(22, y1 + 22)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (80, 220, 80), 2, cv2.LINE_AA)
                writer.write(view)
                count += 1
        extra, _ = cap.read()
        if extra or count != summary['processed_frames']:
            raise ValueError('Video/log length mismatch')
    finally:
        cap.release()
        writer.release()
    encode_h264(partial, args.output)
    exported = cv2.VideoCapture(str(args.output))
    decoded_count = 0
    try:
        while True:
            ok, _ = exported.read()
            if not ok:
                break
            decoded_count += 1
    finally:
        exported.release()
    if decoded_count != count:
        raise ValueError('Exported video frame mismatch')
    partial.unlink()
    print(f'Exported and decoded {count} frames: {args.output}')


if __name__ == '__main__':
    main()
