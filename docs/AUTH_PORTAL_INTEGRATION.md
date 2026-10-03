# Authentication and portal integration

## Production flow

Owner Web and Operations Web share `@cabinsentinel/auth` and the same Cloudflare Worker origin.

1. The user submits email and password to `POST /api/v1/auth/login` with `use_cookie: true`.
2. The Worker proxies the request to the backend without exposing the backend origin in browser configuration.
3. The short-lived access token is kept in `sessionStorage`; the refresh token remains in an HttpOnly cookie.
4. `GET /api/v1/auth/me` returns the authoritative role and permitted vehicle IDs.
5. The frontend routes Owner/Caregiver users to Owner Web and Admin/Operator users to Operations Web.
6. `POST /api/v1/auth/refresh` rotates the session using the CSRF cookie/header pair; `POST /api/v1/auth/logout` ends it.

| Portal | Allowed roles |
| --- | --- |
| Owner Web | `OWNER`, `CAREGIVER` |
| Operations Web | `OPERATOR`, `ADMIN`, `AUDITOR` |

Frontend route guards are UX only. The backend remains authoritative for role and vehicle access.

## Runtime modes

- `VITE_AUTH_MODE=session` is the production default and uses the email/password session API.
- `VITE_AUTH_MODE=v1-demo` uses the backend demo-login endpoint for local development only. The backend disables it in production.
- `VITE_AUTH_MODE=mock` enables frontend-only personas for presentation; it provides no real authorization.
- In production, omit `VITE_API_BASE_URL` so requests use the Cloudflare Worker origin.
- `VITE_OWNER_WEB_URL` and `VITE_OPERATIONS_WEB_URL` can override portal links when developing the apps separately.

## Connected backend surface

| Method | Endpoint | Frontend usage |
| --- | --- | --- |
| `POST` | `/api/v1/auth/login` | Production email/password login and refresh-cookie creation. |
| `POST` | `/api/v1/auth/refresh` | Rotate the session and obtain a fresh short-lived access token. |
| `POST` | `/api/v1/auth/logout` | End the backend session. |
| `GET` | `/api/v1/auth/me` | Resolve role and authorized vehicle IDs. |
| `POST` | `/api/v1/auth/demo-login` | Local development only. |
| `GET` | `/api/v1/vehicles` | Fleet selectors. |
| `GET` | `/api/v1/vehicles/{id}/state` | Current vehicle state. |
| `GET` | `/api/v1/vehicles/{id}/events` | Evaluation stream. |
| `GET` | `/health` | Backend health. |

The default local demo vehicle is `VF8-DEMO-01`. Telemetry history, profile, notification settings and emergency contacts remain presentation fixtures until matching backend resources are available.
