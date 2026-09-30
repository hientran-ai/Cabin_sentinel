# CabinSentinel frontend

React + TypeScript + Vite dashboard. Risk, reason and action results are rendered
from the backend response; the browser does not calculate safety state.

## Run

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

The checked-in example and the client default connect to the repository backend:

```dotenv
VITE_USE_MOCKS=false
VITE_API_BASE_URL=http://localhost:8000
VITE_VEHICLE_ID=CAR_1
```

For isolated UI work without the backend, opt into mock mode:

```dotenv
VITE_USE_MOCKS=true
VITE_API_BASE_URL=http://localhost:8000
VITE_VEHICLE_ID=CAR_1
```

The backend must include `http://localhost:5173` in `CORS_ORIGINS`. Start it
with the required model and configuration described in the root documentation.

## Implemented backend contract

- `GET /health` — backend/database/model health.
- `GET /api/v1/state/{vehicle_id}` — polled every 1.5 seconds because the
  current backend does not expose SSE or WebSocket state streaming.
- `GET /api/v1/events/{vehicle_id}?limit=50` — evaluation history.
- `POST /api/v1/demo/analyze` — multipart JPEG/PNG plus `scenario`; the UI
  supports `normal`, `parked_locked` and `hot_locked`.

The API adapter maps the backend's `risk_level`, freshness, `class_name`,
`action_results`, `simulated` and `pending_human_confirmation` fields into the
central frontend types. It does not treat simulated tools as physical success.

The current backend does **not** expose manual emergency-action,
acknowledgement, or JSON simulation endpoints. Those controls are disabled in
backend mode instead of calling invented endpoints. They remain available in
mock mode for UX testing.

## Checks

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```
