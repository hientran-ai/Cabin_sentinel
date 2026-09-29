# CabinSentinel frontend

React + TypeScript + Vite MVP for monitoring cabin safety. The frontend renders
the risk state supplied by the backend and never derives or downgrades risk on
its own.

## Run locally

```bash
npm install
copy .env.example .env
npm run dev
```

Mock mode is enabled by default. Set `VITE_USE_MOCKS=false` to use the real API.

## Environment

```dotenv
VITE_API_BASE_URL=http://localhost:8000
VITE_EVENT_STREAM_URL=http://localhost:8000/api/v1/events/stream
VITE_USE_MOCKS=true
```

## Expected backend endpoints

The repository backend currently exposes only template chat/status routes. The
frontend isolates the proposed CabinSentinel contract in `src/api/client.ts`:

- `GET /api/v1/events/stream` — SSE stream containing an `AgentState` payload
- `POST /api/v1/events/{eventId}/actions` — run emergency actions
- `POST /api/v1/events/{eventId}/acknowledge` — body `{ "reason": ... }`
- `POST /api/v1/simulation` — update demo inputs or scenario
- `GET /api/v1/events` — event history
- `GET /api/v1/system/health` — Edge, internet and camera health

`src/api/adapter.ts` accepts both camelCase and snake_case payload fields. The
backend team still needs to confirm endpoint paths, the SSE event envelope,
action idempotency semantics, evidence URL lifetime/authentication, and the
exact system-health payload.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
