# BaoTam → camera → backend → privacy preview

Task `BAOTAM-REALTIME-20261003`; owner BACKEND_AGENT (integration, including authorized frontend wiring). Work stays in BUILD_PHASE; P-068 and hosted Space are unchanged.

## Source audit and correction

On 2026-10-03 a direct GitHub `ls-remote`/fetch found BaoTam at **f7c04a0af31f7e7847a02a012e5d1c85f22e54fc**. The earlier audit used an obsolete cached `3b78fd1` ref and incorrectly described the current branch as lacking face blur. That finding is superseded.

The separate clone is `BUILD_PHASE/BaoTam-vision`, branch BaoTam tracking `github/BaoTam`. The new branch has face privacy, motion, video export and age adaptation. `src/vision/privacy.py` and its tests were ported to the active backend snapshot; its pure `padded_box` helper was copied locally to avoid importing the entire age classifier for crop math. The blurring algorithm, 0.3 face score threshold, 10% padding, soft oval and three-frame history were preserved.

YuNet artifact: `models/face_detection_yunet_2023mar.onnx`, SHA-256 **8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4**. Downloaded from the [official OpenCV Zoo model](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet), as specified by BaoTam. Model license: MIT. Artifact is local/ignored; source and instructions are reviewable. The adapter checks its hash and does no inference-time downloads.

The latest branch's API `TamVisionProvider` still uses YOLOv8n with canonical person/dog/cat and deliberately excludes age labels. Its CLI can use a newer age-router checkpoint at `runs/age-real-router-20261002/best.pt`; that artifact is not tracked, is absent locally, and no GitHub Release assets were published. Age model runtime remains NOT_VERIFIED. No new safety mapping or detector thresholds were inferred from evaluation examples.

## User decisions and change intent

`DECISION-20261003-BAOTAM-PRIVACY`: user identified BaoTam, asked to inspect its existing masking and connect the complete flow. Latest direct request supersedes the stale-ref questions about substituting person-box or full-frame masking. Implement the branch's actual face masking on the preview. Its documented pipeline feeds original frames to detection and masks a separate copy. Earlier request to keep alerts inline remains in effect.

Additive migration: accepted `camera_frame` responses now optionally include `preview`. Existing request parameters, named endpoints, auth, freshness, canonical state, revision, actions and persistence schemas are unchanged. Old clients ignore the extra field. New clients withhold preview on old servers or invalid/missing/expired preview. Deploy backend with its face artifact before frontend if preview availability must be continuous. Rollback removes the optional presentation extension; safety state is unaffected.

## Contract matrix

All camera calls use POST `/gradio_api/call/{name}` then GET its event SSE. Upload uses POST `/gradio_api/upload`.

| Function | Call/request | Response | Auth/session | Errors/support |
|---|---|---|---|---|
| Start camera | `camera_start`: scenario, browser/Pi | session + credential; NO_FEED / not current | credential issued once | existing V1; no default SAFE |
| Read state | `camera_status`: session, token | committed risk, freshness, frame metadata | session token | unauthorized/session missing; read-only, no preview image |
| Process frame | `camera_frame`: session, token, uploaded image, sequence, capture time | existing risk/actions/detections + optional preview below | same session | duplicate/out-of-order/invalid/stale existing behavior |
| Face preview | within accepted `camera_frame` | processed JPEG data URL, face/mask count, frame binding | same authorized frame call | UNAVAILABLE on model/decode/face/encode failure; no raw fallback |
| Stop/report | `camera_stop`, `camera_report` | stopped/error/no-feed state | session token | invalidates pending inference and preview |
| Upload photo | REST POST `/api/v1/demo/analyze` multipart image/scenario/session | existing reasoning + simulated actions | existing demo credentials | unchanged; browser checked valid/corrupt upload and double submit |
| Age labels | CLI classifier checkpoint | child/adult/unknown JSONL | not wired into safety | artifact absent; no approved risk mapping |
| Motion/video export | BaoTam CLI | local video/JSONL | outside camera V1 UI | source unit-tested; not a new frontend/API requirement |

Example optional preview fields: `status=PROCESSED`, `method=YUNET_SOFT_OVAL`, `model_sha256`, `sequence`, `captured_at`, `width`, `height`, `detected_faces`, `masked_regions`, `latency_ms`, `data_url=data:image/jpeg;base64,...`. On failure only status UNAVAILABLE, a generic reason and frame binding are returned. Failed privacy processing does not turn a CRITICAL backend decision into ERROR/SAFE; it hides the preview. If total processing exceeds the existing 3-second capture TTL, the frame is rejected before commit.

Each session owns its mask history. Status/duplicate responses do not replay images; preview JPEGs are not stored in CabinService/SQLite. Frontend draws only decoded processed images matching the response frame, clears on error/stop and hides after 3 seconds. No raw-camera preview is used while waiting. Raw capture still reaches the backend/Gradio upload cache: this is **not** an end-to-end no-storage or anonymization guarantee. YuNet can miss small/profile/occluded faces, as the UI states. Per-person `faceBlurred` remains unverified because face detections are independent of person boxes.

## Run locally

Python 3.12, dependencies in `requirements.txt`, plus Gradio matching README SDK version 6.29.0. This verification used torch 2.14.1 / OpenCV 5.0.0 / Gradio 6.29.0 in an existing temporary runtime; it does not prove every dependency/platform combination.

```sh
# From Cabin-backend-live-snapshot:
mkdir -p models
curl -fL https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx -o models/face_detection_yunet_2023mar.onnx
shasum -a 256 models/face_detection_yunet_2023mar.onnx
# Must match the full checksum above. See .env.example for optional path override.
PORT=7863 CORS_ORIGINS=http://127.0.0.1:5183,http://localhost:5183 python3.12 app.py
```

For this checkout's prepared local runtime:

```sh
PORT=7863 CABINSENTINEL_DB_PATH=/private/tmp/cabinsentinel-baotam-privacy.db CORS_ORIGINS=http://127.0.0.1:5183,http://localhost:5183 GRADIO_ANALYTICS_ENABLED=false PYTHONPATH=/private/tmp/cabinsentinel-camera-deps:/private/tmp/cabinsentinel-realtime-runtime /opt/homebrew/bin/python3.12 app.py
```

Set both `VITE_API_BASE_URL` and `VITE_CAMERA_API_BASE_URL` to `http://127.0.0.1:7863` in `Cabin-frontend/frontend/.env.local`, run `npm run build`, then `npm run preview -- --host 127.0.0.1 --port 5183`. Open `http://127.0.0.1:5183/#live-cabin`, consent to original-frame transmission, and start camera. No client secrets are placed in env. HTTPS/localhost and browser camera permission are required.

## Evidence and limits

- Backend current-source regression: 181 tests pass; local camera/privacy suite and frontend final results are recorded in `evidence-baotam-privacy/` test logs.
- BaoTam vision source suite: 36 tests + 11 subtests pass (privacy, age model structure/adapters, motion, overlay, video, evaluation). This is not inference evidence for the unavailable trained age checkpoint.
- Local production browser5183 → backend7863, public sample as a fake camera: YOLO detects 4 people; YuNet masks 2 faces in the resized frame, CRITICAL is current, initial horn/SMS results simulated and unlock pending. Subsequent frames preserve the incident and do not replay those actions. Screenshot: `evidence-baotam-privacy/realtime-face-blur.png`.
- Outage browser test: preview blank `[39,59,62,255]`, current decision unavailable, raw video hidden; no full-screen modal. `browser-outage.json`, `backend-outage.png`.
- REST browser upload: corrupt image 422; valid image 200/CRITICAL/current with simulated actions. Double submit produces only one valid request. `browser-upload.json`.
- Model-backed HTTP smoke has 9 checks: health, CORS, missing frame, processed frame, duplicate revision, image-free reads, wrong-token rejection, stale rejection and stop. `http-receipt.json`. Reproduce via `scripts/verify_privacy_http.py --image <public-test-image> --output <receipt.json>`.
- CODE_CHANGED: YES. TEST_EXECUTED: YES. INTEGRATION_VERIFIED: local camera/YOLO/YuNet/backend/dashboard and existing image upload. RUNTIME_VERIFIED: local CPU + fake camera. Hardware/Pi, hosted camera deployment, online production CORS, trained age model and comprehensive anonymization: NOT_VERIFIED.
- Skill safety review: risk/rules/graph/action/unlock schemas unchanged; privacy failure isolated; duplicate/read semantics preserved; stop and stale-after-privacy tests included. Unknown/stale never receives a current SAFE badge from this integration.
- Phoenix Cohort 4 URL checked 2026-10-03: https://phoenix.note.transformerlabs.ai/dashboard?cohort=cohort-4 was inaccessible via web tool. Current rubric UNVERIFIED; PO owns follow-up. No submission-readiness claim.

## AGENT_HANDOFF

Changed: backend `src/vision/privacy.py`, `src/vision/preview.py`, `camera.py`, `camera_gradio.py`, privacy tests, HTTP smoke, env example, docs/evidence; frontend `RealtimeCabinFeed.tsx`, `CabinFeed.tsx`, `api/privacyPreview.ts`, two tests, local env + docs; root AI log/handoff correction. Source clone fast-forwarded separately to the remote commit. Existing unrelated WIP was preserved.

Assumptions remaining: no new product/safety policies adopted. Known risks: face misses; raw backend temporary upload cache; cloud cold-start may exceed existing TTL; camera endpoint is periodic frame processing, not guaranteed video FPS. Next owners: VISION_AGENT provides age-router artifact with checksum/license and evaluation; BACKEND_AGENT/FRONTEND_AGENT decide display-only age metadata if desired; deployment owner verifies hosted environment when requested. P-068 sync is still unrequested.
