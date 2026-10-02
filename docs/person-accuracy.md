# Person detection comparison

The video runner supports `--model`, `--imgsz`, `--conf`, `--iou`, `--device`
and `--threads`. Existing model/size/confidence defaults remain compatible;
four CPU threads are used by default. Model weights must exist locally.

```powershell
.venv/Scripts/python.exe scripts/run_vision.py --source data/videos/cabin_test.mp4 --model yolov8s.pt --imgsz 640 --conf 0.4 --iou 0.5 --output eval/cabin-s-new.jsonl
```

## Prepare labels

```powershell
.venv/Scripts/python.exe scripts/evaluate_people.py prepare --source data/videos/cabin_test.mp4 --count 32 --output data/person-eval-new
```

Open `data/person-eval-new/label.html` in a browser. Drag rectangles around every
visible person using visible body extent; confirm every image, including empty
images. Download `labels.json` and replace the template in the evaluation folder
with this downloaded file. Import saved labels to continue editing. The page
embeds images and works offline. Download edits before closing; no autosave.
Boxes use original-image xyxy coordinates.

The existing `data/person-eval-20261002/labels-assistant-reviewed.json` contains
preliminary assistant visual annotations of two visible occupants on all 32
frames, selected independently of predictions from 640x360 contact sheets and
scaled back to source resolution. Indistinct foreground fragments are excluded.
Import this file into that folder's `label.html` for independent human review.
The annotation recipe is `scripts/_annotate_cabin_sample.py`.

## Compare models

```powershell
.venv/Scripts/python.exe scripts/evaluate_people.py benchmark --labels data/person-eval-new/labels.json --models yolov8n.pt yolov8s.pt --sizes 640 960 --confs 0.15 0.25 0.4 --output eval/person-comparison-new.json
```

All configurations use identical frames. Confidence-ordered, one-to-one matching
at IoU 0.5 computes precision/recall/F1; duplicate boxes count as false positives,
unmatched people as misses. This is not mAP. Undefined ratios are null. Any
unreviewed frame blocks accuracy evaluation; `--allow-unreviewed` permits only a
speed smoke test with all metrics null. Output files/folders are not overwritten.

Latency excludes warmup, decoding, loading and file I/O. Each model/size runs at
minimum confidence; higher thresholds reuse predictions and share that timing.
These timings differ from full-video processing FPS.

Results: `eval/person-comparison-20261002.json`. More boxes or higher confidence
do not prove better detection. This short video is a configuration-development
sample, not an independent test set. Collect varied recordings with empty seats,
occlusion and low light; split whole recordings/cameras between train/validation/
test. Fine-tuning needs more independently reviewed cabin data. Keep final test
videos out of model/threshold selection. Age classification is separate and is
not evaluated here. The annotation page could not be browser-tested in the
current session because no connected browser was available.

An additional run, `eval/person-nms-comparison-20261002.json`, compared the
selected v8s/640/0.4 with `--nms-iou 0.5`: 64 TP, 2 FP, 0 FN versus 7 FP at
the default NMS IoU of 0.7. This chooses the explicit preliminary configuration
`--model yolov8s.pt --imgsz 640 --conf 0.4 --iou 0.5`. Evaluation matching IoU
and NMS IoU are separate parameters. A lower NMS IoU can suppress distinct
overlapping people, so this needs validation on crowded/occluded scenes.

The selected full run completed all 266 frames. See
[comparison report](../eval/results/person-comparison-report.md). Its person-only
review video is `data/videos/cabin-person-detection-20261002.mp4`, rendered from
the completed logs with `scripts/render_people.py`; the age-overlay version is
`data/videos/cabin-person-improved-20261002.mp4`. The age classifier is unchanged.
