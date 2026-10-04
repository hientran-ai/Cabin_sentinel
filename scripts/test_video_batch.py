"""Create five-second previews and test all Vision stages on local videos."""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
os.environ["YOLO_CONFIG_DIR"] = str(ROOT)
NAMES = ["instagram", "funny-funny", "people-original", "family-vacation", "you-would-swear"]
VIDEOS = Path("data/videos/test-batch-20261002")
LOGS = Path("eval/test-batch-20261002")
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--classifier", default="runs/age-real-router-20261002/best.pt")
parser.add_argument("--tag", default="fixed")
args = parser.parse_args()
if not args.tag.isascii() or not all(char.isalnum() or char == '-' for char in args.tag):
    parser.error('Tag must be ASCII letters, digits, or hyphens')
results = []
for name in NAMES:
    sample = VIDEOS / f"{name}-sample.mp4"
    output = VIDEOS / f"{name}-{args.tag}.mp4"
    log = LOGS / f"{name}-{args.tag}.jsonl"
    print(f"Testing {name}", flush=True)
    if not sample.exists():
        subprocess.run([
            imageio_ffmpeg.get_ffmpeg_exe(), "-nostdin", "-hide_banner", "-loglevel", "error", "-n",
            "-i", str(VIDEOS / f"{name}.mp4"), "-t", "5", "-vf",
            "scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=10",
            "-c:v", "libx264", "-threads", "2", "-pix_fmt", "yuv420p", "-an", str(sample),
        ], check=True)
    completed = subprocess.run([
        sys.executable, "scripts/run_vision.py", "--source", str(sample), "--model", "yolov8s.pt",
        "--imgsz", "640", "--conf", "0.4", "--iou", "0.5", "--threads", "2",
        "--classifier", args.classifier, "--motion", "--motion-warmup", "10",
        "--mask-faces", "--video-output", str(output), "--output", str(log),
    ])
    results.append({"video": name, "exit_code": completed.returncode, "output": str(output),
                    "summary": str(log.with_suffix(".summary.json"))})
LOGS.joinpath(f"batch-{args.tag}-status.json").write_text(json.dumps({
    "sample_seconds": 5, "sample_fps": 10, "maximum_sample_size": [640, 640],
    "classes": ["adult", "child"], "classifier": args.classifier, "results": results,
}, indent=2), encoding="utf-8")
if any(result["exit_code"] for result in results):
    raise SystemExit(1)
