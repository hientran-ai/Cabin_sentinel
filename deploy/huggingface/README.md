---
title: CabinSentinel Backend
emoji: 🛡️
colorFrom: blue
colorTo: indigo
sdk: gradio
sdk_version: 6.29.0
python_version: "3.12"
app_file: app.py
pinned: false
---

# CabinSentinel V1 Backend API

FastAPI backend for CabinSentinel (YOLOv8n vision, deterministic safety rules, incident lifecycle and escalation timer), served inside a Gradio app so it runs on ZeroGPU. Vehicle sensors come from demo scenarios; horn, SMS and notification are simulated and unlock is `pending_human_confirmation`.

Base URL: `https://khanh3636-cabinsentinel-backend.hf.space`

The entrypoint defaults to `APP_ENV=production`, which disables development demo login, public signup and remote commands. Before connecting a separately hosted browser frontend, set the Space variable `CORS_ORIGINS` to that frontend's exact HTTPS origin. The default localhost origin is intentionally restrictive; do not set `*`.

| Endpoint | Description |
|---|---|
| `GET /` | Gradio demo (YOLO on ZeroGPU, falls back to CPU) |
| `GET /health` | Readiness (`vision`, `database`, `safety_timer`) |
| `GET /docs` | Swagger UI |
| `POST /api/v1/demo/analyze` | `multipart/form-data`: `image` (JPEG/PNG ≤ 5 MiB), `scenario` (`normal`, `parked_locked`, `hot_locked`, `pet_mode`, `camp_mode`, `warm_parked`), optional `session_id` |
| `GET /api/v1/demo/sessions/{session_id}` | Session state (`Authorization: Bearer <session_token>`) |
| `GET /api/v1/demo/sessions/{session_id}/events` | Session events |
| `POST /api/v1/demo/sessions/{session_id}/acknowledge` | `{"incident_id": ...}` |
| `POST /api/v1/demo/sessions/{session_id}/resolve` | `{"incident_id", "revision", "cabin_checked": true}` after a fresh empty-cabin frame |

Notes:

- The REST API runs YOLO on CPU, so frontend calls never use the visitor's ZeroGPU quota. Only the Gradio button uses the GPU.
- Free Spaces have no persistent disk: sessions are lost when the Space restarts or sleeps.
- Without new frames, a session's decision turns `ERROR` (`VISION_UNAVAILABLE` after 3 s, `SENSOR_STALE` after 5 s); an open incident keeps escalating. Sessions idle for over an hour stop being re-evaluated.
- Model: stock `yolov8n.pt` (Ultralytics, AGPL-3.0), downloaded at startup and checked by SHA-256; classes person/cat/dog only.
