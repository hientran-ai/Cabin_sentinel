# CabinSentinel V1 Online Demo

This is the synchronous image-upload path in `services/api/src/cabinsentinel/demo_api.py`.
`BUILD_PHASE/app` is an older reference prototype. V1 risk and action decisions
come from `services/api/src/cabinsentinel/service.py`, `rules.py` and `graph.py` in P-068.

## Model contract

Tâm's source is currently at the BaoTam branch, commit `3b78fd1`,
`scripts/run_vision.py`. Its CPU YOLO settings are `classes=[0,15,16]`
(`person`, `cat`, `dog`), `conf=0.25`, `imgsz=640`. The V1 provider at
`services/api/src/vision/provider.py` uses those settings for one uploaded image and returns
the same detector frame fields: `timestamp`, `frame_id`, `detections` and
`latency_ms`. `services/api/src/cabinsentinel/vision_adapter.py` converts that frame to the
canonical `VisionPayload`. The optional age classifier from Tâm's experiment is
not in V1; `child`/`adult` labels are rejected until their safety contract is
approved. A child may be detected as `person`; no age claim is made.

The inspected repositories have the Vision source but no tracked `.pt` weights.
For local smoke testing, an official stock `yolov8n.pt` was downloaded from
[Ultralytics Assets v8.3.0](https://github.com/ultralytics/assets/releases/tag/v8.3.0)
to `/private/tmp/cabinsentinel-v1-assets/yolov8n.pt` (6.2 MiB,
SHA-256 `f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36`).
This temporary file is not in Git and is not a custom Tâm-trained model. Supply
an approved YOLO weight file outside Git and set `MODEL_PATH` to its readable
path inside the container. The provider refuses a missing path rather than
downloading weights at runtime. Do not commit weights, evaluation images,
personal data or secrets. For local installation:

```bash
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt -r requirements-vision.txt
MODEL_PATH=/path/to/approved/yolov8n.pt \
  CABINSENTINEL_MQTT_ENABLED=false \
  .venv/bin/uvicorn src.main:app --host 0.0.0.0 --port 8000
```

`GET /health` returns HTTP 200 only when the Vision model and SQLite are ready
(and MQTT, if enabled, is connected). A missing or failed model returns 503 with
`vision: unavailable`. The model is loaded once at application startup and
reused. Run one API worker for this SQLite demo.
For Docker Compose, place the approved weight in `./models` or set `MODEL_DIR`
to its host directory, and set `MODEL_PATH=/app/models/<filename>.pt` in `.env`.
The `models/` directory is excluded from Git and the Docker build context.

## Request and response

```bash
curl -F 'image=@cabin.jpg;type=image/jpeg' -F 'scenario=hot_locked' \
  http://localhost:8000/api/v1/demo/analyze
```

The endpoint accepts JPEG or PNG up to `MAX_UPLOAD_SIZE_BYTES` (default 5 MiB).
It checks MIME, byte length, actual decoded format and `MAX_IMAGE_PIXELS`
(default 20 million). `MAX_CONCURRENT_DEMO_REQUESTS` defaults to one in-flight
analysis per worker; extra requests receive HTTP 503 with `Retry-After: 1`
before multipart parsing reads or spools their body. Keep the one-worker
SQLite demo setting unless measured memory and database behavior support
raising concurrency. Image bytes are passed to inference and discarded; no
raw image is written to application storage.
The multipart parser may use a temporary spooled file during a request.
Clients should treat capacity `503` as retryable and honor `Retry-After`.

Scenarios are `normal`, `parked_locked` and `hot_locked`. They supply a
`SensorPayload` marked `source: SIMULATED` in the response. The `vision` section
contains model detections, not a safety verdict. `reasoning` has the committed
CabinService `risk_level`, `rule_id`, `occupancy_state`, `decision_current` and
freshness. `actions` is the canonical `action_results` list, where each item has
`tool` and `status`. Horn/SMS/notification are `simulated`; unlock is
`pending_human_confirmation`. No physical action or message is sent.

Each request uses a new demo vehicle ID. Ingesting the simulated sensor before
its Vision frame can create an intermediate missing-Vision `ERROR` event; the
response reports the subsequent combined committed decision. This is a known
audit artifact of the existing single-source ingest contract, not an image
inference verdict.

## Container / Railway preparation

The Dockerfile installs the optional Vision dependencies, runs as a non-root
user and binds Uvicorn to `0.0.0.0:${PORT:-8000}`. Supply the model artifact via
an approved mount or image build strategy and set `MODEL_PATH` to its path.
The Docker build context excludes `.pt`, `.pth`, `.onnx`, data and local logs.
It installs PyTorch 2.14.0+cpu and torchvision 0.29.0+cpu from the
[official PyTorch CPU index](https://download.pytorch.org/whl/cpu/)
before the remaining requirements, matching the provider's CPU execution.
The image does not require CUDA; `pip check` validates installed dependencies.

The Docker and Compose healthchecks use `python -m src.healthcheck` to check
process/store liveness. They require an HTTP response with a ready backend and
SQLite; malformed responses or an unavailable database fail the probe. A live
backend without weights can pass this probe while `/health` still returns 503
with `vision: unavailable`. This is not evidence that image analysis is ready.
Railway readiness should use `/health`; provision the model before expecting 200.

Set `APP_ENV=production`, `CORS_ORIGINS` to the exact Vercel origin (and local
origin if needed), `CABINSENTINEL_DB_PATH=/app/data/cabinsentinel.db`, and
`CABINSENTINEL_MQTT_ENABLED=false` for V1. `DATABASE_URL` belongs to the older
template and is not the CabinSentinel SQLite setting. An ephemeral container
filesystem loses demo sessions on restart; mount a persistent volume only if
session history must survive. No MQTT broker is needed for the image request.

## Real-image smoke result (2026-09-27)

The stock YOLO weight and public [SVIRO cabin examples](https://sviro.kl.dfki.de/)
were tested locally on macOS with Python 3.12, Ultralytics 8.4.159 and the V1
API. This is a technical integration smoke, not an accuracy or safety study:

| Image | Visual scene | Detector | `hot_locked` result |
|---|---|---|---|
| `web_front_rgb.png` (960×640) | Adult and infant seat | `person` 0.905 | `PRESENT`, `HOT_OCCUPANT`, `CRITICAL` |
| `cayenne_image_0.png` (320×213) | Child/infant passengers | `person` 0.499 and 0.334 | `PRESENT`, `HOT_OCCUPANT`, `CRITICAL` |
| `cayenne_image_6.png` (320×213) | Child/infant passengers | `person` 0.289 and 0.262 | `SUSPECTED`, `SUSPECTED_OCCUPANT`, `WARNING` |
| `cayenne_image_5.png` (320×213) | Three child/infant passengers | No detection | `ABSENT`, `EMPTY_CABIN`, `SAFE` |
| [Dog on front seat](https://commons.wikimedia.org/wiki/File:Cute_dog_inside_modern_car_%2850011314403%29.jpg) (960×629) | Dog alone in cabin | `dog` 0.862 | `PRESENT`, `HOT_OCCUPANT`, `CRITICAL` |
| [Dog at car window](https://commons.wikimedia.org/wiki/File:Dog_inside_a_car.jpg) (960×960) | Dog in cabin | `person` 0.514 and `dog` 0.311 | `PRESENT`, `HOT_OCCUPANT`, `CRITICAL` |

The `cayenne_image_5.png` row is a serious model false negative on a
low-resolution example:
an apparently occupied cabin was reported as empty because the detector emitted
an empty frame and the simulated radar was `false`. The backend did not invent
occupancy evidence. Do not use this baseline to claim reliable child-alone
detection or safety readiness. Vision owner must evaluate representative cabin
images and calibrate/improve the model before that claim. The dog-at-window sample
also shows a false `person` label; its result does not prove dog-specific
accuracy. The sample images and
weight stay in `/private/tmp`, outside Git. Docker was unavailable during that
2026-09-27 check; the later container verification is recorded below.

An additional local Uvicorn process with `APP_ENV=production` served
`GET /health` (200), a Vercel-origin CORS preflight (200 with the configured
`Access-Control-Allow-Origin`), and a multipart POST of `cayenne_image_0.png`
(200, `person` evidence → `HOT_OCCUPANT/CRITICAL` and simulated actions).
This verifies the local HTTP server path; it is not a deployed Railway/Vercel
test.


## Docker verification (2026-09-28)

A Linux ARM64 image built successfully on Docker Desktop with Python 3.11,
Ultralytics 8.4.159 and CPU PyTorch 2.14.0+cpu. Registry/PyPI downloads were
slow and intermittently failed, so the local verification build used a temporary
Dockerfile with a local wheelhouse and `PIP_NO_INDEX=1`. All 94 wheels matched
the official PyPI/PyTorch SHA-256 values. The requirements, application source,
runtime stage and startup/health commands matched the repository Dockerfile;
the temporary additions only changed dependency transport in the builder.
`pip check` passed. The standard network-only build and Linux AMD64/Railway
runtime have not been verified here. Wheels/cache are outside Git.

The image retains Ultralytics' required Linux NVML helper (`nvidia-ml-py`);
PyTorch reports no CUDA runtime and CUDA/Triton packages are absent.
`YOLO_AUTOINSTALL=false` disables package installation at runtime. Upload
validation captures Pillow's decoder before model startup so the Vision
library's later PIL hook cannot trigger an optional HEIF dependency install
on malformed JPEG/PNG input. The HTTP error contract remains unchanged.

Two temporary production-configured containers were tested and removed:

- No weights: `/health` and valid-image analysis returned 503; backend/SQLite
  stayed ready and the Docker liveness probe passed, running as a non-root user.
- Read-only stock YOLO weight mount: `/health` returned 200. Actual uploads
  produced `HOT_OCCUPANT/CRITICAL` for `cayenne-0.png` and `dog-cabin-2.jpg`,
  `SUSPECTED_OCCUPANT/WARNING` for `cayenne-6.png`, and
  `ATTENDED_DRIVING/SAFE` for `cayenne-0.png` in the `normal` scenario.
- Actions remained `simulated` or `pending_human_confirmation`. The requests
  used the real CabinService/rules/LangGraph pipeline.
- Configured-origin CORS preflight passed; an unapproved origin was rejected.
  Corrupt/empty images, unsupported MIME, invalid scenario and a 6 MiB upload
  returned the expected 422/415/413 responses. `/app/data` held only SQLite
  files after analysis, with no persisted raw upload.

The exact new CI container-smoke shell was executed locally, including CPU,
non-root, auto-install-disabled and degraded-health checks. The backend suite
passed 138 tests and Ruff passed. This does not verify GitHub Actions, an online
Vercel/Railway deployment, model accuracy or physical vehicle actions. The stock
model false negative recorded above remains a Vision limitation.

Ultralytics [lists AGPL-3.0 and Enterprise licensing options](https://github.com/ultralytics/assets#license).
Review the chosen license and model artifact delivery before public deployment.
