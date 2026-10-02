"""Video detection: one JSONL record per frame and a latency summary."""

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
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--iou", type=float, default=0.7, help="NMS IoU threshold")
    parser.add_argument("--device", default="cpu", help="cpu or CUDA device index, e.g. 0")
    parser.add_argument("--threads", type=int, default=4, help="PyTorch CPU threads")
    parser.add_argument("--output", type=Path, default=Path("eval/detections.jsonl"))
    parser.add_argument(
        "--classifier", type=Path, help="Optional child/adult checkpoint; historical infant scores are merged into child"
    )
    parser.add_argument("--child-threshold", type=float, default=0.5)
    parser.add_argument("--adult-threshold", type=float, default=0.9)
    parser.add_argument("--motion", action="store_true", help="Measure foreground motion; never skip detection")
    parser.add_argument("--motion-warmup", type=int, default=30)
    parser.add_argument("--motion-min-area-ratio", type=float, default=0.001)
    parser.add_argument("--moving-threshold", type=float, default=0.02)
    parser.add_argument("--motion-width", type=int, default=640, help="Maximum processing width for motion")
    parser.add_argument("--mask-faces", action="store_true", help="Blur faces on exported video only")
    parser.add_argument("--face-model", type=Path, default=Path("data/models/face_detection_yunet_2023mar.onnx"))
    parser.add_argument("--face-threshold", type=float, default=0.3)
    parser.add_argument("--video-output", type=Path, help="New .mp4 output; requires --mask-faces")
    parser.add_argument("--video-width", type=int, default=1280, help="Maximum exported video width")
    args = parser.parse_args()
    if args.imgsz < 32 or args.imgsz % 32 or not 0 < args.conf <= 1 or not 0 < args.iou <= 1 or args.threads < 1:
        parser.error("imgsz must be a positive multiple of 32; conf/iou in (0, 1]; threads >= 1")
    if args.classifier is not None and not args.classifier.is_file():
        parser.error("Classifier checkpoint must exist")
    summary_path = args.output.with_suffix(".summary.json")
    if not args.source.is_file() or not args.model.is_file():
        parser.error("Source video and local model weights must exist")
    if args.output.exists() or summary_path.exists():
        parser.error("Output exists; choose a different --output path")
    partial_video = None
    h264_video = None
    if args.mask_faces != (args.video_output is not None):
        parser.error("Use --mask-faces and --video-output together")
    if args.mask_faces:
        if not 0 < args.face_threshold <= 1:
            parser.error("Face threshold must be in (0, 1]")
        if not args.face_model.is_file() or args.video_output.suffix.lower() != ".mp4" or args.video_width < 32:
            parser.error("Use a local face model, an .mp4 output, and video width >= 32")
        partial_video = args.video_output.with_name(args.video_output.stem + ".partial.mp4")
        h264_video = args.video_output.with_name(args.video_output.stem + ".h264.partial.mp4")
        if args.video_output.exists() or partial_video.exists() or h264_video.exists():
            parser.error("Video output exists; choose a new path")
        if args.video_output.resolve() in (args.output.resolve(), summary_path.resolve()):
            parser.error("Video and log output paths must differ")
    os.environ.setdefault("YOLO_CONFIG_DIR", str(Path(__file__).resolve().parents[1]))
    import cv2
    import numpy as np
    import torch

    import ultralytics
    from ultralytics import YOLO

    torch.set_num_threads(args.threads)
    cv2.setNumThreads(args.threads)

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    motion_detector = None
    if args.motion:
        from src.vision.motion import MotionDetector

        try:
            motion_detector = MotionDetector(
                args.motion_warmup, args.motion_min_area_ratio, args.moving_threshold, args.motion_width
            )
        except ValueError as error:
            parser.error(str(error))
    motion_counts = {"ready_frames": 0, "warming_up_frames": 0, "global_change_frames": 0, "frames_with_motion": 0}
    motion_latencies = []
    face_blurrer = None
    writer = None
    privacy_latencies = []
    face_count = 0
    if args.mask_faces:
        from src.vision.overlay import draw_detections
        from src.vision.privacy import FaceBlurrer

        face_blurrer = FaceBlurrer(args.face_model, score_threshold=args.face_threshold)

    classifier = None
    if args.classifier is not None:
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from src.vision.age import AgeClassifier, apply_age

        classifier = AgeClassifier(args.classifier, args.child_threshold, args.adult_threshold)

    cap = cv2.VideoCapture(str(args.source))
    latencies = []
    counts = dict.fromkeys(["person", "cat", "dog"] + (classifier.classes if classifier else []), 0)
    detected = 0
    try:
        if not cap.isOpened():
            raise RuntimeError("Cannot open video")
        fps = cap.get(cv2.CAP_PROP_FPS)
        expected = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        ok, frame = cap.read()
        if not ok:
            raise RuntimeError("Cannot decode first frame")
        if face_blurrer:
            if not np.isfinite(fps) or fps <= 0:
                raise ValueError("Valid source FPS required for video export")
            height, width = frame.shape[:2]
            export_width = min(width, args.video_width)
            export_height = max(2, round(height * export_width / width))
            export_size = (export_width - export_width % 2, export_height - export_height % 2)
            source_shape = frame.shape
            args.video_output.parent.mkdir(parents=True, exist_ok=True)
            # Reserve the partial output exclusively before opening the encoder.
            partial_video.touch(exist_ok=False)
            writer = cv2.VideoWriter(str(partial_video), cv2.VideoWriter_fourcc(*"mp4v"), fps, export_size)
            if not writer.isOpened():
                raise RuntimeError("Cannot initialize MP4 encoder")
        model = YOLO(str(args.model))
        options = dict(classes=[0, 15, 16], device=args.device, conf=args.conf, iou=args.iou, imgsz=args.imgsz, verbose=False)
        warmup = model.predict(frame, **options)[0]
        # Ultralytics CPU initialization resets PyTorch's thread count.
        torch.set_num_threads(args.threads)
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
                motion = None
                motion_latency = 0.0
                if motion_detector:
                    motion_start = perf_counter()
                    motion, motion_mask = motion_detector.update(frame)
                    motion_latency = (perf_counter() - motion_start) * 1000
                    motion_counts[motion["status"] + "_frames"] += 1
                    motion_counts["frames_with_motion"] += bool(motion["has_motion"])
                detector_start = perf_counter()
                result = model.predict(frame, **options)[0]
                detector_latency = (perf_counter() - detector_start) * 1000
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
                if motion_detector:
                    motion_start = perf_counter()
                    for detection in detections:
                        detection.update(motion_detector.for_box(motion_mask, detection["bbox"], motion["status"]))
                    motion_latency += (perf_counter() - motion_start) * 1000
                    motion_latencies.append(motion_latency)
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
                if motion_detector:
                    record.update({"motion": motion, "motion_latency_ms": motion_latency})
                if face_blurrer:
                    if frame.shape != source_shape:
                        raise ValueError("Video resolution changed during export")
                    privacy_start = perf_counter()
                    blurred, privacy = face_blurrer.apply(frame)
                    privacy_latency = (perf_counter() - privacy_start) * 1000
                    privacy_latencies.append(privacy_latency)
                    face_count += privacy["detected_faces"]
                    record.update({"privacy": privacy, "privacy_latency_ms": privacy_latency})
                    rendered = draw_detections(
                        cv2.resize(blurred, export_size, interpolation=cv2.INTER_AREA),
                        detections,
                        source_size=(frame.shape[1], frame.shape[0]),
                    )
                    writer.write(rendered)
                output.write(json.dumps(record, allow_nan=False) + "\n")
                if frame_id % 50 == 0:
                    print(f"Processed {frame_id} frames", flush=True)
                ok, frame = cap.read()
        elapsed = perf_counter() - started
    finally:
        cap.release()
        if writer is not None:
            writer.release()
    complete = expected <= 0 or len(latencies) == expected
    if face_blurrer:
        from src.vision.video import encode_h264

        encode_h264(partial_video, h264_video)
        exported = cv2.VideoCapture(str(h264_video))
        exported_frames = 0
        try:
            while True:
                decoded, _ = exported.read()
                if not decoded:
                    break
                exported_frames += 1
        finally:
            exported.release()
        complete = complete and exported_frames == len(latencies)
        if complete:
            h264_video.rename(args.video_output)
            partial_video.unlink()
    summary = {
        "source": str(args.source),
        "model": str(args.model),
        "age_classifier": str(args.classifier) if args.classifier else None,
        "age_thresholds": {
            "child": args.child_threshold,
            "adult": args.adult_threshold,
        }
        if classifier
        else None,
        "device": args.device,
        "torch_threads": args.threads,
        "ultralytics_version": ultralytics.__version__,
        "imgsz": args.imgsz,
        "confidence_threshold": args.conf,
        "nms_iou_threshold": args.iou,
        "video_fps": fps,
        "expected_frames": expected,
        "processed_frames": len(latencies),
        "complete": complete,
        "frames_with_detections": detected,
        "detections_by_class": counts,
        "latency_mean_ms": float(np.mean(latencies)),
        "latency_p95_ms": float(np.percentile(latencies, 95)),
        "latency_definition": "Detector plus optional age/motion stages and detection assembly; excludes decoding, serialization and writing",
        "warmup_predictions_excluded": 1,
        "processing_elapsed_seconds": elapsed,
        "processing_fps": len(latencies) / elapsed,
    }
    if motion_detector:
        summary["motion"] = {
            "algorithm": "MOG2",
            "max_processing_width": args.motion_width,
            "warmup_frames": args.motion_warmup,
            "min_area_ratio": args.motion_min_area_ratio,
            "moving_threshold": args.moving_threshold,
            **motion_counts,
            "latency_mean_ms": float(np.mean(motion_latencies)),
            "latency_p95_ms": float(np.percentile(motion_latencies, 95)),
        }
    if face_blurrer:
        summary["privacy"] = {
            "method": "YuNet plus smooth feathered oval blur",
            "face_model": str(args.face_model),
            "face_threshold": args.face_threshold,
            "video_output": str(args.video_output if complete else h264_video),
            "video_codec": "h264",
            "overlay": "child/adult; ? marks below-threshold argmax; motion status",
            "exported_frames": exported_frames,
            "export_size": list(export_size),
            "detected_faces_across_frames": face_count,
            "latency_mean_ms": float(np.mean(privacy_latencies)),
            "latency_p95_ms": float(np.percentile(privacy_latencies, 95)),
            "audio_preserved": False,
        }
    summary_path.write_text(json.dumps(summary, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    if not complete:
        raise RuntimeError("Frame count mismatch: output may be incomplete")


if __name__ == "__main__":
    main()
