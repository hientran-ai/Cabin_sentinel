# Frontend platform assessment

Date: 2026-10-02

## 1. Current architecture discovered

- `frontend/` is a React 19 + Vite + TypeScript demo/dashboard with Vitest and Testing Library.
- `AgentContext` owns server polling, health polling, demo mutation state, action state, acknowledgement state, and presentation clock state for one configured vehicle.
- `frontend/src/api/client.ts` is the single HTTP boundary. It normalizes JSON errors and polls `/api/v1/state/{vehicle_id}` every 1.5 seconds; there is no production SSE endpoint.
- `frontend/src/api/adapter.ts` maps permissive backend payloads into stricter UI state and preserves backend verdicts.
- FastAPI, SQLite, MQTT ingestion, deterministic rules, demo inference, and simulated action adapters run in one backend process.
- The Docker image contains the backend only. Compose adds Mosquitto. The existing CI runs Python lint/tests and a backend container smoke test, but no frontend checks.
- FastAPI exposes runtime OpenAPI at `/openapi.json`; no schema snapshot or TypeScript generation step is committed.

## 2. Existing functionality worth preserving

- Backend-owned `risk_level`, `rule_id`, `reason`, `revision`, `evaluated_at`, `decision_current`, evidence, and action results.
- Deterministic safety rules and conservative stale/camera-failure semantics.
- Ordered sensor/vision ingestion and monotonically increasing decision revisions.
- Demo image upload, scenario selection, model inference, reasoning display, health polling, and history.
- Adapter error normalization, duplicate-request guards, and protection against older asynchronous results replacing newer state.
- Existing Pytest and Vitest coverage, including dashboard, adapter, demo, freshness, conflicts, and occupancy regressions.

## 3. Problems and blockers

- There is no production identity, OIDC/session, MFA, RBAC, relationship-based vehicle access, or authorization API.
- There are no fleet/list APIs, production incident resources, acknowledgement mutation, command API/lifecycle, SSE stream, push registration, notification preferences, audit API, or operations read models.
- `/api/v1/events/{vehicle_id}` is a heterogeneous Edge event log rather than a product incident timeline.
- Frontend contracts are handwritten and permissive because backend response models for state/events are currently untyped dictionaries.
- The single `AgentContext` mixes server state and UI state and is unsuitable for multiple production applications.
- The stock vision path is explicitly a technical demo and is not validated for child detection. Raw-image privacy/redaction is not production complete.

## 4. Proposed target tree

```text
apps/
  owner-web/
  operations-web/
  mobile/
  demo-web/          # compatibility entry while frontend/ is migrated incrementally
packages/
  contracts/
  api-client/
  domain/
  design-tokens/
  test-fixtures/
frontend/            # preserved working demo baseline during migration
```

The repository already uses npm (`frontend/package-lock.json`), so the workspace foundation uses npm workspaces rather than adding pnpm, Nx, or Turborepo.

## 5. Current-file migration mapping

| Current file | Disposition | Target / rationale |
| --- | --- | --- |
| `frontend/src/api/client.ts` | REFACTOR | Demo-specific calls remain; generic transport, auth, errors, cancellation, idempotency, and SSE move to `packages/api-client`. |
| `frontend/src/api/adapter.ts` | MOVE INCREMENTALLY | Contract mapping becomes shared once backend response models/OpenAPI are stable; current adapter remains for demo compatibility. |
| `frontend/src/types/backend.ts` | REPLACE LATER | Generated `packages/contracts` types after a committed product OpenAPI schema exists. |
| `frontend/src/types/agent.ts` | SPLIT | Backend contracts move to `contracts`; display-only state/helpers move to `domain`; demo-only view models stay with demo. |
| `frontend/src/mocks/scenarios.ts` | MOVE INCREMENTALLY | Reusable production-shaped fixtures move to `packages/test-fixtures`; demo simulation stays isolated. |
| `DemoAnalysisPanel.tsx` | DEMO-ONLY | Preserve in the existing demo application. |
| `DecisionInsights.tsx` | KEEP/REFACTOR | Preserve the UX; later consume shared contracts and severity semantics. |
| `Overview.tsx` | DEMO-ONLY | Preserve current demo dashboard; owner web receives a separate product route hierarchy. |
| `AgentContext.tsx` | DELETE-LATER | Keep for demo; production apps use TanStack Query and small local UI state. |
| `frontend/src/test/*` | KEEP | Continue running unchanged, then migrate alongside demo sources. |

No current file is deleted in this migration step.

## 6. Backend endpoints/contracts currently available

- `GET /health`
- `POST /api/v1/vision`
- `GET /api/v1/state/{vehicle_id}`
- `GET /api/v1/risk/{vehicle_id}`
- `GET /api/v1/events/{vehicle_id}?limit=`
- `POST /api/v1/demo/analyze`
- Runtime FastAPI OpenAPI and Swagger UI

The current state includes revision, backend verdict/reason/rule, sensor and perception metadata, freshness, `decision_current`, action results, and a pending unlock request. It does not model production users, access relationships, or a complete incident lifecycle.

## 7. Missing APIs required later

- Session/OIDC bootstrap and `/api/v2/me` permissions.
- Owner-scoped vehicles, vehicle status, incidents, incident detail, history, and notification preferences.
- Idempotent acknowledgement with expected incident revision.
- Authorized command request/status lifecycle with device confirmation.
- Operations incident queues, devices/health, users/access, model/rule rollout, audit, and system health.
- Revisioned SSE streams and resumable event IDs.
- Mobile push-token registration and deep-link-safe incident refresh.

Until these exist, product clients use typed fixtures or explicit unavailable states. They never fabricate a successful production mutation or infer a safety verdict.

## 8. Implementation phases

1. Add npm workspace, shared TypeScript configuration, contracts, API client, domain helpers, design tokens, and fixtures.
2. Preserve the current frontend as demo and add a compatibility workspace entry without moving dirty files.
3. Add Owner Web MVP routes and backend-authoritative, stale/offline-safe UI using TanStack Query.
4. Add Operations Web MVP routes, incident queue/investigation, health, audit placeholders, and non-optimistic command lifecycle UI.
5. Add revision-aware SSE helpers with polling fallback hooks.
6. Add an Expo/React Native mobile source scaffold with deep-link parsing, push-refresh architecture, and native-only components.
7. Extend CI and validate lint, typecheck, tests, and builds. Product API integration remains gated on the missing backend endpoints above.
