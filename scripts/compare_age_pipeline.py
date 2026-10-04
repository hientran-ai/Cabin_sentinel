"""Trace one image through YOLO -> crop -> age classifier and diff it against the backend.

Needs a real YOLO weight and the real age checkpoint; nothing is simulated.

    python scripts/compare_age_pipeline.py --image cabin.jpg --model yolov8n.pt \
        --classifier best.pt --endpoint http://127.0.0.1:8000/api/v1/demo/analyze

Prints JSON with, per person: detector box, padded crop rectangle, class order from the
checkpoint, merged and raw probabilities and age_group (local), and the same fields from
the endpoint response, followed by the first field that differs.
"""

import argparse
import json
import sys
import uuid
from pathlib import Path
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def local_trace(image_path, model_path, classifier_path, conf, child_t, adult_t):
    import cv2
    from ultralytics import YOLO

    from src.vision.age import AgeClassifier

    frame = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if frame is None:
        raise SystemExit(f"cannot decode {image_path}")
    result = YOLO(str(model_path)).predict(
        frame, classes=[0, 15, 16], device="cpu", conf=conf, imgsz=640, verbose=False)[0]
    detections = [{"class": result.names[int(b.cls.item())], "confidence": float(b.conf.item()),
                   "bbox": b.xyxy[0].tolist()} for b in result.boxes]
    classifier = AgeClassifier(classifier_path, child_t, adult_t)
    people = [d for d in detections if d["class"] == "person"]
    for d, answer in zip(people, classifier.classify(frame, [d["bbox"] for d in people]), strict=True):
        d.update(answer)
    return {"image_shape_hwc": list(frame.shape), "classifier": classifier.describe(), "detections": detections}


def endpoint_trace(image_path, endpoint, scenario):
    boundary = uuid.uuid4().hex
    body = b"".join([
        f'--{boundary}\r\nContent-Disposition: form-data; name="scenario"\r\n\r\n{scenario}\r\n'.encode(),
        f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{image_path.name}"\r\n'
        f"Content-Type: image/{'png' if image_path.suffix.lower() == '.png' else 'jpeg'}\r\n\r\n".encode(),
        image_path.read_bytes(), f"\r\n--{boundary}--\r\n".encode(),
    ])
    request = Request(endpoint, data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urlopen(request, timeout=120) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--image", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--classifier", type=Path, required=True)
    parser.add_argument("--endpoint")
    parser.add_argument("--scenario", default="hot_locked")
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--child-threshold", type=float, default=0.5)
    parser.add_argument("--adult-threshold", type=float, default=0.9)
    args = parser.parse_args()
    local = local_trace(args.image, args.model, args.classifier, args.conf, args.child_threshold, args.adult_threshold)
    report = {"local": local}
    if args.endpoint:
        remote = endpoint_trace(args.image, args.endpoint, args.scenario)
        report["endpoint"] = remote["vision"]
        local_people = [d for d in local["detections"] if d["class"] == "person"]
        remote_people = [d for d in remote["vision"]["detections"] if d["class"] == "person"]
        diffs = []
        if len(local_people) != len(remote_people):
            diffs.append(f"person count local={len(local_people)} endpoint={len(remote_people)}")
        for i, (a, b) in enumerate(zip(local_people, remote_people)):
            for key in ("bbox", "age_crop", "age_group"):
                if a.get(key) != b.get(key):
                    diffs.append(f"person[{i}].{key} local={a.get(key)} endpoint={b.get(key)}")
            for cls in ("adult", "child"):
                x, y = (a.get("age_scores") or {}).get(cls), (b.get("age_scores") or {}).get(cls)
                if (x is None) != (y is None) or (x is not None and abs(x - y) > 1e-4):
                    diffs.append(f"person[{i}].age_scores.{cls} local={x} endpoint={y}")
        report["first_difference"] = diffs[0] if diffs else None
        report["all_differences"] = diffs
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
