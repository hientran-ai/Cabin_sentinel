# CabinSentinel Admin — Frontend/Backend handoff

## Scope

The Admin implementation is frontend-only. No FastAPI route, storage schema, authorization rule, or backend test was changed.

Frontend surfaces:

- Safety Operations: overview, incidents, evaluations, commands.
- Fleet Management: vehicles and devices.
- Platform Administration: tenants, users/access, AI models, safety rules.
- Assurance: audit log and system health.
- Languages: Vietnamese and English. API enum values remain unchanged; only presentation text is localized.

## Existing APIs used by the frontend

### Authentication and authorization

- `GET /api/v1/auth/me`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

### Incident operations

- `GET /api/v1/ops/incidents`
- `POST /api/v1/ops/incidents/{incident_id}/assign`
- `POST /api/v1/ops/incidents/{incident_id}/escalate`
- `POST /api/v1/ops/incidents/{incident_id}/note`
- `POST /api/v1/vehicles/{vehicle_id}/incidents/{incident_id}/acknowledge`
- `POST /api/v1/vehicles/{vehicle_id}/incidents/{incident_id}/hold`
- `POST /api/v1/vehicles/{vehicle_id}/incidents/{incident_id}/resolve`

The frontend sends the current operations `version` for mutations and expects HTTP `409` when another operator has already changed the incident.

### Remote commands

- `GET /api/v1/ops/commands`
- `POST /api/v1/vehicles/{vehicle_id}/commands`
- `POST /api/v1/commands/{command_id}/confirm`
- `POST /api/v1/commands/{command_id}/cancel`
- `POST /api/v1/ops/commands/{command_id}/reject`

The UI treats unlock as a high-risk action and prevents the requester from approving their own unlock. Backend authorization remains authoritative.

### Fleet and devices

- `GET /api/v1/admin/vehicles`
- `GET /api/v1/vehicles/{vehicle_id}/events`
- `GET /api/v1/vehicles/{vehicle_id}/telemetry`
- `GET /api/v1/vehicles/{vehicle_id}/incidents`
- `POST /api/v1/vehicles/{vehicle_id}/pairing-code`
- `GET /api/v1/admin/devices`
- `GET /api/v1/admin/devices/{device_id}/heartbeats`
- `PUT /api/v1/admin/devices/{device_id}/firmware`
- `POST /api/v1/admin/devices/{device_id}/revoke`

### Identity administration

- `GET/POST /api/v1/admin/tenants`
- `GET/POST /api/v1/admin/users`
- `PATCH /api/v1/admin/users/{user_id}`
- `POST /api/v1/admin/users/{user_id}/revoke-sessions`
- `GET/PUT /api/v1/admin/roles[/{role}]`
- `GET /api/v1/admin/access-review`

### Configuration and assurance

- `GET/POST /api/v1/admin/models`
- `POST /api/v1/admin/models/{model_id}/rollout`
- `POST /api/v1/admin/models/{model_id}/rollback`
- `GET/POST /api/v1/admin/rulesets`
- `POST /api/v1/admin/rulesets/{version}/activate`
- `GET /api/v1/admin/audit`
- `GET /api/v1/admin/system`
- `GET /api/v1/admin/system/vision`

## Backend additions recommended

### P0 — authorization contract

Extend the authenticated identity response, or add `GET /api/v1/me/access`, with:

```json
{
  "subject": "user-id",
  "role": "operator",
  "tenant_id": "tenant-id-or-null",
  "permissions": ["fleet.read", "incident.manage"],
  "vehicle_ids": ["VF8-DEMO-01"]
}
```

The frontend currently derives page visibility from the coarse `admin`/`operator` role. Effective permissions must come from the backend before custom role permissions can safely control navigation and individual buttons.

### P0 — stable localized errors

Return a stable machine-readable code in addition to the English detail:

```json
{
  "code": "COMMAND_FOUR_EYES_REQUIRED",
  "message": "A second operator must approve this unlock request",
  "correlation_id": "...",
  "details": {}
}
```

Required for Vietnamese/English UI localization. The frontend must not translate arbitrary backend prose.

Suggested codes include:

- `INCIDENT_VERSION_CONFLICT`
- `INCIDENT_HELD_OPEN`
- `INCIDENT_NOT_CURRENT`
- `COMMANDS_DISABLED`
- `COMMAND_FOUR_EYES_REQUIRED`
- `COMMAND_DECISION_NOT_CURRENT`
- `LAST_ACTIVE_ADMIN`
- `CANNOT_CHANGE_SELF_ACCESS`
- `TENANT_SCOPE_VIOLATION`

### P1 — incident detail and timeline

Add `GET /api/v1/ops/incidents/{incident_id}` returning:

- Incident and operations state.
- Vehicle summary.
- Evaluation revisions.
- Privacy-safe evidence metadata.
- Notes and assignment/escalation history.
- Related commands.
- SLA timestamps.

The current frontend can operate from the queue record but cannot render a complete investigation timeline without multiple calls and inferred joins.

Add an explicit operations transition such as:

```text
UNASSIGNED -> ASSIGNED -> INVESTIGATING -> ESCALATED | RESOLVED
```

### P1 — fleet overview aggregation

Add `GET /api/v1/ops/overview` with totals and the highest-priority queue rows. The current dashboard requests vehicles, incidents, commands and system status separately.

### P1 — tenant detail

Add `GET /api/v1/admin/tenants/{tenant_id}` with user, vehicle, device and open-incident counts. The frontend currently joins authorized list responses in memory.

### P1 — account invitation

Replace administrator-selected temporary passwords with an invitation flow:

- `POST /api/v1/admin/users/invitations`
- Single-use, expiring setup token.
- `INVITED`, `ACTIVE`, `DISABLED`, `LOCKED` account states.
- Audit records for invitation, acceptance and expiry.

### P1 — safety rule verification

Before activation, provide:

- Schema endpoint for editable parameters.
- Dry-run/simulation endpoint against recorded evaluation data.
- Diff against the active version.
- Explicit `applied_to_engine` state.
- Rollback endpoint.

The UI currently warns that a registry-active ruleset may not actually control `rules.py`.

### P1 — model rollout observability

Return rollout health per model version:

- Assigned and reporting device counts.
- Load failures and inference error rate.
- Latency and confidence changes.
- Last rollout actor/time.
- Previous active model and rollback eligibility.

### P2 — server-side filtering and pagination

Keep filters in URL/query parameters and return totals for:

- Evaluations across all authorized vehicles.
- Incident search by risk, tenant, vehicle and open duration.
- Commands by type, requester and approval state.
- Audit by actor, action, target, outcome, tenant, correlation ID and time range.

## Status semantics expected by the frontend

- Unknown, missing or stale safety data must never be returned or presented as `SAFE`.
- Command terminal states: `acknowledged`, `failed`, `expired`, `canceled`, `rejected`.
- Device terminal access state: `revoked`.
- Incident resolution requires a current revision, physical cabin confirmation and no active hold.
- Unlock requires a current `CRITICAL` decision and backend-enforced four-eyes authorization when applicable.

## Frontend QA contract

Backend integration testing should cover:

1. Admin sees platform and tenant-wide resources according to scope.
2. Operator cannot access platform-only routes or mutations.
3. Tenant staff cannot create platform administrators or cross tenant boundaries.
4. An operator cannot approve their own four-eyes unlock request.
5. Incident version conflict returns `409` without overwriting the newer state.
6. Revoked devices cannot authenticate, heartbeat or receive commands.
7. Rules/model changes and all access changes create immutable audit entries.
8. Error envelopes include a stable code and correlation ID.
