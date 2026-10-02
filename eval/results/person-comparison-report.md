# Cabin person detection comparison — 2026-10-02

Compared YOLOv8n and YOLOv8s at 640/960 with confidence thresholds
0.15/0.25/0.4 on the same 32 uniformly sampled frames of `cabin_test.mp4`.
Two visible occupants were annotated on each frame: 64 boxes total, not 64
unique people. This is a preliminary configuration-development evaluation.

Annotations were selected visually by the assistant from 640x360 contact sheets,
independently of detector predictions, then scaled to the 3840x2160 source.
They are not independently human-reviewed. Indistinct foreground fragments were
excluded; visible body extent defines boxes. Review that convention and the box
boundaries before using these metrics for any accuracy claim.

One-to-one confidence-ordered matching at IoU 0.5:

| Model | Image size | Conf | TP | FP | FN | Precision | Recall | F1 | Inference FPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| v8n | 640 | 0.25 | 64 | 16 | 0 | 80.00% | 100% | 88.89% | 5.19 |
| v8n | 640 | 0.40 | 62 | 4 | 2 | 93.94% | 96.88% | 95.38% | 5.19 |
| v8s | 640 | 0.25 | 64 | 15 | 0 | 81.01% | 100% | 89.51% | 1.56 |
| v8s | 640 | 0.40 | 64 | 7 | 0 | 90.14% | 100% | 94.81% | 1.56 |
| v8n | 960 | 0.40 | 62 | 14 | 2 | 81.58% | 96.88% | 88.57% | 2.65 |
| v8s | 960 | 0.40 | 64 | 13 | 0 | 83.12% | 100% | 90.78% | 1.17 |

An additional NMS run at `iou=0.5` with v8s/640/conf=0.4 produced 64 TP, 2 FP,
0 FN: precision 96.97%, recall 100%, F1 98.46%. Results and predictions are in
`eval/person-nms-comparison-20261002.json`. Its inference FPS was 1.76; another
video process was active, so do not compare that timing as a controlled speed
improvement. NMS IoU is distinct from the evaluation matching IoU of 0.5.

For a preliminary version favoring fewer missed occupants, select
v8s/640/conf=0.4/NMS IoU=0.5. Lower NMS can suppress distinct overlapping people;
validate crowded/occluded scenes separately.
It reduced false positives from the existing v8n/640/0.25 baseline's 16 to 2
without missing any annotated occupant in this sample. v8n/640/0.4 is a faster
alternative with higher sample F1 but two missed boxes. Increasing input size
did not improve these sample results. Existing CLI defaults were preserved;
the selected configuration is explicit in the output command.

CPU, four PyTorch threads, warmup excluded. FPS times inference on predecoded
images only. Threshold sweeps reuse minimum-confidence predictions, so timings
are shared within each model/size, not separate measurements per threshold.
The full-video pipeline also includes classification, face blur and encoding.
Timing variation between separate runs means this is not a controlled hardware
benchmark.

Machine-readable results including predictions and annotation boxes:
`eval/person-comparison-20261002.json`. Speed-only unreviewed baseline:
`eval/person-n-speed-20261002.json` (no accuracy metrics).

The comparison does not validate infant/child/adult classification, nor does it
prove performance on other cameras or videos. The 32 frames are correlated
samples from one short clip, used to choose a configuration. No fine-tuning was
performed on this sample. Collect and independently label multiple recordings;
split by recording/camera and reserve a separate final test before training or
claiming deployed accuracy.

## Reproduce the selected full-video output

```powershell
.venv/Scripts/python.exe scripts/run_vision.py --source data/videos/cabin_test.mp4 --model yolov8s.pt --imgsz 640 --conf 0.4 --iou 0.5 --classifier runs/age-three-class/best.pt --mask-faces --video-output data/videos/cabin-person-improved-20261002.mp4 --output eval/cabin-person-improved-20261002.jsonl
```

Choose new output filenames to rerun. The age checkpoint is the existing
three-class baseline, unchanged; age labels in this export are not validated.
The exported video blurs detected faces, uses H.264, and has no audio.

## Full-video verification

The selected configuration completed and exported all 266 frames. End-to-end
CPU throughput including age classification, privacy and writing was 0.79 FPS;
it is not real-time. Mean detector/age assembly latency was 671 ms; privacy was
524 ms on average, measured separately. Other processes were active during
part of this run, so timing comparisons need a controlled rerun.

Scoring the actual decoded-video detections on those same 32 annotated frame IDs
gives baseline 64 TP / 17 FP / 0 FN versus improved 64 TP / 2 FP / 0 FN.
The baseline's extra FP differs from the sampled-JPEG benchmark because lossy
JPEG preprocessing changes inference. The improved precision is 96.97%, recall
100%, F1 98.46% on this development sample. The machine-readable audit is
`eval/person-video-log-audit-20261002.json`.

To inspect detection separately from the unvalidated age classifier:

```powershell
.venv/Scripts/python.exe scripts/render_people.py --log eval/cabin-person-improved-20261002.jsonl --output data/videos/cabin-person-detection-20261002.mp4
```

This person-only rendering uses the existing detections and recorded face masks;
it does not rerun models or change predictions. It retains the source playback
rate, outputs H.264 without audio, and verifies the decoded frame count.

Verification: all 27 vision unit tests pass; the empty-check video completed
three frames with zero detections at conf 0.4; labeler JavaScript syntax checked.
The annotation page's browser interaction remains untested because no connected
browser is available in this session.
