# Cabin feed realtime — BUILD_PHASE

> Current behavior update: [UI_PREVIEW_ALERT_2026-10-03.md](UI_PREVIEW_ALERT_2026-10-03.md). User decision 2026-10-03 supersedes full-frame blur: preview is original; CRITICAL alert is inline with collapsed details and no focus trap. Earlier blur evidence below is historical.

TASK_ID: FRONTEND-REALTIME-20261002. Owner: FRONTEND_AGENT (current agent). Started 2026-10-02; verified 2026-10-03, Asia/Ho_Chi_Minh. Files in scope: dashboard camera client/controller/store/components/tests/env, local verification harness and integration documentation. Dependencies: approved CAMERA_API_V1 and existing backend camera implementation. Expected output: browser camera frames → existing YOLO → committed backend risk/action results → blurred preview and truthful state UI. P-068 is unchanged.

## Decisions and change intent

USER DECISION **DECISION-20261002-REALTIME-PREVIEW**: Question: how to display camera imagery without a face-blur contract? Decision: blur the entire preview and keep privacy labels accurate. Scope: dashboard browser preview; raw frames still go to backend YOLO. Affected: RealtimeCabinFeed, blurredPreview, consent copy and documentation. Whole-frame blur is not verified face anonymization. No raw image is rendered in the visible preview when canvas blur is unsupported. The hidden video and capture canvas necessarily hold raw frames in browser memory; UI does not persist them to web storage/disk. Backend Gradio upload uses its server upload/cache mechanism; this change does not promise deletion/retention on that server.

Previously approved decisions used: CAMERA-SOURCES (browser and Raspberry Pi camera contract), CAMERA-YOLO (reuse existing YOLO), OWNER-DEMO-V1 (Owner Web image upload uses same V1 demo; already integrated). This task adds dashboard browser capture; it does not imply Owner/mobile camera or a Pi stream preview.

CHANGE INTENT: replace the feed placeholder with explicit opt-in camera start/stop, sequential fresh captures, real Gradio upload/SSE client, snapshot validation, capture-aligned bbox and whole-frame preview blur. Keep the image REST path and isolate its polling from camera sessions. Immediately invalidate current verdict on stop/error/disconnect; ignore late inference. Reason: requested realtime tracking. Safety invariant: backend-only risk, unknown/stale != safe, simulated != hardware execution, no unlock confirmation. Compatibility impact: additive frontend mode/env; no public API, persistence, rule, TTL or action semantics changed. Confidence: 90% contract compatibility; hardware/online deployment remains unverified.

## Source/deployment audit

VERIFIED FACT: frontend clone baseline `2ab2d21fec531fbb84254c594defebfbcbc92c5c`. Existing local camera backend `/Users/mac/BUILD_PHASE/deploy/huggingface`, commit `080c8e746dde3daf024074f7b9cc40646b3de6c0`; this task does not edit that checkout. Test harness imports its CameraSessions, CabinService, SafetyTimer and TamVisionProvider. Real CPU YOLO uses existing `handoff/CabinSentinel-V1-demo-assets/yolov8n.pt`, SHA256 `f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36`, confidence 0.25. Temporary verification runtime: Gradio 6.29, Ultralytics 8.4.171; no training or new labels. Person/cat/dog is not a child/age classifier.

VERIFIED FACT: live HF REST source audited previously at snapshot `0123ee55797ba34a1710ce776fc1b0673be8caf6`, FastAPI 1.0.0. Rechecked live `/gradio_api/info` on 2026-10-03: only `/analyze`; **five camera endpoints are absent**. See `realtime-evidence/online-camera-discovery.json`. IMPLEMENTATION / DESIGN MISMATCH: older camera docs discuss a Gradio `/test_analyze_ui` deployment; current live deployment exposes REST V1 plus `/analyze`. Do not overwrite the active REST deployment with the older local Gradio app. Camera support documented for a future deployment is DOCUMENTED BUT NOT VERIFIED ONLINE.

The dashboard is currently configured with REST live URL and separate local camera URL. Camera API discovery runs before browser permission. Missing endpoint support disables start and displays the gap; it does not fabricate a feed.

## Frontend/backend mapping

All operations below use `credentials: omit`. Session token remains only in controller memory, in POST body; never in URL, logs or saved browser storage. API calls POST JSON `{data:[...]}` → `event_id` → GET SSE completion; complete response is a one-element array. Discovery timeout 10s; upload/call timeout 90s. A timeout/transport error leaves result unknown; the next loop takes a new frame, not an automatic retry of the old mutation. One inference request at a time; default delay 1s after completion, no FPS guarantee.

| Function | Endpoint / method | Request | Response / auth | Errors | Support/evidence |
|---|---|---|---|---|---|
| Discover camera capability | GET `/gradio_api/info` | none | named_endpoints, no session | network/timeout/malformed response | local/browser verified; live missing endpoints |
| Start browser camera | POST `/gradio_api/call/camera_start`, GET `/{event_id}` | `[scenario,"browser"]` after consent + getUserMedia | session_id, session_token, initial NO_FEED snapshot | camera permission, unsupported origin/device, INVALID_INPUT, CAPACITY, transport/invalid schema | local production browser verified using public fake camera; actual webcam unverified |
| Upload fresh capture | POST `/gradio_api/upload` | multipart `files`, JPEG downscaled max width640 | path → FileData `{path,meta:{_type:"gradio.FileData"}}` | HTTP/network/timeout/invalid paths | actual Gradio upload verified |
| YOLO evaluation | POST `/gradio_api/call/camera_frame`, GET `/{event_id}` | `[id,token,FileData,sequence,captured_at]` | committed snapshot, bbox pixel coordinates, frame metadata, backend risk/actions | UNAUTHORIZED, SESSION_NOT_FOUND, STALE_FRAME, CLOCK_SKEW, OUT_OF_ORDER, FRAME_CONFLICT, BUSY, STOPPED, inference/invalid response | actual CPU YOLO/HTTP + browser verified; live camera absent |
| Refresh committed state | POST `/gradio_api/call/camera_status`, GET `/{event_id}` | `[id,token]` | snapshot, freshness/data quality, requested/device state | invalid token/session, transport | read-only revision verified |
| Stop capture | POST `/gradio_api/call/camera_stop`, GET `/{event_id}` | `[id,token]`; browser tracks stop before awaiting network | requested STOPPED, NO_FEED/non-current backend verdict | STATE_NOT_COMMITTED, unauthorized, network/timeout | repeat idempotent; modal stop and late result discard verified |
| Device report | POST `/gradio_api/call/camera_report`, GET `/{event_id}` | `[id,token,"STOPPED"|"DISCONNECTED"|"ERROR"]` | device_reported, committed snapshot | INVALID_INPUT, unauthorized, network | browser stop report verified; not independent hardware confirmation |
| Show risk and detections | response fields | no frontend risk rules | risk/reason/rule/revision, frame capture time, freshness, quality, detections | unknown enum/malformed detection/action array → explicit invalid response | current withheld on missing/stale/error; bbox only matching captured frame |
| Show actions | response `actions` | none | simulated/pending/failed/unknown preserved, action key/revision/incident when provided | unknown status stays unknown | actual CRITICAL → Mô phỏng + pending unlock UI captured |
| Image upload / V1 incident controls | existing REST routes; original report has full matrix | unchanged | separate REST session/Bearer in memory | unchanged | after camera stop, image upload resumes live REST; old camera state cannot overwrite it |
| Pi camera control/preview | approved camera contract exists | owner-provided session credential required | metadata only, no frame URL/stream contract | device/client may be unavailable | dashboard attach/control not added; CSI/USB and preview unverified |
| Camera audit history/unlock confirm | no endpoint in camera contract | none | no fake history or success | unsupported | UI hides REST incident controls during camera mode and discloses absent camera history/action ledger |

Camera contract omits temperature, engine and door telemetry values. UI shows UNKNOWN, without reconstructing values from scenario. Backend can still return a current verdict with source freshness and CURRENT quality; UI displays that verified backend verdict. Missing/stale/error never becomes current SAFE. Camera source loss/stop discards active frame/bboxes and current decision. Old verdicts are labelled historical. Whole-frame preview is blurred locally; permission/consent required; tab hiding/pagehide/unmount releases capture. Modal CRITICAL includes stop, which does not resolve an incident or unlock a door.

## Running the verified setup

Existing installations in BUILD_PHASE used for this verification:

```bash
cd /Users/mac/BUILD_PHASE/Cabin-frontend
PYTHONPATH=/private/tmp/cabinsentinel-camera-deps:/private/tmp/cabinsentinel-realtime-runtime \
  /opt/homebrew/bin/python3.12 scripts/run-local-camera.py
```

This localhost-only verification harness reuses real backend code/model and exposes the approved APIs; it is not a production deployment or fake result API. Temporary Python dependencies are not committed. For a fresh environment use a dedicated venv with the backend requirements and Ultralytics/model requirements; dependencies/model source belong to the existing backend project. The default SQLite file is `/private/tmp/cabinsentinel-realtime-test.db`, which separates test evidence from existing app data.

Configure `frontend/.env.local` (gitignored) using `.env.example`:

```dotenv
VITE_API_BASE_URL=https://khanh3636-cabinsentinel-backend.hf.space
VITE_CAMERA_API_BASE_URL=http://127.0.0.1:7861
```

```bash
cd /Users/mac/BUILD_PHASE/Cabin-frontend/frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
# Production preview, in another shell after build:
npm run build
npm run preview -- --host 127.0.0.1 --port 5183 --strictPort
```

Open `http://127.0.0.1:5183/#live-cabin`, choose vehicle simulation, approve raw-frame transmission, Bật camera, Tắt camera. HTTPS or localhost and browser permission are required. Do not use a localhost camera URL for a hosted multi-user deployment. Rebuild after changing VITE env. Actual browser CORS verified for 5173/5183 with local Gradio; production domain CORS remains unverified.

## Verification and limitations

CODE_CHANGED=YES. TEST_EXECUTED=YES. TEST_PASSED: 83 frontend/workspace tests (67 dashboard, 16 workspace), 28 existing camera backend tests, 12 real HTTP checks. Typecheck/lint exit0 without warnings; workspace build exit0 (mobile export, Operations, Owner, dashboard). Initial workspace build failed because Expo tried to write `/Users/mac/.expo` in sandbox; rerun with `__UNSAFE_EXPO_HOME_DIRECTORY=/private/tmp/cabin-expo-verify EXPO_NO_TELEMETRY=1` passed. No build failure was concealed by changing tests.

Native fetch receiver error was reproduced in Chromium (`Illegal invocation`), regression test failed before binding fix and passed afterwards. Privacy capability tests failed on the unsafe implementation, then passed after fail-closed helper. Tests cover malformed responses, missing freshness, stale frame, generation cancellation/late permission, sequential frames/no backlog and camera mode isolation. Backend tests use their existing doubles; the separate HTTP/browser runs use **real YOLO weights**.

INTEGRATION_VERIFIED=LOCAL. RUNTIME_VERIFIED=LOCAL production dashboard (5183) + real local camera backend/model, with Chromium fake media sourced from existing public Ultralytics bus image. Captured normal-driving current verdict/bbox, 10 sequential production frames, hot-cabin CRITICAL with actual SIMULATED horn/SMS and pending unlock, stop from modal, network outage → UNKNOWN and no old bbox, permission denial → ERROR/UNKNOWN, camera stop → live REST image upload. Preview blur unavailable was also emulated in browser: 0 drawImage calls on the visible canvas while inference continued. Raw video remains hidden; web storage had no token keys.

ONLINE_CAMERA_NOT_VERIFIED / NOT_DEPLOYED. HARDWARE_NOT_VERIFIED: actual webcam permission/device, Raspberry Pi CSI/USB, real vehicle/actuators, GPU/ZeroGPU latency. SAFETY_NOT_VALIDATED: child/age/seat detection and real-world safety acceptance. No 30FPS/RTSP/WebRTC claim. Backend camera response has current evaluation actions only; historical action ledger and event/unlock management APIs are absent, explicitly disclosed rather than fabricated.

Next owner BACKEND_AGENT: migrate the approved camera APIs additively into the active REST deployment while preserving V1 routes/auth/schema; declare change intent/compatibility impact and obtain deployment authorization before publication. Hardware owner verifies webcam/Pi. FRONTEND_AGENT can wire Pi session UI only with agreed credential/preview flow. No push or sync to P-068 in this task.

RULE-26: tried `https://phoenix.note.transformerlabs.ai/dashboard?cohort=cohort-4` and `/demo-day` again on 2026-10-03; tool could not access either. Current rubric remains UNVERIFIED, owner PO; no READY_TO_SUBMIT claim. Realtime is a direct user request, not inferred from rubric/mock UI.

Evidence: `realtime-evidence/{frontend-tests,frontend-typecheck,frontend-lint,workspace-build,backend-camera-tests}.txt`, `http-camera-results.json`, browser JSON/screenshots (sanitized), `online-camera-discovery.json`. Prior REST/Owner evidence remains separately in `integration-evidence/`.

Final race review: rejected delayed camera stop/report/error callbacks after IMAGE mode, previous camera-session control responses, and delayed REST incident results after CAMERA mode. Stop generation prevents an older concurrent request announcing STOPPED. Four regression tests failed before patch and pass after it; final frontend/workspace total83 (67 dashboard +16 workspace), typecheck/lint/full build exit0.

Final production race evidence: real camera_stop response delivery delayed20s in browser test transport (backend payload unchanged), then live REST image upload. After stop was delivered, UI retained the new REST vehicle/session and Evaluated mode; source released. `realtime-evidence/browser-delayed-stop-race.json`: passed=true.


## Backend follow-up — 2026-10-03

The approved five-method camera contract is now integrated into `Cabin-backend-live-snapshot` in BUILD_PHASE, using the existing live-source FastAPI `get_cabin_service`, timer and shared YOLO model. The public REST contract is unchanged. Local app entrypoint on port7862 and browser camera fake-media verified through current frontend → upload/SSE → YOLO → CRITICAL backend verdict → inline dashboard alert; evidence is in `Cabin-backend-live-snapshot/docs/evidence-camera-api/`. Current HF deployment remains on its earlier source until a separately authorized publish; hosted camera endpoints are therefore still NOT_DEPLOYED.

The frontend validator was corrected to accept explicit backend camera states ERROR and DISCONNECTED while withholding current risk. Full API matrix in `BUILD_PHASE_INTEGRATION_2026-10-02.md`: existing supported REST features remain compatible; owner identity/family/access/preferences, product fleet, telemetry trends, and authenticated Ops/Mobile session flows still lack an approved product contract.

## Latest update — BaoTam YuNet face masking

Direct remote recheck found BaoTam `f7c04a0` with actual face masking. Dashboard now draws only the backend's frame-bound processed JPEG; no raw preview fallback. Full-frame blur remains removed and critical alerts remain inline. Both local dashboard API bases use backend7863; production preview remains frontend5183. [Corrected source audit, additive contract, evidence and AGENT_HANDOFF](../../Cabin-backend-live-snapshot/docs/BAOTAM_REALTIME_INTEGRATION_2026-10-03.md). Trained age-router checkpoint and hosted/hardware verification remain unavailable.
