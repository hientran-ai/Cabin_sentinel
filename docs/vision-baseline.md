# Vision baseline

Run from the repo root in the virtual environment:

Detector configuration and same-frame comparisons: [person accuracy](person-accuracy.md).

Optional foreground motion detection is available with `--motion`; see
[motion detection](motion-detection.md) for output fields and limitations.
Face-blurred MP4 export is available with `--mask-faces --video-output`;
see [face blurring](face-blurring.md).

```powershell
python -m pip install -r requirements-vision.txt
python scripts/run_vision.py --source data/videos/cabin_test.mp4
```

Requires local yolov8n.pt. Writes eval/detections.jsonl and
 eval/detections.summary.json. Use --output eval/another_run.jsonl for another
run; existing files are never overwritten. This script saves no images/video.

Frame IDs start at 1. timestamp is UTC processing time; video_time_ms is
computed from frame index and nominal FPS (constant-frame-rate video).
Boxes are [x1,y1,x2,y2] in original-image pixels. Frames without detections
still produce a record with detections: [].

latency_ms now measures CPU detection, detection assembly and optional age/motion
stages, excluding video decoding and JSON/file writes. Individual
detector_latency_ms and age_latency_ms fields separate model stages. Older
logs measured model.predict only; compare definitions before comparing runs. One warmup
prediction is excluded; frame 1 is processed again and logged. The summary
reports mean/p95 latency and processing_fps, which includes loop decoding
and logging but excludes model loading/warmup. Playback FPS is separate.

Detection counts are boxes across frames, not unique people. person does not
distinguish child/adult. These measurements do not establish precision/recall.
A frame-count mismatch raises an error and sets complete=false. Partial logs
from failed/interrupted runs must not be treated as successful output.

Optional child/adult classification: see [two-label pipeline](sviro-child-adult.md).
Historical infant scores are merged into child for existing three-class checkpoints.
The [binary SVIRO baseline](sviro-child-adult.md) and combined video results below
describe the previous two-class checkpoint.

## Combined video smoke test (2026-09-24)

The existing `data/videos/cabin_test.mp4` was processed with
`runs/age-baseline/best.pt`. Outputs: `eval/cabin-age-20260924.jsonl` and
`eval/cabin-age-20260924.summary.json`.

- Completed all 266 expected frames with sequential frame IDs.
- Across frames: 391 child boxes, 66 adult boxes, 200 person boxes with
  unknown age, and no cat/dog boxes. These are not unique people.
- Mean Vision latency: 650.73 ms; p95: 1,401.49 ms; processing: 1.42 FPS
  on CPU, compared with the source video's 25 FPS.
- This verifies execution and output structure only. The video has no reviewed
  ground-truth labels here, so these counts do not establish classification accuracy.

The combined pipeline is below real-time speed in this run. Profile CPU inference
and thread settings before deployment; the earlier detector-only latency uses a
different measurement definition and was collected in a separate run.
