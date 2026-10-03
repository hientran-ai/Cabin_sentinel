# Platform API V2 — Owner Web & Operations Web

Base: `/api/v1`. Swagger: `/docs`. All JSON. Auth: `Authorization: Bearer <access_token>`.
Every mutation writes an audit entry; send `X-Correlation-ID` to tag a flow (echoed on the response).

## Auth
| Endpoint | Notes |
|---|---|
| `POST /auth/register` | owner/caregiver self-signup (off in production unless `ALLOW_SIGNUP=true`) |
| `POST /auth/login` | `{email,password,use_cookie}`. Cookie mode (default): refresh token in HttpOnly cookie `cs_refresh` + readable `cs_csrf`; body mode returns `refresh_token`. 5 failures lock the account 15 min |
| `POST /auth/refresh` | rotates the refresh token; cookie mode needs header `X-CSRF-Token`; reusing a rotated token revokes the whole session family |
| `POST /auth/logout`, `/auth/logout-all` | revoke |
| `GET /auth/me` | role, subject, visible vehicles |
Access token 15 min, refresh 7 days. Demo login still exists (disabled in production) and has no profile.
Roles: `admin`, `operator`, `owner`, `caregiver` (+ `device`). Permissions are editable per role (`/admin/roles`).

## Owner Web
- Profile: `GET/PUT /me/profile`; notifications: `GET/PUT /me/notification-settings` (quiet hours; CRITICAL overrides by default).
- Emergency contacts: `/me/emergency-contacts` CRUD + `POST .../{id}/verification` and `.../verification/confirm` (6-digit code; no SMS gateway wired, `dev_code` echoed outside production only).
- Caregivers: `GET /me/caregivers`, `POST /me/caregivers/invites` (token returned once), `PATCH /me/caregivers/{id}` (assign vehicles, `can_acknowledge`), `DELETE` revoke; caregiver accepts via `POST /caregiver-invites/accept`.
- Vehicles: `POST /vehicles`, `PATCH/DELETE /vehicles/{id}` (soft retire), `POST /vehicles/claim` (inventory vehicle + claim code), `POST /vehicles/{id}/pairing-code`. Built-in demo vehicles are read-only.
- Telemetry: `GET /vehicles/{id}/telemetry?minutes=30&bucket_seconds=30` → temperature + occupant confidence series (24 h retention, fed by device ingest).
- Live cabin: `POST /vehicles/{id}/live-sessions` → metadata poll session (`stream:null`, `raw_frames:false`), `GET /live-sessions/{id}`.
- Evidence: device uploads a blurred snapshot (`POST /vehicles/{id}/evidence`, `privacy_processed=true`), owner lists and gets a 10–300 s signed URL (`POST /evidence/{id}/signed-url`). Retention `EVIDENCE_RETENTION_HOURS`.
- Incidents: `GET /vehicles/{id}/incidents`, `POST .../{incident}/acknowledge`, `/hold` (`keep_active`, optimistic `version`), `/resolve` (still requires fresh empty-cabin evidence; blocked while held).
- Commands (`horn|sms|unlock`): `POST /vehicles/{id}/commands` → `requested`; `POST /commands/{id}/confirm` → `authorized`; device `GET /device/commands` → `sent`; device `POST /device/commands/{id}/ack` → `acknowledged|failed`; `expired` after 2 min; `cancel`. Unlock requires a current CRITICAL decision at request and confirm; unlock requested by non-owners needs a different authorizer; `sms` needs a verified contact. `REMOTE_COMMANDS_ENABLED=false` → 423.

## Device channel
`POST /devices/pair` (code + serial → per-device token scoped to one vehicle), `POST /device/heartbeat`, `GET /device/commands`, ack, evidence upload, plus existing `/vehicles/{id}/sensors|vision`.

## Operations Web (admin/operator; tenant-scoped staff see only their tenant)
`/admin/tenants`, `/admin/users` (+PATCH role/active, revoke-sessions), `/admin/roles`, `/admin/access-review`,
`/admin/vehicles?q=&status=&owner_id=&page=&page_size=`, `/admin/devices` (+heartbeats, revoke, firmware target),
`/ops/incidents` (+assign/escalate/note with `version` → 409 on conflict), `/ops/commands` (+reject),
`/admin/rulesets`, `/admin/models` (+rollout/rollback), `/admin/audit` (+`/export?format=csv|jsonl`, `/purge`),
`/admin/system` (dependencies, p50/p95, 5xx rate, latency history, alerts), `/admin/system/vision`.

## Not done (be explicit with the UI)
- **OIDC/SSO**: not implemented; needs an IdP decision. Sessions are password + HttpOnly refresh cookie.
- **WebRTC/HLS**: not implemented; live view is detection metadata only.
- **Rulesets** are versioned/audited, but `rules.py` still decides risk (`applied_to_engine:false`). **Model registry** records rollouts; it does not hot-swap the loaded model.
- **SMS/email/push delivery** are not wired; commands are a ledger that a device acknowledges. Blur is attested by the device, not re-verified server-side.
- Metrics are in-process (reset on restart, per worker); telemetry samples come from device ingest only.
- SQLite in `platform.db` next to the CabinService DB; single-node.
- Config: see `.env.example` (`PLATFORM_SIGNING_KEY`, `BOOTSTRAP_ADMIN_*`, `ALLOW_SIGNUP`, `REMOTE_COMMANDS_ENABLED`, `COOKIE_SAMESITE`). Cross-site SPAs on another domain: use `use_cookie:false` or `COOKIE_SAMESITE=none` over HTTPS.
