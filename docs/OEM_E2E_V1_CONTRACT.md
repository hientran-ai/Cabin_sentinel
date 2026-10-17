# CabinSentinel V1 end-to-end: authority, contract and boundaries

Date: 2026-10-15. TASK_ID: OEM-E2E-V1-20261015. Branch `feat/oem-e2e-v1` (worktree
`.claude/worktrees/oem-e2e`, base `84847ea`). Decisions used: OEM-TARGET-20261015,
OEM-PHONE-ROLE-20261015. Neither approves new safety policy, thresholds or vehicle control.

## 1. Authority (checkpoint C0)

VERIFIED FACT: `src/cabinsentinel/{service,rules,graph,alerts}.py` is the only code path named by the
approved V1 requirement (RULE-26 c: upload → YOLO → VisionPayload + simulated vehicle state →
CabinService → rules/LangGraph → risk → action marked `SIMULATED`). By RULE-07 it is the single
authority for risk, incident, revision and action intent.

Not authoritative, not changed, not used to compute risk in E2E mode:

| Source | Why it is not the authority | Re-verified 2026-10-15 |
|---|---|---|
| `cockpit-web` `MockCabinAdapter` / `mockSnapshot` (hot ≥ 30 °C) | scenario picks the occupant; clip is not inferred | yes (source read) |
| `owner-web/cockpitScenario.ts`, Noir `cockpit-scenario.js` | independent JS timeline, no server calls | yes |
| Noir `backend/app/logic.py` (`STALE_AFTER_S=120`, `engine_on` → `paused`, line 207) | differs from P-068 TTL 5 s/3 s and from the "engine ON is not safe" invariant | yes (P-068 returns CRITICAL for 40 °C occupant with engine ON; Noir returns `paused`) |
| `embedded/cabin_edge` (uplink asks backend for risk; radar missing → false; `doors_locked=True` fixed) | edge is a perception library here; not part of the hosted path | read only, OEM-02 stays open |

Cross-version mapping (no threshold, TTL or enum is changed to make versions agree):

| Item | P-068 (authority) | Cockpit mock | Noir | Action |
|---|---|---|---|---|
| Risk enum | SAFE, NOTICE, WARNING, CRITICAL, ERROR | SAFE, WARNING, CRITICAL, UNKNOWN | safe/…/paused | E2E UI uses the P-068 enum verbatim; playground keeps its own enum and is labelled |
| Hot threshold | 35 °C (`DEMO_HOT_THRESHOLD_C`) | 30 °C | n/a | not changed; mock only in playground |
| Sensor / Vision TTL | 5 s / 3 s | none | 120 s | not changed |
| Single still image | goes stale after 3 s (`VISION_UNAVAILABLE`/`SENSOR_STALE`) | never stale | never stale | shown as stale; continuous monitoring needs new observations (clip frames) |
| Child | `person` is not child; age is a separate unapproved field and never lowers risk | child chosen by scenario | n/a | UI never prints "child" from a scenario |

IMPLEMENTATION / DESIGN MISMATCH carried forward (no change here): Noir `paused` branch (OEM-01) and
embedded sensor defaults (OEM-02). They are outside this task's data path; owner SAFETY_AGENT/BACKEND_AGENT.

## 2. Public contract added (additive, no destructive migration)

All under `/api/v1/e2e`, bearer = per-session demo token (same mechanism as `/api/v1/demo`).
Existing endpoints and enums are unchanged. New SQLite tables use `CREATE TABLE IF NOT EXISTS`.

| Endpoint | Purpose |
|---|---|
| `POST /sessions` | new vehicle `DEMO_<id>`, token returned once |
| `POST /sessions/{id}/sensor` | SIMULATED telemetry input only (no risk, rule or label fields accepted) |
| `POST /sessions/{id}/observations` | one frame → real YOLO inference → VisionPayload → CabinService. `observed_at = received_at − capture_age_ms` (clock-skew free); `frame_id` is the idempotency key |
| `POST /sessions/{id}/camera-status` | explicit camera fault/no-feed observation (`BLOCKED/ERROR/DISCONNECTED/NO_FEED`), never SAFE |
| `GET /sessions/{id}/state` | committed state + freshness + simulation labels + last observation provenance; read only |
| `GET /sessions/{id}/events?after=` | incremental event history |
| `GET /sessions/{id}/notifications` | phone feed derived from committed `alert`/action events with delivery state |
| `POST /sessions/{id}/notifications/{event_id}/delivered` | phone confirms in-app receipt |
| `POST /sessions/{id}/acknowledge`, `/resolve` | wrap `CabinService.acknowledge/resolve`, add actor + audit event; reject reasons are recorded |
| `POST /sessions/{id}/faults` | SIMULATED notification-provider failure switch (demo only) |

Delivery states: `PLANNED` → `ATTEMPTED` → `SIMULATED` (adapter returned `simulated`; this is **not**
provider accepted) → `IN_APP_DELIVERED` (phone confirmed fetch) or `FAILED`; `UNKNOWN` when the
attempt has no recorded outcome. `PUSH_OS_NOT_VERIFIED`.

## 3. Where each part runs (do not conflate)

| Layer | V1 hosted (this task) | Edge target (future) | OEM dependency (unverified) |
|---|---|---|---|
| Frame capture | browser (clip frame extraction / uploaded image) | OEM camera HAL | cabin camera, FoV, IR, power when locked |
| Vehicle signals | browser telemetry simulator, `SIMULATED` | vehicle bus adapter | signals, timestamps, source when locked |
| Inference | server CPU, YOLO weights `MODEL_PATH` | NPU/CPU on SoC | OS/SoC/SDK, model format |
| Rules / incident | server process (`CabinService`) | same core at the vehicle | watchdog, sleep/wake |
| Action | `MockActions`, `SIMULATED` | policy-checked gateway | actuator permissions, HVAC feedback |
| Phone | Cabin Noir owner web UI (Cabin repo), fed by `e2e-bridge.js` from the committed session; concept of an in-app feature | OEM app feature | app/cloud permissions |

`OEM_NOT_VERIFIED`: no SDK, camera/ECU access, or app integration has been granted or tested.
`HOSTED_SIMULATION`: everything above in the V1 column runs on the demo server/browser only.

## 4. Data flow (hosted V1)

```
clip frame / still image (browser)            vehicle simulator (browser, SIMULATED)
  └─ POST /e2e/.../observations                 └─ POST /e2e/.../sensor   (inputs only)
        │  validate → YOLO (server CPU) → VisionPayload (observed_at = received_at − capture_age)
        ▼
  CabinService._ingest  (BEGIN IMMEDIATE) → rules.decide / LangGraph → incident, alert, action ledger
        │  commit state + events, then MockActions/DemoActions (SIMULATED)
        ▼
  GET /e2e/.../state, /history, /notifications   (read-only)
        ├─ cockpit  (status chip, cabin sheet, toast from backend notification)
        └─ owner phone = Cabin Noir UI in an iframe; its /v1 calls are answered by e2e-bridge.js from the same committed state
           (banner, incident, ack, cabin check/resolve, history); patches listed in apps/cockpit-web/phone-ui/README.md
```

## 5. Known gaps carried forward (not changed here)

- SR-01: when the stock detector misses a child (e.g. rear-facing seat) the committed rule is `EMPTY_CABIN`/SAFE.
  The UI always prints "no detection is not an empty cabin" next to it. Owner SAFETY_AGENT.
- Initial CRITICAL alert plans horn, SMS and unlock request but no `send_notification` to the owner; the owner phone
  gets the `alert` event through the in-app feed, push state shows `NOT_PLANNED`. Owner SAFETY_AGENT/BACKEND_AGENT.
- Retention: demo sessions are deleted after `DEMO_RETENTION_HOURS` (default 24, telemetry class in COMPLIANCE §2.1)
  or on owner erasure. 24 h is a default chosen here, pending confirmation.

## 6. Cabin Care (added 2026-10-16): comfort while someone waits, human in the loop

Purpose: keep an occupant comfortable until a person returns. It is a bridge, never a resolution
(INT-01 treats climate/unlock as the last intervention). Code: `src/cabinsentinel/care.py`, endpoints below, tests `tests/test_care.py`.

| Endpoint (`/api/v1/e2e/sessions/{id}/…`) | Who | Effect |
|---|---|---|
| `care/declare {occupant: CHILD/ADULT/PET/UNKNOWN}` | owner phone | says who is inside (vision cannot tell age). Changes only the suggestion, never the risk or the alert |
| `care/start {profile?, music?}` | owner phone, or an adult in the car (cockpit) | runs the SIMULATED plan below |
| `care/stop` | owner phone / cockpit | ends comfort; incident stays open |
| `care/consent {auto_start}` | owner phone | pre-consent for the last-resort auto start (on by default in the demo) |
| `GET state` → `care` | both screens | status, plan, countdown, suggestion |

Plans (all `SIMULATED`, through the same action adapter): child/unknown = climate 25 °C low fan + lullaby + child-friendly
screen; adult = climate + camping mode + music/app; pet = climate + pet mode + "no children" notice. Climate is skipped
when the battery is unknown or ≤ 30 % (same floor as the pet rule).

Safety properties (each has a test):
- comfort never changes `risk_level`, never closes the incident, never cancels `request_unlock` (SR-04, SR-06);
- unknown occupant is treated as a possible child (SR-03); declaring "adult" changes no alert (TG-02);
- auto start only when: incident open, no acknowledgement or declaration yet, owner pre-consented, decision current (fresh data, SR-02),
  and 90 s since the initial alert (COMPLIANCE §5.2 escalation step). Any human response disarms it;
- every change is a `care` event with the actor (`OWNER_PHONE`, `COCKPIT_OCCUPANT`, `AUTO_TIMEOUT`); care ends with the incident.

Observed with the real model (browser run): auto start at 90 s → CRITICAL/HOT_OCCUPANT unchanged → as the simulated cabin
cooled below 35 °C the rule engine moved to WARNING/COOL_OCCUPANT while the incident stayed open. That is the existing
35 °C rule (flagged as too late in COMPLIANCE §5.2), not a care decision; changing it needs the §5.4 process. Owner SAFETY_AGENT.

Not done / limits: the 25 °C target is a design assumption (no clinical source in the repo); transitions are evaluated
lazily on state reads (a production build needs the safety timer to run them); music is synthesised in the browser
(public-domain melodies), "music app"/"podcast" are placeholders; no real climate, speaker or screen is driven (OEM_NOT_VERIFIED).
Ideas from the reference screens adopted: staged reminder timeline, in-car "owner notified" screen, scenario cards
(child/adult/pet), pet notice "no children". Not adopted: a "delayed" detection-sensitivity option (would be less
sensitive; TG-01 forbids it outside §5.4).
