# V1 end-to-end demo: runbook

Status labels used below: UNIT_TESTED, INTEGRATION_TESTED, RUNTIME_VERIFIED (local, real model), ONLINE_VERIFIED
(public URL). This build is **RUNTIME_VERIFIED locally; ONLINE_VERIFIED = NO** (no deploy was requested or made).

## Start locally (three processes)

```bash
# 1. backend: real YOLO weights, one worker (SQLite + timer)
MODEL_PATH=/path/to/yolov8n.pt CABINSENTINEL_DB_PATH=/tmp/e2e-demo/cabin.db CABINSENTINEL_MQTT_ENABLED=false \
  .venv312/bin/python -m uvicorn src.main:app --host 127.0.0.1 --port 8000
# 2a. dev frontend (proxies /api to :8000)
npm run dev:cockpit            # http://127.0.0.1:4177/cockpit/
# 2b. or production-like: build, then the same Worker that serves /api in production
npm run build:web && npx wrangler dev --port 8787 --var BACKEND_ORIGIN:http://127.0.0.1:8000
```

Without `MODEL_PATH` the page shows "model chưa sẵn sàng" and refuses analysis; there is no fixture fallback.
Weights are not in Git: the stock `yolov8n.pt` (SHA-256 `f59b3d83…ccfc83b36`, Ultralytics v8.3.0, AGPL-3.0).

## Phone UI source

`apps/cockpit-web/public/phone/` is the Cabin Noir owner app. To refresh it from the Cabin repo: `python3 apps/cockpit-web/phone-ui/sync.py <Cabin>/cabin-noir/backend/web` (patches assert their targets).
Browser smoke: `apps/cockpit-web/e2e-browser/README.md`.

## Environment

`.env.example` (backend: `DEMO_RETENTION_HOURS`, `MAX_UPLOAD_SIZE_BYTES`, `MAX_CONCURRENT_DEMO_REQUESTS`, `CORS_ORIGINS`,
`APP_ENV=production`) and `apps/cockpit-web/.env.example` (`VITE_API_BASE`, `VITE_ENABLE_DEVICE_CAMERA` (unset: laptop camera only on localhost)). No secrets.

## Deploy (prepared, not executed)

1. Backend: `deploy/huggingface/deploy.sh` copies `src/` (includes `e2e_api.py`); the Space forwards `/api/*` to FastAPI.
   Keep one worker. Free Spaces lose the SQLite file on restart: sessions then answer 403 and the page starts a new one.
2. Frontend: `npm run build:web` now also builds `apps/cockpit-web` and `scripts/assemble-web.mjs` copies it to
   `dist/cockpit/`. `wrangler deploy` serves it on the same origin as `/api` (Worker proxy), so no CORS entry is needed.
   `/cockpit` redirects to `/cockpit/`; reload works because `index.html` is a real file there.
3. Hosting jurisdiction: the backend runs on a foreign host, so only sample clips or images the visitor may use are
   allowed (COMPLIANCE DP-03, DP-07). The laptop camera button therefore appears only when the page is served from localhost (frames stay on this machine), or when the build sets `VITE_ENABLE_DEVICE_CAMERA=true`; `=false` disables it everywhere. It needs a tick on the consent box, sends 1 frame/s to real YOLO, stores nothing, and the ■ button stops it. Checked with Chrome's fake camera (`CHROME_FLAGS` in `e2e-browser/run.mjs`, `camera-steps.json`): consent gate, frames labelled `DEVICE_CAMERA`, CRITICAL on the phone.

## Smoke check after a deploy

```bash
curl -s https://<host>/api/v1/e2e/status      # model.ready true, mode HOSTED_SIMULATION, database ready
curl -sI https://<host>/cockpit/ | head -1    # 200
```
Then in a browser: open `/cockpit/`, pick "Đỗ, khoá, 40 °C" and "Trẻ trong xe": the phone banner and cockpit toast must appear.

## Rollback

Frontend: redeploy the previous Worker version (`wrangler rollback`). Backend: redeploy the previous `src/`; the new tables
(`demo_observations`) are additive and ignored by older code. No destructive migration. Demo data can be erased with
`DELETE /api/v1/e2e/sessions/{id}` or waits for retention.

## 3-minute demo script

| Time | Do | Expect (all from the backend) |
|---|---|---|
| 0:00 | Open `/cockpit/` | model ready chip, phone "Không xác minh được" (no data yet, not SAFE) |
| 0:20 | Preset "Đỗ, khoá, 40 °C", clip "Trẻ trong xe" | YOLO `person` ~90%, CRITICAL, same revision on cockpit chip and phone, toast + phone banner |
| 0:50 | Evidence panel | model file + SHA, observed/received times, ages, timings (YOLO ≈ 30 ms), unlock `pending`, push `NOT_PLANNED`, in-app delivered |
| 1:10 | Phone: open incident → "Đã xem" | both screens show "chủ xe đã xem", incident still open |
| 1:30 | Phone: "Tôi đã kiểm tra" while the child clip runs | rejected with reason; history shows REJECTED |
| 1:50 | Clip "Cabin trống" + preset 25 °C, then resolve | accepted only with fresh empty evidence; incident closed, history lists who and from where |
| 2:20 | **Failure case**: "Camera bị che", then "Ngắt trình duyệt ↔ máy chủ" | ERROR "không xác minh được", then "Dữ liệu cũ" with ages counting up; recovers on reconnect |
| 2:45 | Clip "Trẻ ngồi ghế quay lưng" | model detects nobody; UI says no detection is not an empty cabin (SR-01 shown, not hidden) |

## Simulated car: VinFast VF 8 theme, weather, heat-soak

The e2e page forces the VinFast mode (VF 8-inspired SUV theme, VF 8 photo on the phone). The 3D body is still the bundled generic
concept car (`public/models/CarConcept.glb`, CC-BY, credited on screen): there is no licensed VinFast model in the repo, and the
procedural SUV fallback looked worse. To show a real VF 8, add a licensed GLB and its anchors in `GlbCar.tsx`.
Sim panel additions: outside-temperature slider, "real weather" (Open-Meteo, fixed Hà Nội coordinates, nothing about the visitor is sent;
feeds only the simulated heat model) and a x1/x10/x60 cabin heat-soak speed-up (parked and locked, cabin drifts toward outside + 8 C).
Checked: weather 24.4 C fetched, outside 38 C + x60 + child clip -> cabin 40.7 C -> backend CRITICAL HOT_OCCUPANT -> phone.
