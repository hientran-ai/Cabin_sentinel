# CabinSentinel V1 integration

Integrated React 19 / TypeScript / Vite dashboard for the verified CabinSentinel REST demo API.
Frontend source baseline: `2ab2d21fec531fbb84254c594defebfbcbc92c5c`.
Backend live snapshot: `0123ee55797ba34a1710ce776fc1b0673be8caf6`, FastAPI version `1.0.0`.

```bash
cd /Users/mac/BUILD_PHASE/Cabin-frontend/frontend
npm ci
cp .env.example .env.local
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open http://127.0.0.1:5173. Backend URL is configured by `VITE_API_BASE_URL`.
Choose a JPEG/PNG and one supported vehicle scenario, then Analyze.
Requests go directly to the configured backend; there is no mock or proxy success fallback.
Upload sends image bytes to that backend. For online tests use a synthetic image or
an approved public test fixture; do not upload private photos without permission.
The first analysis creates a demo session; subsequent uploads retain its incident.
The session token lives only in JavaScript memory. Reload starts a new session.
An uncertain mutation is not automatically retried. GET polling has a 10s timeout;
analysis has a 90s timeout. A failed follow-up read preserves only a historical verdict.

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run preview -- --host 127.0.0.1 --port 5173
```

REST `POST /api/v1/demo/analyze` returns real model inference plus a simulated vehicle
scenario; displayed action results remain explicitly **Mô phỏng (SIMULATED)**.
The browser withholds a current SAFE badge whenever evidence is missing, stale,
analysis is pending, or the session connection has failed. Frontend does not evaluate risk.
Backend status contains evaluated time, freshness, data quality and incident/revision.
GET session state/history uses the returned Bearer credential. There is no vehicle
identity, child/adult classifier, verified face blur, or physical actuator
execution implied by this dashboard. Unlock requests remain pending; no unlock control
is exposed. Demo acknowledgement means notification read; cabin verification is a
separate request tied to the exact backend incident/revision and checked again by backend.

The local `deploy/huggingface` Gradio camera source and older frontend handoff differ
from the live REST deployment. Do not switch this dashboard to Gradio without auditing
the new deployment. See `../docs/BUILD_PHASE_INTEGRATION_2026-10-02.md` for the complete
screen/API matrix, unsupported product applications, tests and handoff.

Static hosting needs SPA fallback to index.html. Configure the exact frontend HTTPS
origin in backend CORS for a production deployment. CORS header belongs to the server;
never add Access-Control-Allow-Origin to frontend requests. There are no secrets in
this build. Build-time URL changes require rebuilding. This task does not publish a
frontend URL or sync P-068.

## Realtime browser camera

Cabin feed supports opt-in browser capture with an original, unblurred preview,
YOLO bbox aligned to the processed capture and backend risk/freshness. Raw frames
are transmitted to the configured camera backend. Preview is not anonymized.
Per user decision 2026-10-03, CRITICAL alerts appear inline with collapsed details;
they do not blur the page, take focus or cover the screen.

Set `VITE_CAMERA_API_BASE_URL` to a backend exposing all five approved Gradio camera
APIs. Current HF REST deployment does not expose them. The integrated current-source backend runs on port `7860` by default; its camera calls use
the same CabinService and YOLO model as the REST demo API. `VITE_CAMERA_API_BASE_URL`
may point at a separate local backend during testing. After deployment, point both frontend
URLs at the same host. Earlier verification with the separate backend on7861 is historical.

Start the camera server, rebuild this dashboard, open Cabin feed, choose the simulated
vehicle scenario, check raw-frame transmission consent, then Bật camera. Tắt camera
releases browser tracks immediately; network failure leaves the backend result unknown.
Tab hiding also stops capture. Frames are sequential, with no accumulated queue or FPS
promise. Camera mode disables REST incident controls and simultaneous image analysis.

See [realtime setup, API matrix and evidence](../docs/REALTIME_FRONTEND_INTEGRATION_2026-10-03.md).
Local browser + model runtime is verified with a public fixture fake camera. Actual
webcam, Raspberry Pi, hosted frontend CORS and online camera APIs remain unverified.

Local BaoTam face masking update: set both `VITE_API_BASE_URL` and `VITE_CAMERA_API_BASE_URL` to the same integrated backend (currently `http://127.0.0.1:7863`), rebuild, and open `http://127.0.0.1:5183/#live-cabin`. Only processed YuNet frames are drawn; originals are transmitted to YOLO after consent. Face detection may miss faces. See [complete local setup and evidence](../../Cabin-backend-live-snapshot/docs/BAOTAM_REALTIME_INTEGRATION_2026-10-03.md).
