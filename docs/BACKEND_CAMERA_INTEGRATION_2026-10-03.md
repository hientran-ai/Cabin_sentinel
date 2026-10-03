# Backend camera integration — 2026-10-03

TASK_ID: BACKEND-CAMERA-INTEGRATION-20261003. OWNER: BACKEND_AGENT. Files in scope: `Cabin-backend-live-snapshot/app.py`, `src/cabinsentinel/camera.py`, `src/cabinsentinel/camera_gradio.py`, backend tests/docs/evidence, frontend camera validator/docs. Work remains in BUILD_PHASE; P-068 is unchanged.

## Contract and change intent

USER DECISIONS already recorded: DECISION-20261002-CAMERA-SOURCES (browser + Raspberry Pi) and DECISION-20261002-CAMERA-YOLO (existing YOLO; no training). `docs/CAMERA_API_V1.md` defines the five additive Gradio functions. This work preserves their names, argument order, SSE pattern, session bearer, freshness and sequence semantics. Existing REST `/api/v1/demo/*` contract, DB schema, rules, action and unlock behavior were not changed.

Backend source baseline: HF source snapshot SHA `0123ee55797ba34a1710ce776fc1b0673be8caf6` at `Cabin-backend-live-snapshot`. This checkout reflects audited current live source, but HF has not been updated. Prior local camera source `deploy/huggingface` SHA `080c8e746dde3daf024074f7b9cc40646b3de6c0` is older/different; only the camera lifecycle implementation was reused and is now wired to the active snapshot's `get_cabin_service()` and current YOLO detector. One existing SafetyTimer remains responsible for committed state freshness.

CHANGE INTENT: add `camera_start/status/frame/stop/report` to the existing Gradio entrypoint. Camera sessions use the same singleton CabinService as REST; camera frames use the entrypoint's already-loaded YOLO model. Compatibility impact is additive Gradio metadata/endpoints only; REST routes and response schemas remain unchanged. Safety invariants: no feed/error/stale is not SAFE; capture timestamps and sequence are checked; duplicate frame does not reevaluate or replay actions; stop invalidates in-flight inference; action remains SIMULATED/pending, never physical success.

## Evidence

- CODE_CHANGED: active-source entrypoint registers five methods; state module validates camera input/session, capture freshness/order, duplicate and in-flight-stop lifecycle; app reuses its shared detector. Frontend validator now accepts backend `ERROR` and `DISCONNECTED` camera states as explicit unavailable data.
- TEST_EXECUTED / TEST_PASSED: current snapshot regression suite 181 passed; camera contract/session/Gradio suite 25 passed; full frontend workspace 82 passed; frontend typecheck, lint and build passed; full workspace build (mobile Android export, Operations Web, Owner Web, dashboard) passed. Some Gradio test dependency warnings were emitted; tests passed.
- INTEGRATION_VERIFIED: Gradio `/info` advertised all five calls; cross-origin frontend browser successfully fetched schema and completed camera frame calls. Camera start created a session readable through REST with its returned bearer.
- RUNTIME_VERIFIED (local only): current-source backend on port7862, production frontend preview at5183, Chromium fake camera using public bus image, real existing YOLO model. Frame 37, 640×480, 4 detections, current CRITICAL from deterministic CabinService, inline alert, raw preview, camera stop. `browser-integration.json` and screenshot included. Separate camera-start→REST read returned NO_FEED + ERROR + decision_current=false.
- Safety review: no edits to models/rules/graph/service/action/auth/DB/timer semantics. Camera code invokes existing session auth and CabinService. It never treats camera errors as empty-cabin evidence.

Evidence paths: `docs/evidence-camera-api/browser-integration.json`, `frontend-critical-realtime.png`. The root frontend integration report contains the full function/UI support matrix.

## Limits / NEED_USER_DECISION

The hosted HF service still runs the older deployment; camera APIs are NOT_DEPLOYED there. Production-domain CORS/runtime, webcam hardware and Raspberry Pi hardware remain unverified. This task did not publish anything.

NEED_USER_DECISION for frontend product areas without an approved backend contract: (1) profile/family/access roles and identity, (2) notification preferences/emergency-contact storage, (3) multi-vehicle fleet and assignment, (4) telemetry-history/occupant-confidence trend retention, and (5) Ops/Mobile authentication and mapping to a demo or product vehicle. Backend contract, persistence, authorization and retention cannot be safely inferred from prototype/mock UI. Recommendation: first confirm the V1 product/account model, roles and data-retention needs, then define additive API/schema migrations. Existing V1 dashboard + Owner demo + local realtime camera are implemented; remaining pages stay explicit/unsupported until decisions are made.

AGENT_HANDOFF: BACKEND_AGENT completed local additive camera integration; tests and evidence above; user decisions are existing camera source/model plus current preview decision; no new safety assumptions. Next owner: PO/product owner for product identity/fleet/retention choices, BACKEND_AGENT for approved API designs, DEPLOY_AGENT for a separate authorized HF publication and hosted CORS/runtime test. P-068 sync only when requested.
