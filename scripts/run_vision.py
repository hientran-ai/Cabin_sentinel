"""CPU video detection: one JSONL record per frame and a latency summary."""

import argparse
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--model", type=Path, default=Path("yolov8n.pt"))
    parser.add_argument("--output", type=Path, default=Path("eval/detections.jsonl"))
    parser.add_argument("--classifier", type=Path, help="Optional trained child/adult checkpoint")
    parser.add_argument("--child-threshold", type=float, default=0.5)
    parser.add_argument("--adult-threshold", type=float, default=0.9)
    args = parser.parse_args()
    if args.classifier is not None and not args.classifier.is_file():
        parser.error("Classifier checkpoint must exist")
    summary_path = args.output.with_suffix(".summary.json")
    if not args.source.is_file() or not args.model.is_file():
        parser.error("Source video and local model weights must exist")
    if args.output.exists() or summary_path.exists():
        parser.error("Output exists; choose a different --output path")
    os.environ.setdefault("YOLO_CONFIG_DIR", str(Path(__file__).resolve().parents[1]))
    import cv2
    import numpy as np

    import ultralytics
    from ultralytics import YOLO

    classifier = None
    if args.classifier is not None:
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from src.vision.age import AgeClassifier, apply_age

        classifier = AgeClassifier(args.classifier, args.child_threshold, args.adult_threshold)

    cap = cv2.VideoCapture(str(args.source))
    latencies = []
    counts = dict.fromkeys(["person", "cat", "dog"] + (["child", "adult"] if classifier else []), 0)
    detected = 0
    try:
        if not cap.isOpened():
            raise RuntimeError("Cannot open video")
        fps = cap.get(cv2.CAP_PROP_FPS)
        expected = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        ok, frame = cap.read()
        if not ok:
            raise RuntimeError("Cannot decode first frame")
        model = YOLO(str(args.model))
        options = dict(classes=[0, 15, 16], device="cpu", conf=0.25, imgsz=640, verbose=False)
        warmup = model.predict(frame, **options)[0]
        if classifier:
            person_boxes = [
                box.xyxy[0].tolist() for box in warmup.boxes if warmup.names[int(box.cls.item())] == "person"
            ]
            classifier.classify(frame, person_boxes)
        # Frame 1 is processed again below; warmup is excluded.
        args.output.parent.mkdir(parents=True, exist_ok=True)
        started = perf_counter()
        with args.output.open("x", encoding="utf-8") as output:
            while ok:
                timestamp = datetime.now(UTC).isoformat()
                start = perf_counter()
                result = model.predict(frame, **options)[0]
                detector_latency = (perf_counter() - start) * 1000
                detections = []
                for box in result.boxes:
                    label = result.names[int(box.cls.item())]
                    detections.append(
                        {
                            "class": label,
                            "confidence": float(box.conf.item()),
                            "bbox": box.xyxy[0].tolist(),
                        }
                    )
                age_latency = 0.0
                if classifier:
                    person_indices = [i for i, detection in enumerate(detections) if detection["class"] == "person"]
                    age_start = perf_counter()
                    age_results = classifier.classify(frame, [detections[i]["bbox"] for i in person_indices])
                    age_latency = (perf_counter() - age_start) * 1000
                    for index, age_result in zip(person_indices, age_results, strict=True):
                        detections[index] = apply_age(detections[index], age_result)
                latency = (perf_counter() - start) * 1000
                latencies.append(latency)
                for detection in detections:
                    counts[detection["class"]] += 1
                detected += bool(detections)
                frame_id = len(latencies)
                record = {
                    "timestamp": timestamp,
                    "frame_id": frame_id,
                    "video_time_ms": (frame_id - 1) * 1000 / fps if fps > 0 else None,
                    "detections": detections,
                    "latency_ms": latency,
                    "detector_latency_ms": detector_latency,
                    "age_latency_ms": age_latency,
                }
                output.write(json.dumps(record, allow_nan=False) + "\n")
                if frame_id % 50 == 0:
                    print(f"Processed {frame_id} frames", flush=True)
                ok, frame = cap.read()
        elapsed = perf_counter() - started
    finally:
        cap.release()
    complete = expected <= 0 or len(latencies) == expected
    summary = {
        "source": str(args.source),
        "model": str(args.model),
        "age_classifier": str(args.classifier) if args.classifier else None,
        "age_thresholds": {"child": args.child_threshold, "adult": args.adult_threshold} if classifier else None,
        "device": "cpu",
        "ultralytics_version": ultralytics.__version__,
        "imgsz": 640,
        "confidence_threshold": 0.25,
        "video_fps": fps,
        "expected_frames": expected,
        "processed_frames": len(latencies),
        "complete": complete,
        "frames_with_detections": detected,
        "detections_by_class": counts,
        "latency_mean_ms": float(np.mean(latencies)),
        "latency_p95_ms": float(np.percentile(latencies, 95)),
        "latency_definition": "CPU detector plus optional age classification and detection assembly; excludes decoding, serialization and writing",
        "warmup_predictions_excluded": 1,
        "processing_elapsed_seconds": elapsed,
        "processing_fps": len(latencies) / elapsed,
    }
    summary_path.write_text(json.dumps(summary, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    if not complete:
        raise RuntimeError("Frame count mismatch: output may be incomplete")


if __name__ == "__main__":
    main()
