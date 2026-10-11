"""Run the detector over a test video and write the episodes it finds as JSON.

Used to put "video thử nghiệm" into the cabin log. Only labels, seats, confidences and times come out: no frames are kept or written.
Needs ultralytics + opencv (the team's vision environment has both). Example:
  python scripts/replay_video.py --model /path/yolov8n.pt --out episodes.json clip1.mp4 clip2.mp4
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

COCO_PERSON = 0
PETS = {15: "cat", 16: "dog"}
ITEMS = {24: "Ba lô", 26: "Túi xách", 28: "Vali", 77: "Gấu bông", 67: "Điện thoại", 39: "Chai nước"}
SEATS = ["rear_left", "rear_mid", "rear_right"]


def seat_of(cx: float, mirrored: bool = True) -> str:
    """Same rule as the app (PhoneSensor / Cabin.seat): thirds of the frame, flipped when the phone faces the rear row."""
    i = 0 if cx < 1 / 3 else 1 if cx < 2 / 3 else 2
    return SEATS[2 - i if mirrored else i]


def run(path: Path, model, sample_fps: float, conf: float) -> dict:
    import cv2
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    step = max(1, round(fps / sample_fps))
    samples: list[dict] = []
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % step == 0:
            h, w = frame.shape[:2]
            res = model.predict(frame, conf=conf, verbose=False, classes=[COCO_PERSON, *PETS, *ITEMS])[0]
            dets = []
            for b in res.boxes:
                c = int(b.cls[0]); x1, y1, x2, y2 = [float(v) for v in b.xyxy[0]]
                kind = "person" if c == COCO_PERSON else "pet" if c in PETS else "item"
                dets.append({"kind": kind, "name": ITEMS.get(c) if kind == "item" else None, "conf": round(float(b.conf[0]), 3),
                             "seat": seat_of((x1 + x2) / 2 / w), "box": [round(x1 / w, 3), round(y1 / h, 3), round((x2 - x1) / w, 3), round((y2 - y1) / h, 3)]})
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            samples.append({"t": round(idx / fps, 2), "dark": bool(gray.mean() < 12), "dets": dets})
        idx += 1
    cap.release()
    return {"clip": path.name, "fps": fps, "frames": total, "duration_s": round(total / fps, 2) if total else None, "sample_fps": sample_fps, "samples": samples}


def episodes(res: dict, gap_s: float = 1.5, min_s: float = 1.0) -> list[dict]:
    """Merge consecutive samples that see the same kind in the same seat into one episode."""
    out: list[dict] = []
    open_: dict[tuple, dict] = {}
    for s in res["samples"]:
        seen = {}
        for d in s["dets"]:
            key = (d["kind"], d["seat"], d["name"])
            if key not in seen or d["conf"] > seen[key]["conf"]:
                seen[key] = d
        for key, d in seen.items():
            e = open_.get(key)
            if e is None or s["t"] - e["end_t"] > gap_s:
                if e is not None:
                    out.append(e)
                e = open_[key] = {"kind": key[0], "seat": key[1], "name": key[2], "start_t": s["t"], "end_t": s["t"], "frames": 0, "conf_sum": 0.0, "conf_max": 0.0}
            e["end_t"] = s["t"]; e["frames"] += 1; e["conf_sum"] += d["conf"]; e["conf_max"] = max(e["conf_max"], d["conf"])
    out.extend(open_.values())
    final = []
    step = 1 / res["sample_fps"]
    for e in out:
        dur = e["end_t"] - e["start_t"] + step
        if dur < min_s:
            continue
        final.append({"kind": e["kind"], "seat": e["seat"], "name": e["name"], "start_t": e["start_t"], "duration_s": round(dur, 1), "frames": e["frames"],
                      "conf_mean": round(e["conf_sum"] / e["frames"], 2), "conf_max": round(e["conf_max"], 2)})
    final.sort(key=lambda x: (x["start_t"], x["kind"]))
    dark = sum(1 for s in res["samples"] if s["dark"])
    return [{"clip": res["clip"], "duration_s": res["duration_s"], "sampled": len(res["samples"]), "dark_samples": dark, "episodes": final}] if final or dark else \
           [{"clip": res["clip"], "duration_s": res["duration_s"], "sampled": len(res["samples"]), "dark_samples": 0, "episodes": []}]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--sample-fps", type=float, default=2.0)
    ap.add_argument("--conf", type=float, default=0.35)
    ap.add_argument("videos", nargs="+")
    a = ap.parse_args()
    from ultralytics import YOLO
    model = YOLO(a.model)
    result = {"model": Path(a.model).name, "sample_fps": a.sample_fps, "conf": a.conf, "clips": []}
    for v in a.videos:
        res = run(Path(v), model, a.sample_fps, a.conf)
        result["clips"].extend(episodes(res))
        c = result["clips"][-1]
        print(f"{c['clip']}: {c['duration_s']}s, {c['sampled']} mẫu, {len(c['episodes'])} đoạn", file=sys.stderr)
    Path(a.out).write_text(json.dumps(result, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
