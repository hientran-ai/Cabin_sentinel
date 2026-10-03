# Authentication and portal integration

## Frontend implementation

Owner Web and Operations Web share `@cabinsentinel/auth`. Both expose `/login`
and `/auth/callback` and enforce portal access from backend-provided roles. The
development path now calls the merged V1 backend end-to-end:

1. `POST /api/v1/auth/demo-login` issues a 12-hour in-memory demo token.
2. `GET /api/v1/auth/me` verifies the token and returns the authorized vehicles.
3. Owner role routes to Owner Web; admin role routes to Operations Web.
4. Operations reads the protected fleet state/events endpoints with the token.

| Portal | Allowed roles |
| --- | --- |
| Owner Web | `OWNER`, `CAREGIVER` |
| Operations Web | `OPERATOR`, `ADMIN`, `AUDITOR` |

The login page links both deployments and starts the correct flow. In
`v1-demo`, the token is intentionally stored in `sessionStorage` (never
`localStorage`) and is scoped to the current tab/origin. This mode is for local
development only; the backend returns 404 for demo login in production. Future
production sessions use cross-origin requests with `credentials: include`.

## Runtime modes

- `VITE_AUTH_MODE=v1-demo` uses the real merged V1 development backend. This is
  the recommended local integration mode.
- `VITE_AUTH_MODE=mock` enables two frontend-only personas.
  This is presentation-only and must not be used as production authorization.
- `VITE_AUTH_MODE=session` enables the production adapter. Set
  `VITE_AUTH_LOGIN_URL` to the backend/OIDC authorization entry point.
- `VITE_OWNER_WEB_URL` and `VITE_OPERATIONS_WEB_URL` are the deployed portal
  origins/paths used for role routing and portal switching.

## Connected backend surface

| Method | Endpoint | Current frontend usage |
| --- | --- | --- |
| `POST` | `/api/v1/auth/demo-login` | Owner/admin development login. |
| `GET` | `/api/v1/auth/me` | Role guard and authorized vehicle IDs. |
| `GET` | `/api/v1/vehicles` | Typed client support; ready for fleet selectors. |
| `GET` | `/api/v1/vehicles/{id}/state` | Operations current vehicle state. |
| `GET` | `/api/v1/vehicles/{id}/events` | Operations evaluation stream. |
| `GET` | `/health` | Operations service health. |

The default integrated demo vehicle is `VF8-DEMO-01`. The backend remains
authoritative for owner/admin vehicle scoping; frontend route guards are UX only.

## Backend integration backlog

The current backend implements development identity/fleet authorization but not
production identity or the proposed V2 resource model. Keep these frontend
routes and connect them when the capabilities become available:

| Method | Endpoint/capability | Frontend expectation |
| --- | --- | --- |
| `GET` | `/api/v2/me` | Return the authenticated `User` contract including roles, effective permissions and authorized vehicle IDs; return `401` without a valid session. |
| Redirect | configured `VITE_AUTH_LOGIN_URL` | Start OIDC Authorization Code + PKCE or an equivalent secure server-session flow; accept a validated `return_to` callback. |
| `POST` | `/api/v2/auth/logout` | Revoke the server session and clear the HttpOnly cookie. |
| Session | secure cookie | `HttpOnly`, `Secure`, appropriate `SameSite`, short lifetime, rotation and CSRF protection for mutations. |
| CORS | both portal origins | Allow credentials only for the exact deployed Owner and Operations origins. |
| Policy | every V2 resource | Enforce tenant, role, permission and vehicle relationship checks server-side; frontend guards are UX only. |

After real V1 auth, Owner Web reads its authorized vehicle list, current state,
evaluation events and current vision metadata from protected V1 endpoints.
Telemetry history, profile, notification settings and emergency contacts remain
presentation fixtures because the backend has no resources for them yet.
Operations Web uses the protected V1 fleet state/events endpoints. The UI for
unsupported features remains in place and must be connected incrementally; the
full endpoint backlog is in `FRONTEND_BACKEND_REQUIREMENTS.md`.
