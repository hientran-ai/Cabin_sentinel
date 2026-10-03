# BaoTam model package for Cabin

Source checked on 2026-10-03: [P-068 / BaoTam at f7c04a0](https://github.com/AI20K-Build-Phase-Cohort-4/P-068/tree/f7c04a0af31f7e7847a02a012e5d1c85f22e54fc).
Cabin now contains its offline inference modules: age/domain router, crop preparation helpers, motion, age overlay, detection evaluation and H.264 export, with `scripts/run_vision.py`, `scripts/evaluate_people.py` and the corresponding source tests.

The earlier Cabin audit overstated age-source integration: Cabin main had the YOLO adapter and face preview, but no `src/vision/age.py`. This patch adds the missing inference source. Training pipelines/datasets and private footage are outside this patch.

## Artifact inventory

| Artifact | Source and packaging | Current scope |
|---|---|---|
| `models/face_detection_yunet_2023mar.onnx` | Bundled 232,589-byte OpenCV Zoo model; pinned SHA-256 and MIT license included | Existing YuNet face preview and optional video export |
| `models/yolov8n.pt` | Official Ultralytics v8.3.0 stock release; setup script downloads and checks digest | Existing REST detector; model configuration remains explicit |
| `models/yolov8s.pt` | Official Ultralytics v8.3.0 stock release; setup script downloads and checks digest | Optional offline video detector recommended in BaoTam's report |
| `models/age-real-router-20261002.pt` | **MISSING**: upstream `runs/age-real-router-20261002/best.pt` is absent from Git, inspected source checkouts and P-068 GitHub Releases | Format-v2 inference source available; genuine trained checkpoint inference NOT_VERIFIED |

Exact URLs, source SHA, filenames, licenses and known model hashes are in [`vision-models.json`](../vision-models.json). YOLO stock weights are not a BaoTam-trained child detector. The age checkpoint has no published URL, checksum or distribution license available in this audit. The older baseline's published digest is not the latest router's digest.

The small face artifact is tracked directly so fresh clones and Docker images have the face model. Large detector weights and externally supplied checkpoints follow the repository's existing ignored-artifact convention, with reproducible setup. Git LFS is not required. Inference and risk rules never call the downloader.

## Prepare and check

Run from the repository root (Python 3.11+):

```sh
python -m pip install -r requirements.txt -r requirements-vision.txt
python scripts/prepare_vision_models.py --download
python scripts/prepare_vision_models.py --check --models yolov8n yolov8s yunet
python scripts/prepare_vision_models.py --check --models age-router
```

The last command intentionally exits 1 while the checkpoint is missing. `--download` downloads only public selected weights, on explicit invocation. It refuses a checksum mismatch and refuses to overwrite a different existing model. `--check` performs no network or disk writes. Reports contain all artifacts, `selected_ready` and `complete`; `complete` covers checksum inventory only (`integrity_only=true`, `inference_verified=false`), never safety or accuracy. Until the genuine age checkpoint is supplied, `complete=false` even when all public weights are verified.

VISION_AGENT/Tâm must supply the exact router checkpoint, its SHA-256, provenance and distribution permission. Import it using that supplied digest:

```sh
python scripts/prepare_vision_models.py \
  --age-checkpoint /absolute/path/to/best.pt \
  --age-sha256 SHA256_FROM_VISION_AGENT --models age-router
```

A local ignored `.pt.sha256` sidecar records the supplied integrity digest. No checkpoint is trained, guessed or replaced with a synthetic test fixture by this command. The command checks bytes; loading/schema checks and a real-model evaluation remain separate. The existing AgeClassifier rejects incompatible or untrained checkpoint schemas and uses `torch.load(weights_only=True)`.

## Offline research video

Without the age checkpoint, run detector/motion/privacy only:

```sh
python scripts/run_vision.py --source /absolute/path/to/public-sample.mp4 \
  --model models/yolov8s.pt --imgsz 640 --conf 0.4 --iou 0.5 \
  --motion --mask-faces --face-model models/face_detection_yunet_2023mar.onnx \
  --video-output /absolute/path/to/new-processed.mp4 \
  --output /absolute/path/to/new-detections.jsonl
```

When the genuine checkpoint is available, optionally add `--classifier models/age-real-router-20261002.pt`. Use new output names; the runner refuses overwrites, requires a local model and checks every exported frame before publishing the H.264 output. Audio is not preserved. The only source adaptations are model defaults under `models/`, temporary Ultralytics configuration location, and import formatting to satisfy Cabin lint.

Age labels, combined scores and motion from this research CLI are not ingested into CabinService or used by REST risk/actions. The existing API remains canonical `person/dog/cat`; no new confidence thresholds or safety mapping are adopted. CLI `child/adult` records remain incompatible with that backend adapter. Unknown age does not remove person evidence. REST/UI age capability remains unavailable or not integrated; this patch does not claim an age UI feature.

Raw frames reach detection; face masking works on a separate copy. YuNet may miss faces and does not guarantee anonymization. Official stock detector limitations and existing false-negative risks remain; no hardware or child-safety validation is claimed.

## Verification and handoff

See [`BAOTAM_MODEL_PACKAGE_VERIFICATION.md`](BAOTAM_MODEL_PACKAGE_VERIFICATION.md). The Docker CI job runs the optional inference suites in the CPU image, while the core test job skips optional suites if their dependencies are absent.

Next owner: VISION_AGENT supplies the exact trained router artifact/hash/license/evaluation. BACKEND_AGENT then verifies that genuine model through the offline runner; using age in risk requires an approved safety mapping. DEPLOY_AGENT separately publishes and verifies hosted preview/API availability. This PR does not deploy or merge itself.
