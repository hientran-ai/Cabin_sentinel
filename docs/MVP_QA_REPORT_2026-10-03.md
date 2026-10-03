# CabinSentinel MVP — QA report (2026-10-03)

**Verdict: the MVP is good for a local demo.** Every happy path and worst case below passed against the final build: real backend, real YOLO and YuNet models, the production frontend bundle, and a real browser. QA found four defects; all were fixed and retested in this pass. It is **not** production-ready; see "Not covered / limits".

## How it was tested

| Layer | Method | Result |
|---|---|---|
| Backend unit/integration | `./scripts/run_backend_tests.sh` (snapshot suite + P-068 team suite against this source) | **55 passed**, **160 passed** |
| Frontend unit/component | `npm test` | **87 passed** |
| Typecheck / lint / build | `tsc -b`, `oxlint`, `vite build` | PASS / PASS / PASS |
| Browser E2E (automated) | `Cabin-frontend/scripts/e2e-final-integration.mjs`: Chromium, fake camera fed a public sample image, backend :7863, frontend :5183 | **9 / 9 PASS** (`evidence-final-integration/browser-receipt.json`) |
| Manual (computer use) | In-app browser walkthrough, incl. killing and restarting the real backend process | PASS after fixes (`manual-*.jpg`) |

## Happy cases

| # | Case | Result | Evidence |
|---|---|---|---|
| H1 | Camera → backend → YOLO (4 people) → YuNet (2 faces blurred) → CRITICAL → blurred preview with boxes | PASS | `normal-camera.png` |
| H2 | Actions: horn and SMS `simulated`, unlock `pending_human_confirmation`; receipts stay visible on later frames | PASS | `normal-camera.png` |
| H3 | Valid image upload → 200 → CRITICAL | PASS | `image-upload.png` |
| H4 | Fleet admin sees 4 vehicles: CRITICAL, WARNING, SAFE, UNKNOWN (never seen) | PASS | `multi-vehicle.png`, `manual-fleet-happy.jpg` |
| H5 | Owner sees only own 2 vehicles | PASS | `manual-owner-scoped-2-vehicles.jpg` |
| H6 | Vehicle detail: sensors, plain-language explanation, rule, actions, event timeline | PASS | `multi-vehicle.png` |
| H7 | Guardian: owner creates trip → guardian sees UNKNOWN → "Child entered" → INSIDE | PASS | `guardian-flow.png` |
| H8 | `/health`: YOLO + YuNet available with matching SHA-256; age classifier reported unavailable | PASS | `curl /health` |

## Worst cases

| # | Case | Expected | Result |
|---|---|---|---|
| W1 | Browser loses the camera API | Preview blank, raw video hidden, risk UNKNOWN, error shown | PASS (`backend-outage.png`) |
| W2 | API returns | Frames resume, error clears, blurred preview back | PASS (`backend-recovery.png`) |
| W3 | One frame result arrives 4 s late (> 3 s TTL) | Late frame not drawn; risk UNKNOWN while late; resumes after | PASS |
| W4 | Switch vehicle while previous vehicle's response is delayed 3 s | Previous vehicle's data never shown | PASS (25 samples, all VF5) |
| W5 | Corrupt "JPEG" upload | HTTP 422, UI error, no crash | PASS |
| W6 | Triple-click submit / double-click "Child entered" | One request / one event | PASS |
| W7 | **Real backend process killed** | Every vehicle UNKNOWN/offline; values labelled "last received · not current" | PASS after fix |
| W8 | **Backend restarted** (in-memory tokens invalidated) | User sent back to sign-in with a clear message | PASS after fix |
| W9 | Simulator running while backend is down | Keeps retrying; resumes on its own | PASS after fix |
| W10 | Guardian with wrong trip/token | UNKNOWN + error; no data | PASS (`manual-guardian-wrong-token.jpg`) |
| W11 | Guardian tries to list vehicles or record events | 403 | PASS |
| W12 | Long CRITICAL incident (200 s), replayed inputs | Unlock never executed; no duplicate horn/SMS | PASS (unit tests) |

## Privacy proof (raw camera pixels never visible)

- The capture `<video>` has `hidden=true`, `display:none` and a 0×0 box in **every** state checked: before start, running, outage, recovery and stop.
- The visible canvas has `filter:none`. The image it shows is the backend-processed frame: the pixel difference against the raw frame is **39.0 / 43.3** inside the two face boxes and **10.3** in a face-free band (JPEG noise). The faces are blurred; the rest is unchanged.
- Outage and late frames: the canvas shows the blank placeholder colour `[39,59,62]`, never the raw video.

## Measured latency (local Mac, CPU, 9 frames)

| Stage | Median |
|---|---|
| YOLO inference | 41 ms |
| YuNet face privacy | 15.9 ms |
| Frontend round-trip per frame (upload + call + result) | ~81 ms (4 + 2 + 75) |

The frame rate is periodic, single-flight frames, not video FPS. The numbers are from a single machine and are not a performance guarantee.

## Defects found by QA and fixed in this pass

1. **Lowercase units:** the explanation lowercased units ("39.2°c") because of `str.capitalize()`. Fixed, with a regression test.
2. **Actions vanished in camera mode:** they appeared only on the first CRITICAL frame. The camera API now returns the durable `action_ledger` and `unlock_request` (additive), and the UI keeps the receipts. Tested.
3. **Misleading labels while offline:** during a backend outage the sensor cards still said "FRESH". They now say "last received · not current". Tested.
4. **Restart handling:** after a backend restart the user was stuck on "invalid token", and the simulator crashed. The UI now returns to sign-in with a message, and the simulator retries. Tested live.

## Not covered / limits (honest)

- Real webcam / Raspberry Pi hardware: not tested (fake camera only). The hosted HF deployment does not have these changes.
- Age classifier: **unavailable**. No checkpoint exists, and nothing was faked.
- Fleet vehicles use **simulated** sensors and detections (labelled SIMULATED). The live camera session is a separate demo vehicle, not linked to VF8/VF9.
- Tokens, trips and camera sessions are process-memory: a backend restart signs everyone out. This is demo-grade auth.
- YuNet can miss small, profile or occluded faces. Raw frames are still sent to the backend (opt-in consent); this is not an anonymisation guarantee.
- Minor UX: at narrow (~700 px) widths the fixed sidebar crowds the fleet table (horizontal scroll). During a camera outage the "Detected objects" side list still shows the last detections, while the risk shows UNKNOWN.
- Still to write: integration matrix, final architecture and demo runbook docs.
