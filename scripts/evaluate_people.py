"""Prepare manual annotations, then benchmark local person detectors on identical frames."""

import argparse
import base64
import json
import math
import os
import sys
import tempfile
from pathlib import Path
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.vision.evaluation import match_counts, metrics


def prepare(args):
    import cv2
    import numpy as np

    if not args.source.is_file() or args.count < 1 or args.output.exists():
        raise ValueError('Use an existing video, count >= 1 and a NEW output folder')
    cap = cv2.VideoCapture(str(args.source))
    try:
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if not cap.isOpened() or total < 1:
            raise ValueError('Cannot open video or determine frame count')
        selected = set(np.linspace(0, total - 1, min(args.count, total), dtype=int).tolist())
        args.output.mkdir(parents=True, exist_ok=False)
        frames, embedded = [], []
        for index in range(total):
            ok, frame = cap.read()
            if not ok:
                raise ValueError(f'Cannot decode frame {index + 1}')
            if index not in selected:
                continue
            name = f'frame-{index + 1:06d}.jpg'
            if not cv2.imwrite(str(args.output / name), frame):
                raise RuntimeError('Cannot save image')
            height, width = frame.shape[:2]
            frames.append(dict(image=name, frame_id=index + 1, width=width, height=height,
                               reviewed=False, boxes=[]))
            embedded.append('data:image/jpeg;base64,' + base64.b64encode((args.output / name).read_bytes()).decode())
    finally:
        cap.release()
    manifest = dict(source=str(args.source.resolve()), bbox_format='xyxy_original_pixels', frames=frames)
    (args.output / 'labels.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    template = (Path(__file__).parent / 'people_labeler.html').read_text(encoding='utf-8')
    payload = json.dumps(dict(manifest=manifest, images=embedded)).replace('<', '\\u003c')
    (args.output / 'label.html').write_text(template.replace('__PAYLOAD__', payload), encoding='utf-8')
    print(f'Prepared {len(frames)} frames. Open {args.output / "label.html"}')


def benchmark(args):
    import cv2
    import numpy as np
    import torch
    os.environ.setdefault('YOLO_CONFIG_DIR', tempfile.gettempdir())
    from ultralytics import YOLO

    if args.output.exists() or args.threads < 1 or not 0 < args.match_iou <= 1 or not 0 < args.nms_iou <= 1:
        raise ValueError('Use a NEW output path, threads >= 1 and match-iou/nms-iou in (0, 1]')
    manifest = json.loads(args.labels.read_text(encoding='utf-8'))
    frames = manifest['frames']
    if not frames:
        raise ValueError('No evaluation frames')
    if any(f['reviewed'] is not True for f in frames) and not args.allow_unreviewed:
        raise ValueError('Review EVERY frame first, or use --allow-unreviewed for speed-only benchmarking')
    for frame in frames:
        for box in frame['boxes']:
            if len(box) != 4 or not all(math.isfinite(v) for v in box) or not (
                0 <= box[0] < box[2] <= frame['width'] and 0 <= box[1] < box[3] <= frame['height']
            ):
                raise ValueError(f'Invalid box in {frame["image"]}')
    images = []
    for frame in frames:
        path = (args.labels.parent / frame['image']).resolve()
        if not path.is_relative_to(args.labels.parent.resolve()):
            raise ValueError('Image must be inside the evaluation folder')
        image = cv2.imread(str(path))
        if image is None or image.shape[:2] != (frame['height'], frame['width']):
            raise ValueError(f'Missing or incorrectly sized image: {path}')
        images.append(image)
    for model in args.models:
        if not model.is_file():
            raise ValueError(f'Local weights missing: {model}')
    if any(size < 32 or size % 32 for size in args.sizes) or any(not 0 < c <= 1 for c in args.confs):
        raise ValueError('Sizes must be multiples of 32; confidence thresholds in (0, 1]')
    torch.set_num_threads(args.threads)
    reviewed = all(f['reviewed'] is True for f in frames)
    runs = []
    for model_path in args.models:
        model = YOLO(str(model_path))
        if model.names.get(0) != 'person':
            raise ValueError('Expected a COCO-compatible detector with class 0 = person')
        for size in args.sizes:
            options = dict(classes=[0], imgsz=size, conf=min(args.confs), iou=args.nms_iou, device=args.device, verbose=False)
            model.predict(images[0], **options)  # warmup excluded
            latencies, predictions = [], []
            for image in images:
                started = perf_counter()
                result = model.predict(image, **options)[0]
                latencies.append((perf_counter() - started) * 1000)
                predictions.append([dict(bbox=box.xyxy[0].tolist(), confidence=float(box.conf.item()))
                                    for box in result.boxes])
            for conf in args.confs:
                filtered = [[p for p in group if p['confidence'] >= conf] for group in predictions]
                run = dict(model=str(model_path), imgsz=size, conf=conf, nms_iou=args.nms_iou,
                           boxes_across_frames=sum(map(len, filtered)),
                           latency_mean_ms=float(np.mean(latencies)), latency_p95_ms=float(np.percentile(latencies, 95)),
                           inference_fps=1000 / float(np.mean(latencies)),
                           metrics=None,
                           predictions=[dict(frame_id=f['frame_id'], detections=p) for f, p in zip(frames, filtered)])
                if reviewed:
                    counts = [match_counts(p, f['boxes'], args.match_iou) for f, p in zip(frames, filtered)]
                    run['metrics'] = metrics(*(sum(c[i] for c in counts) for i in range(3)))
                runs.append(run)
            print(f'Finished {model_path}, imgsz={size}', flush=True)
    report = dict(labels=str(args.labels), frames=len(frames), accuracy_available=reviewed,
                  annotation_provenance=manifest.get('annotation_provenance', 'Unspecified'),
                  ground_truth=[dict(frame_id=f['frame_id'], boxes=f['boxes']) for f in frames] if reviewed else None,
                  device=args.device, threads=args.threads, match_iou=args.match_iou,
                  latency_definition='Warmup excluded; predict only on predecoded images at minimum conf; threshold sweep reuses predictions',
                  limitations='Single-video samples do not establish generalization; metrics are fixed-IoU precision/recall/F1, not mAP',
                  runs=runs)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8') as output:
        json.dump(report, output, indent=2, allow_nan=False)
    print(f'Saved {args.output}; accuracy_available={reviewed}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    prep = commands.add_parser('prepare')
    prep.add_argument('--source', type=Path, required=True)
    prep.add_argument('--count', type=int, default=32)
    prep.add_argument('--output', type=Path, required=True)
    bench = commands.add_parser('benchmark')
    bench.add_argument('--labels', type=Path, required=True)
    bench.add_argument('--models', type=Path, nargs='+', default=[Path('yolov8n.pt')])
    bench.add_argument('--sizes', type=int, nargs='+', default=[640, 960])
    bench.add_argument('--confs', type=float, nargs='+', default=[0.15, 0.25, 0.4])
    bench.add_argument('--device', default='cpu')
    bench.add_argument('--threads', type=int, default=4)
    bench.add_argument('--match-iou', type=float, default=0.5)
    bench.add_argument('--nms-iou', type=float, default=0.7, help='Detector suppression threshold; separate from evaluation IoU')
    bench.add_argument('--allow-unreviewed', action='store_true')
    bench.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        (prepare if args.command == 'prepare' else benchmark)(args)
    except (ValueError, FileExistsError) as error:
        parser.error(str(error))


if __name__ == '__main__':
    main()
