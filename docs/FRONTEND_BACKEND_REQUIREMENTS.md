# Backend capabilities required by the completed frontend

The current applications use only repository-confirmed V1 endpoints: `GET /health`, `GET /api/v1/state/{vehicle_id}`, `GET /api/v1/events/{vehicle_id}` and `POST /api/v1/demo/analyze`. The UI does not fabricate successful mutations. The following production APIs are required to unlock the designed routes.

## Platform requirements

- OIDC Authorization Code + PKCE or secure server session, `GET /api/v2/me`, logout, expiry and MFA policy. Every resource must be tenant- and relationship-scoped on the server.
- Stable JSON error envelope `{ code, message, correlationId, details? }`, request correlation IDs, pagination cursors and an OpenAPI schema committed for client generation.
- Revisioned resources, ISO-8601 UTC timestamps, idempotency keys on mutations and optimistic concurrency through `expected_revision`.
- CORS allow-list for the exact owner and operations origins. Expose `Retry-After` and correlation headers. Never use wildcard origins with credentials.
- Revisioned SSE stream with resumable event IDs; polling remains the fallback.

## Owner web and mobile

| Method | Resource | Required behavior |
| --- | --- | --- |
| `GET` | `/api/v2/me` | User, roles, permissions and authorized vehicle IDs. |
| `GET` | `/api/v2/vehicles?cursor=` | Paginated owner-scoped vehicles with latest backend decision summary. |
| `GET` | `/api/v2/vehicles/{id}/status` | Current decision, evidence freshness, device state and active incident ID. |
| `GET` | `/api/v2/vehicles/{id}/incidents?cursor=` | Incident history, not the heterogeneous edge event log. |
| `GET` | `/api/v2/incidents/{id}` | Revisioned incident, privacy-safe evidence, action results and acknowledgement. |
| `POST` | `/api/v2/incidents/{id}/acknowledgements` | Accept `expected_revision` and reason; return the authoritative incident. |
| `GET/PUT` | `/api/v2/me/notification-preferences` | Channels, quiet hours and verified contacts. |
| `POST/DELETE` | `/api/v2/me/push-registrations` | Register/revoke Expo/APNs/FCM device tokens without trusting verdicts from push payloads. |

## Operations portal

| Method | Resource | Required behavior |
| --- | --- | --- |
| `GET` | `/api/v2/operations/incidents?severity=&status=&cursor=` | Authorized fleet queue with stable priority and pagination. |
| `GET` | `/api/v2/operations/vehicles?query=&cursor=` | Fleet inventory and current backend-owned status. |
| `GET` | `/api/v2/operations/devices?health=&cursor=` | Heartbeat, camera/edge/cloud health and deployed model/rule versions. |
| `POST` | `/api/v2/incidents/{id}/commands` | Create a command request; never return physical success before device acknowledgement. |
| `GET` | `/api/v2/commands/{id}` | `requested -> authorized -> sent -> acknowledged/failed/expired` lifecycle. |
| `GET` | `/api/v2/operations/users` | Tenant users and effective permissions. |
| `PUT` | `/api/v2/operations/users/{id}/roles` | Audited RBAC update with server-side authorization. |
| `GET` | `/api/v2/operations/models` | Model registry, validation status and rollout progress. |
| `GET` | `/api/v2/operations/rules` | Versioned rule sets and approval state. |
| `GET` | `/api/v2/operations/audit?cursor=` | Immutable actor/action/resource/result audit records. |
| `GET` | `/api/v2/operations/system-health` | Authenticated aggregate dependency/read-model health. |

Remote horn, window, unlock or messaging controls must require explicit permission, incident context, idempotency, expiry, audit and device acknowledgement. A queued or simulated result is never equivalent to physical success.

## Data and safety semantics

- Backend remains authoritative for `riskLevel`, `ruleId`, `reason`, `revision`, `evaluatedAt` and `decisionCurrent`.
- Missing, malformed, stale or unreachable data must not become `SAFE`.
- Evidence exposed to product clients must be privacy-safe and retention-aware. The current stock YOLO path is not validated child detection.
- Push notifications contain navigation hints only. Clients refresh authenticated state before displaying a verdict.
