# V1 end-to-end: test report, failure matrix, timing, handoff

Date 2026-10-15 · branch `feat/oem-e2e-v1` (base `84847ea`, uncommitted) · TASK_ID OEM-E2E-V1-20261015.

## Results

| Suite | Result | Level |
|---|---|---|
| Baseline before patch: `pytest tests` | 308 passed | UNIT/INTEGRATION |
| After patch, no weights: `pytest tests` | 328 passed, 3 skipped | UNIT/INTEGRATION (fake detector) |
| After patch, `MODEL_PATH=yolov8n.pt` | 331 passed | adds 3 actual-model tests |
| `ruff check src tests` | clean | |
| cockpit-web `tsc -b`, `vitest` | clean, 20 passed (9 vehicle sim + 11 view/merge/sensor) | UNIT |
| Browser smoke `apps/cockpit-web/e2e-browser` (phone = Cabin Noir UI; 9 checks print true) and (headless Chrome + GPU) against dev server and against the production build behind `wrangler dev` (same-origin proxy) | scenarios below pass | RUNTIME_VERIFIED, **local only** |

## Matrix from the task, with evidence

| # | Requirement | Evidence |
|---|---|---|
| 1 | model → service → risk/incident → both screens same revision | `test_e2e_real_model.py`; browser run: `person` 90% → CRITICAL `HOT_OCCUPANT`, cockpit chip and phone both `rev N` |
| 2 | sensor change with fresh evidence → policy transition | browser: 40 °C → 25 °C preset moves CRITICAL → WARNING/UNRESOLVED path; thresholds untouched (35 °C in `rules.py`) |
| 3 | empty/corrupt/wrong MIME/oversize/model unavailable | `test_future_and_invalid_inputs…`, `test_model_unavailable…` (422/422/422/415/413/503, no state change) |
| 4 | sensor missing/stale/out-of-order | `test_missing_sensor…`, `test_sensor_stopping…`, `test_out_of_order…`; sensor time is server-stamped so a future sensor timestamp cannot be sent; negative `capture_age_ms` rejected |
| 5 | camera fault/lost frames → explicit unavailable | `test_camera_fault…`; browser "Camera bị che" → ERROR "Camera không thể xác minh cabin"; still image after 7 s → "Không xác minh được" (not SAFE) |
| 6 | duplicate/retry/concurrency/restart | `test_retry_is_idempotent…` (no inference, revision, ledger or event growth), `test_concurrent_identical_frames…`, `test_restart_keeps_state…` |
| 7 | ack on both screens, incident stays open | `test_ack_keeps_incident_open…`; browser phone "Đã xem" → cockpit sheet shows acknowledged |
| 8 | resolve valid/reject cases | tests: occupant present, stale evidence, old revision, missing `cabin_checked`; browser: rejected with child clip, accepted with fresh empty clip; every outcome in history with actor surface |
| 9 | session isolation | `test_two_sessions_do_not_see_each_other` (401/403/404 on state, history, notifications, ack, upload) |
| 10 | network loss/reconnect, late events | browser: link cut 15 s → "Dữ liệu cũ" with ages counting up, then restored; `mergeState` unit tests (older revision ignored) |
| 11 | notification from backend, delivery failure | `test_notification_feed_delivery_states_and_failure`; browser: failing provider → phone shows "Push: Gửi thất bại"; in-app delivery confirmed only by the phone |
| 12 | online URL, real browser | **NOT DONE**: no deploy requested. Local production build + Worker proxy only |

## Failure matrix (what the user sees)

| Fault | Backend result | Cockpit / phone |
|---|---|---|
| no model | `/status` model.ready=false, 503 on frames | red banner, no fixture fallback |
| backend unreachable | — | after 2 failed polls or 5 s silence: "Dữ liệu cũ", never SAFE |
| single still image | fresh 3 s then `VISION_UNAVAILABLE` ERROR | "Đã cũ" |
| telemetry stops | `SENSOR_STALE` ERROR after 5 s | "Không xác minh được" |
| camera BLOCKED/DISCONNECTED/NO_FEED | `CAMERA_UNAVAILABLE` ERROR | same |
| provider failure | action `failed`, incident stays open | phone push state FAILED |
| expired/unknown session | 403 | page starts a new session and says so |
| server busy | 503 + Retry-After, frame counted as dropped | evidence panel "bỏ" counter |

## Timing (one run: 61 frames in 60 s, clip "Trẻ trong xe", hot preset)

Environment: macOS, Apple CPU, Python 3.12, PyTorch CPU, ultralytics 8.4.159, `yolov8n.pt` (SHA `f59b3d83…`), headless Chrome with GPU,
production build behind `wrangler dev` → local uvicorn. Medians (p95): YOLO detector 31.4 ms (36.9), server validate 0.1 ms,
CabinService commit 2.2 ms (3.4), server total 34.6 ms (41.8), client JPEG encode 18.9 ms (21.5), HTTP round trip 41.7 ms (49.9),
frame age at send 19 ms. Capture 1.0 fps, inference 1.0 fps (accepted 61, dropped 1, errors 0). Phone receives a notification within
the 1 s poll interval (measured sent→delivered 0.09 s in one case; it is poll-bound, not inference latency).
Limits: n = 61, one machine, one clip, loopback network. Not a Pi/SoC/VinFast benchmark and not an accuracy study.

## Model facts

Stock YOLOv8n on the project's simulator clips: `ai-child` person in 10/10 sampled frames (conf ≥ 0.9); `child-rear` 0/8 (known miss);
`empty-cabin` 0/13. `person` is not `child`; no age or child label reaches the rules.

## COMPLIANCE §8 checklist (for the PR description)

```
[x] SR-01…SR-10 not broken; SR-01 gap pre-exists and is displayed, not hidden (see contract §5)
[x] Thresholds unchanged
[x] New stored data: demo_observations (detections only), events, session credentials. Retention 24 h (DEMO_RETENTION_HOURS, default chosen here, pending confirmation); erase via DELETE /e2e/sessions/{id} and timer purge
[~] Images leave the device in hosted V1 by design (upload demo). Not face-blurred (DP-03 gap); raw bytes are discarded after inference. Device camera disabled by default; sample clips are synthetic. DP-07: backend host is foreign, so only sample data is allowed
[x] New endpoints: per-session bearer, audit events (operator_action with actor surface), tenant scope = session
[x] No personal data to LLM/analytics; map tiles and OSRM routing are third-party requests with simulated coordinates
[x] pytest tests/ (embedded untouched)
[x] Numbers are labelled measured / simulated; no target figures added
```

## RULE-26 (BTC gate)

`https://phoenix.note.transformerlabs.ai/demo-day` fetched 2026-10-15: only the page title is returned (client-rendered/login), so
the current rubric, deadline, form fields and log minimum are **UNVERIFIED**. Owner: project owner with a signed-in session.
No READY_TO_SUBMIT claim. Internal checklist items touched here: source code, README/runbook, diagram (contract §4), live URL (pending), evaluation evidence (this file).

## AGENT_HANDOFF

- Task: V1 hosted end-to-end (real YOLO → CabinService → cockpit + phone, same session).
- Files changed (P-068 worktree `.claude/worktrees/oem-e2e`): backend `src/cabinsentinel/{e2e_api,service,actions,api,demo_api,timer,upload_limit}.py`, `src/{main,config}.py`; tests `tests/test_e2e_api.py`, `tests/test_e2e_real_model.py`, `tests/fixtures/e2e/*.jpg`; frontend `apps/cockpit-web/**` (cockpit copied from the Cabin worktree; phone = Cabin Noir owner UI copied by `phone-ui/sync.py` into `public/phone/` with listed patches and `e2e-bridge.js`; extended: `src/e2e/*`, small hooks in `AutomotiveDashboard`, `VehiclePanel`, `cabinStore`, `DevPanel`, `uiStore`, `main.tsx`, `vite.config.ts`); `package.json`, `package-lock.json`, `scripts/assemble-web.mjs`, `.env.example`; docs `docs/OEM_E2E_V1_*.md`.
- Verified: see tables above. Not verified: online URL, push OS, OEM runtime, real devices, accuracy, privacy blur.
- Decisions used: OEM-TARGET-20261015, OEM-PHONE-ROLE-20261015. No new safety policy approved.
- Assumptions: retention 24 h; one backend worker; client reports frame age honestly; phone ack is authenticated only by the demo session token (surface label PHONE/COCKPIT is not an identity).
- Phone UI limits: seats are not drawn per position (the detector gives none); school trips, accounts, on-phone camera/AI check, live camera, photo upload, pause and manual close were removed because the backend has no such feature or they contradict the approved rules; Noir's "Đã xem dừng nhắc lặp" sentence corrected. Noir's own iPhone-style banner appears when the committed state opens an incident.
- Known risks: SR-01 miss shown as SAFE rule; initial CRITICAL has no owner push intent; HF free tier loses sessions on restart; hosted images unblurred.
- Next owners: SAFETY_AGENT (SR-01, initial-critical push), DEPLOY_AGENT (wrangler/HF deploy + online browser run, needs account approval), project owner (RULE-26, retention, hosting jurisdiction), OEM partner (SDK, camera, signals, power).
