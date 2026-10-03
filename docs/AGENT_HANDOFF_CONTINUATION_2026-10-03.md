# Agent handoff — continuation, 2026-10-03

Written before code changes in this pass and updated at the end (see "Outcome").

## CURRENT_STATE

The integrated system is spread across several checkouts. The team repo was not the one the previous agent ran:

| Path | What it is | Git |
|---|---|---|
| `/Users/mac/AI/P-068` (branch `Khanh`) | Team backend repo. Has uncommitted Sep-30 alert/session WIP. **No camera API, no privacy, no frontend.** | GitHub `AI20K-Build-Phase-Cohort-4/P-068` |
| `/Users/mac/BUILD_PHASE/Cabin-backend-live-snapshot` | **Active backend.** HF Space repo with P-068 source plus `auth.py`, `camera.py`, `camera_gradio.py`, `vision/privacy.py` and `vision/preview.py` (uncommitted). Gradio owns the server; `/api/*`, `/health` and `/docs` are forwarded to FastAPI. | HF `Khanh3636/cabinsentinel-backend` |
| `/Users/mac/BUILD_PHASE/Cabin-frontend` | **Active frontend** (`hientran-ai/Cabin`). The `frontend/` dashboard has the realtime camera feed and privacy-preview admission. `apps/owner-web` runs on a mock repository; `apps/operations-web` is a stub. | GitHub `hientran-ai/Cabin` |
| `/Users/mac/BUILD_PHASE/BaoTam-vision` | BaoTam branch at `f7c04a0` (verified the latest after `git fetch` today). | — |

`origin/BaoTam` = `f7c04a0` (no newer commit). The `3b78fd1` ref is stale.

## VERIFIED_WORKING (read from the code today; runtime rerun is pending)

- Camera session API: `camera_start/status/frame/stop/report` via Gradio (`/gradio_api/call/*`). It checks the session token, monotonic sequence, duplicate fingerprint (`DUPLICATE`, no re-ingest), capture TTL of 3 s and clock skew, and discards results on stop or a generation change.
- YuNet preview: `FacePreview` verifies the pinned SHA-256, runs on a copy, and YOLO keeps the original frame. A failure returns `preview.status=UNAVAILABLE` with no image and no raw fallback.
- Frontend `RealtimeCabinFeed`: the `<video>` is `hidden` (capture only). The canvas draws only a `PROCESSED` preview whose sequence, captured_at and size match the frame, is ≤3 s old and has a valid JPEG data URL. Otherwise it draws a blank placeholder.
- Deterministic rules (`rules.py`) → LangGraph route → incident lifecycle (`alerts.py`) → action ledger keyed `vehicle:revision:tool`. Horn, SMS and notification are `simulated`. `request_unlock` → `pending_human_confirmation`, which can expire or cancel. **No code path executes an unlock.**
- Canonical risk enum: `SAFE | NOTICE | WARNING | CRITICAL | ERROR`. `ERROR` is the backend's unknown/unavailable state; the frontend shows `UNKNOWN` whenever `decision_current` is false.
- REST upload `/api/v1/demo/analyze`: corrupt → 422, wrong type → 415, size → 413. Frontend single-flight guard.

## REMAINING_GAPS

1. No multi-vehicle/fleet API. The only vehicles are per-session `DEMO_<id>`.
2. No HTTP sensor ingest. MQTT subscriber exists, but no broker is installed locally; there is no normalized sensor state endpoint and no deterministic multi-vehicle simulator.
3. No guardian / child entry-exit flow.
4. `/health` does not report privacy-model or age-classifier capability. No `/ready`.
5. Frontend has no fleet/admin or guardian views and no vehicle switching.
6. Age classifier: no checkpoint anywhere (local search, BaoTam tree, no LFS, no release). It stays unavailable.
7. Missing tests: duplicate-input → no duplicate actions; unlock never executed; fleet stale → not SAFE; vehicle-switch stale-response rejection.
8. Docs: integration matrix, final architecture, runbook, model checksums, run scripts.

## CHANGE_INTENT

Additive only. Existing camera, demo and session contracts stay as they are.

- Backend: `fleet.py` (registry + trips + role tokens), `fleet_api.py` (vehicles, normalized state, events, device ingest, trips, guardian child-status, dev-only demo login), and capability reporting in `/health` plus `/ready`. `scripts/simulate_vehicle.py` (deterministic SAFE/WARNING/CRITICAL/OFFLINE over HTTP, MQTT optional), `scripts/run_backend.sh`.
- Frontend: `api/fleet.ts`, `api/guardian.ts`, `pages/FleetView.tsx`, `pages/GuardianView.tsx`, hash routing in `App.tsx`, sidebar links, and tests. `Overview`/`RealtimeCabinFeed` behaviour is unchanged.
- Docs and browser evidence under `docs/evidence-final-integration/`.

## FILES_EXPECTED_TO_CHANGE

Backend snapshot: `src/cabinsentinel/fleet.py` (new), `src/cabinsentinel/fleet_api.py` (new), `src/cabinsentinel/capabilities.py` (new), `src/main.py`, `src/cabinsentinel/service.py` (public `record_event` only), `app.py` (`/ready` forwarding), `tests/test_fleet_*.py`, `tests/test_action_safety.py` (new), `scripts/*`, `.env.example`, `README.md`, `docs/*`.
Frontend: `frontend/src/api/{client,fleet,guardian}.ts`, `frontend/src/pages/{FleetView,GuardianView}.tsx`, `frontend/src/App.tsx`, `frontend/src/components/layout/Sidebar.tsx`, `frontend/src/App.css`, `frontend/src/test/*`, `scripts/run_frontend.sh`, `frontend/.env.example`.

## SAFETY_CONTRACTS_TO_PRESERVE

- Browser never renders raw camera pixels. Missing, invalid, stale or mismatched `preview` → blank/unavailable, never `<video>`.
- Privacy failure never changes risk; it only withholds the image.
- Missing, stale or network-failed data is never shown as SAFE (`decision_current=false` → UNKNOWN).
- Unlock stays `pending_human_confirmation`; no automatic execution and no confirm endpoint added.
- Same logical input (same sensor sequence, same camera sequence + fingerprint, same vision frame_id) never re-emits actions.
- Risk comes only from deterministic `rules.py`. No LLM in the decision path.
- Age labels never reach the rules (`vision_adapter` rejects `child`/`adult`).
- No secrets in `VITE_*`; tokens are memory-only in the browser.
