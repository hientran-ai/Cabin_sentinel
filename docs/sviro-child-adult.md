# SVIRO child/adult baseline

The system uses two age labels: `child` includes both historical infant and child
categories; `adult` is unchanged. Existing binary, three-class and domain-adapter
checkpoints remain usable. For three-class checkpoints, child and infant scores
are added before thresholding, JSONL output, counts and video overlays. Uncertain
cases still use `unknown` internally and display `?`.

New preparation/training defaults are `data/sviro-child-adult` and
`runs/age-child-adult`. Use a fresh output directory when those already exist.
The metrics below are historical results; this change does not retrain a model.

Run commands from `D:\P-068` using `.venv\Scripts\python.exe`.

## What is implemented

`YOLOv8n -> person box -> padded RGB crop -> MobileNetV3 Small -> child/adult/unknown -> JSONL`.
Dog and cat detections stay on the original detector. Age classification is opt-in via `--classifier`.

The raw dataset is in `data/sviro`. Only BMW X5 RGB whole scenes, bounding boxes,
seat-aware masks, and keypoints were selected. The other vehicle packages are not required.

SVIRO detection class 3 means **person**, not adult. Preparation matches each person
box to the seat-specific person mask (IoU >= 0.5, margin over the next seat >= 0.1),
then reads that seat's classification label from the filename:

| Seat label | Training label |
| --- | --- |
| 1: infant in infant seat | child |
| 2: child in child seat | child |
| 3: adult | adult |
| 0, 4, 5, 6: empty/object/empty child or infant seat | excluded |

No age label is inferred from pixel height or box size. Empty child seats are **not**
adult examples. This binary classifier has no explicit non-person/empty-seat class:
a YOLO false positive can still be misclassified. Confidence abstention does not
guarantee rejection of unfamiliar inputs.

Mask positions are used to build training labels only. At inference, crops come
from YOLO; no fixed seat positions are required.

## Verified annotation audit

`eval/sviro-age-audit/summary.json` covers all 2,500 scenes and matches 2,275 people
without a rejected box under the matching rules above. This is a label-consistency
audit, not a visual accuracy or model-quality evaluation.

| Split | Adult crops | Child crops |
| --- | ---: | ---: |
| Train | 737 | 758 |
| Validation | 155 | 182 |
| Official test | 234 | 209 |

The official 500 test scenes are never used for training/model selection.
A deterministic seed-68 scene split partitions the 2,000 official training scenes
into 1,627 train and 373 validation scenes. All crops of a scene stay together.
Human identities/textures may occur in both train and validation; this split
does not prove generalization to unseen people. The official test uses its
original held-out assets, but is still synthetic and restricted to one vehicle.

## Download, prepare and train

### Completed local baseline

The existing pipeline has completed all downloads, crop preparation and five
training epochs. The selected checkpoint is epoch 4 at
`runs/age-baseline/best.pt`; do not rerun bootstrap into these existing outputs.
The saved report and independent checkpoint review agree on these results:

| Evaluation | Adult recall (argmax) | Child recall (argmax) | Balanced accuracy |
| --- | ---: | ---: | ---: |
| Validation: 337 crops | 100% | 100% | 100% |
| Official test: 443 crops | 100% | 91.39% | 95.69% |

At the default decision thresholds, the 209 test child crops produce 191
`child`, 13 `unknown`, and 5 incorrect `adult` decisions. All 234 adult crops
produce `adult`. The subtype review finds 109/109 infants recognized as child,
but only 82/100 non-infant children; all 18 child misses are in the latter group.
Do not interpret the aggregate score as reliable real-cabin performance.

The review reports no shared scenes or byte-identical crops across splits;
this does not rule out shared human identities/textures. Evidence is stored
locally in `runs/age-baseline/report.json` and
`runs/age-baseline/review/verification.json` (the `runs/` directory is ignored
by Git). Checkpoint SHA-256:
`fd825b07ba9bdac63c93278d36d1197de0d70c6fd9c9339058d1e85cc9d12f74`.

### Reproduce in new output directories

Progress of the existing downloader: `data/sviro/subset-download-status.json`.
Only files ending in `.zip` have passed the downloader's ZIP checks; `.zip.part`
is incomplete. Do not start another downloader while one is running.

The local ImageNet backbone is `data/models/mobilenet_v3_small-047dcff4.pth`.
Its SHA-256 was checked against the published filename hash prefix.
Training and inference do not download models.

To wait for the download, verify/extract the ZIPs, prepare crops and train 5 epochs:

```powershell
.venv\Scripts\python.exe -m src.vision.bootstrap --wait
```

The status is saved in `runs/age-baseline-pipeline-status.json`.
The waiting script does not restart a stopped downloader. Keep the downloader
and waiting process running until completion. Errors are recorded as `failed`.

Separate steps, if needed:

```powershell
.venv\Scripts\python.exe -m src.vision.prepare_sviro --audit-only --output eval/another-audit
# After extracting all selected archives:
.venv\Scripts\python.exe -m src.vision.prepare_sviro
.venv\Scripts\python.exe -m src.vision.train_age --epochs 5
```

Output directories must be new, preventing accidental overwrite of datasets/runs.
If an earlier preparation/training failed, inspect that output and choose a new
`--crops` / `--output` directory when rerunning bootstrap.

Training freezes the ImageNet feature extractor and batch-normalization statistics,
trains the classification head with class-weighted cross entropy, and chooses the
best epoch by validation balanced accuracy. Test evaluation happens only afterwards.
`runs/age-baseline/best.pt` is the checkpoint; `report.json` contains confusion matrices,
adult/child recall and decisions including abstentions. Metrics are crop classification
metrics, not detector recall or end-to-end safety performance.

## Video inference

```powershell
.venv\Scripts\python.exe scripts/run_vision.py --source data/videos/cabin_test.mp4 --classifier runs/age-baseline/best.pt --output eval/cabin-age.jsonl
```

Both preparation and inference pad the person box by 10%, clip to the image,
resize the entire crop to 224 x 224 and normalize with ImageNet statistics.
The default provisional decisions are child score >= 0.5, adult score >= 0.9,
otherwise unknown. Tune thresholds on appropriate validation data; softmax scores
are not calibrated probabilities. Uncertain detections keep `class: person`.

Classified detections contain `age_group`, both `age_scores`, and the original
`detector_confidence`. Their `confidence` is the detector score multiplied by
the selected age score, explicitly marked
`confidence_type: uncalibrated_detector_times_age`. It is a heuristic score.

Each frame logs detector time, age-classifier time and total Vision time.
Warmup on the first frame is excluded; if no person is present there, later age
inference may still include first-use overhead. Total Vision time excludes decode,
JSON serialization, logging and network delivery.

YOLO misses cannot be recovered by the crop classifier. Results require evaluation
on real cabin footage, including occlusion and empty child seats, before use in alerts.
The backend integration and video test collection were deferred at the user's request.

## Checks

```powershell
.venv\Scripts\python.exe -m unittest tests.test_vision_age -v
.venv\Scripts\ruff.exe check --no-cache src/vision scripts/run_vision.py tests/test_vision_age.py
```

Sources: [SVIRO labels and splits](https://sviro.kl.dfki.de/data/),
[SVIRO annotation format](https://sviro.kl.dfki.de/data-format/),
[MobileNetV3 Small](https://docs.pytorch.org/vision/stable/models/generated/torchvision.models.mobilenet_v3_small.html).
