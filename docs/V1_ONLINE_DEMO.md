# CabinSentinel V1 Online Demo

This is the synchronous image-upload path in `src/cabinsentinel/demo_api.py`.
`BUILD_PHASE/app` is an older reference prototype. V1 risk and action decisions
come from `src/cabinsentinel/service.py`, `rules.py` and `graph.py` in P-068.

## Model contract

Tâm's source is currently at the BaoTam branch, commit `3b78fd1`,
`scripts/run_vision.py`. Its CPU YOLO settings are `classes=[0,15,16]`
(`person`, `cat`, `dog`), `conf=0.25`, `imgsz=640`. The V1 provider at
`src/vision/provider.py` uses those settings for one uploaded image and returns
the same detector frame fields: `timestamp`, `frame_id`, `detections` and
`latency_ms`. `src/cabinsentinel/vision_adapter.py` converts that frame to the
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
weight stay in `/private/tmp`, outside Git. Docker build and container smoke
could not run because Docker CLI is unavailable on the current machine.

An additional local Uvicorn process with `APP_ENV=production` served
`GET /health` (200), a Vercel-origin CORS preflight (200 with the configured
`Access-Control-Allow-Origin`), and a multipart POST of `cayenne_image_0.png`
(200, `person` evidence → `HOT_OCCUPANT/CRITICAL` and simulated actions).
This verifies the local HTTP server path; it is not a deployed Railway/Vercel
test.

Ultralytics [lists AGPL-3.0 and Enterprise licensing options](https://github.com/ultralytics/assets#license).
Review the chosen license and model artifact delivery before public deployment.
