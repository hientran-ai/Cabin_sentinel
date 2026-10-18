"""Reproducible codec conversion and visual review frames; never generates detections."""
import concurrent.futures
import hashlib
import json
import subprocess
from pathlib import Path

import cv2
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "apps/cockpit-web/public/samples/scenarios"
EVIDENCE = ROOT / "docs/final-integration-20261017"
manifest = json.loads((MEDIA / "scenario_manifest.json").read_text())


def convert(s):
    source = MEDIA / s["video"]
    fallback = source.with_suffix(".webm")
    if not fallback.exists():
        subprocess.run(["ffmpeg", "-v", "error", "-n", "-i", str(source), "-an", "-c:v", "libvpx-vp9",
                        "-crf", "32", "-b:v", "0", "-row-mt", "1", "-threads", "2", str(fallback)], check=True)
    print(s["id"], "WebM ready", flush=True)
    return {"id": s["id"], "fallback_video": str(fallback.relative_to(MEDIA)),
            "sha256": hashlib.sha256(fallback.read_bytes()).hexdigest(), "audio": "removed"}


sheet = Image.new("RGB", (960, 8 * 208), "#0b1524")
draw = ImageDraw.Draw(sheet)
for row, s in enumerate(manifest["scenarios"]):
    cap = cv2.VideoCapture(str(MEDIA / s["video"]))
    for col, t in enumerate([0.5, 5.0, 9.0]):
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, frame = cap.read()
        if not ok:
            raise ValueError(f"Cannot decode {s['id']} at {t}")
        im = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)).resize((320, 180))
        sheet.paste(im, (col * 320, row * 208 + 28))
        draw.text((col * 320 + 8, row * 208 + 7), f"{s['id']} | actual frame {t:.1f}s", fill="white")
    cap.release()
sheet.save(EVIDENCE / "actual-frame-contact-sheet.jpg", quality=92)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    fallbacks = list(pool.map(convert, manifest["scenarios"]))
(EVIDENCE / "codec-fallbacks.json").write_text(json.dumps(fallbacks, indent=2) + "\n")
for name in ("ai-child", "child-rear", "empty-cabin"):
    source = MEDIA.parent / (name + ".mp4")
    fallback = source.with_suffix(".webm")
    if not fallback.exists():
        subprocess.run(["ffmpeg", "-v", "error", "-n", "-i", str(source), "-an", "-c:v", "libvpx-vp9",
                        "-crf", "32", "-b:v", "0", "-row-mt", "1", "-threads", "2", str(fallback)], check=True)
print("Eight actual clips and three legacy fallbacks converted; contact sheet ready", flush=True)
