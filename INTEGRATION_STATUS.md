# CabinSentinel final demo integration — status

**Checkpoint 2026-10-17 · TASK_ID FINAL-DEMO-INTEGRATION-20261017 · OWNER Full-stack/Safety/QA**

## Source and ownership

The deploy-oriented source repository is `/Users/mac/AI/P-068`; the Cockpit candidate was observed in its dirty worktree `feat/cockpit-worker-backend` at `70b48aa`. That worktree contained 48 changed paths, including Agent 1 UI, phone, camera, and capture files. This task used a separate worktree, branch `codex/final-demo-integration-20261017`, based at the same SHA. A hash-verified snapshot of 80 changed/untracked source and QA inputs was copied; original changes were left in place.

Agent 2's branch exists separately in `/Users/mac/BUILD_PHASE/worktrees/critical-bug-fix-agent2-20261017` at `b619423`, with an uncommitted diff and a different source layout/base commit. That diff was reviewed and its needed tests/source patches were applied to this integration candidate. No Git merge/cherry-pick was claimed or performed. The task branch remains uncommitted; review and controlled sync to P-068 are still needed. Final hash comparison against the original working tree found **0 changed and 0 missing files** among the 80 snapshotted inputs.

| Domain | Owner in this integration | Evidence / integration state |
|---|---|---|
| Risk rules, radar fallback, incident checks | Safety/backend integration | Agent 2 changes remapped into `services/api/src`; regressions included |
| Care/autoplay, items analytics, telemetry | Backend/full-stack | Local implementation and tests; phone/user walk-through partial |
| Demo selector, capture, phone, responsive shell | Agent 1-derived UI plus integration fixes | Snapshot integrated in isolated candidate; not merged to deploy worktree |
| Vision model | Existing YOLOv8n provider | Actual stock model inference; limitations preserved |
| Notifications | Existing notification engine | Local in-app simulation; external channels disabled; no authorized external recipient configured |
| Worker headers/CORS | Full-stack | Unit tests; Worker preview and production propagation still require runtime verification |

## Decisions and safety contract

- **DECISION-20261017-QA-SOURCE:** the user's supplied findings are initial QA evidence; historical original QA was also found and read at `/Users/mac/AI/P-068/.claude/worktrees/oem-e2e/qa/vinfast-cockpit-audit/`.
- **DECISION-20261017-REAR-FACING-NEGATIVE-VISION:** negative vision cannot rule out a rear-facing/occluded child.
- **DECISION-20261017-UNKNOWN-PROJECTION:** project that case as occupancy `UNKNOWN` with existing risk `ERROR`; do not claim a child is present.
- **DECISION-20261017-ITEM-ANALYTICS:** separate COCO backpack/phone analytics; never safety input. A reminder requires two fresh accepted frames, same-label continuity, explicit simulated trip end and departed driver. Missing optional trip metadata produces no reminder for old clients.
- Model thresholds remain at YOLO `0.25`, safety minimum `0.40`, heat boundary `35°C`; no tuning to make clips look successful. Risk evaluation remains deterministic/offline.

## Work completed

- Added runtime validation for API read models and safe error logging, app-level recovery UI, immediate UNKNOWN/lost mapping, session retry coalescing, and no clearing the prior session's active incident when switching demo scenarios.
- Integrated eight supplied scenarios with stable IDs, source labels, poster-only selection, explicit simulated telemetry, real video frames to the real model, VP9/WebM fallbacks, a single player, frame run IDs, end/pause handling, and evidence UI. Converted three legacy clips to WebM fallbacks too.
- Preserved fresh-negative-camera uncertainty as `UNKNOWN/ERROR/OCCUPANCY_UNVERIFIED`; preserved positive radar through blocked/disconnected camera and deduplicated the transition notice. No synthetic bounding boxes or person-to-child mapping.
- Set care auto-consent default OFF; only explicit allowed music choices enter a plan; critical/stale/disconnected state stops audio.
- Added a separate item output and session-protected reminder responses; items never enter occupancy/risk/actions.
- Added an explicit critical Smart Interaction Card, removed duplicate e2e toast announcements, corrected phone clear/unverified wording, translated camera enums, removed actual `tel:112` actions from the simulator, and mapped resolve errors to reasons.
- Added Worker response headers, API `no-store`, upstream proxy-header stripping, explicit CORS origin checking, and `/cockpit/*` Worker routing for those headers.

## Verification performed

Evidence files are under `docs/final-integration-20261017/`.

- Frontend unit tests: **164 passed** across 21 files (including two new source-label contract tests).
- Worker tests: **20 passed**.
- Backend full run: **374 passed, 9 subtests passed** after fixing invalid image validation to use Pillow's original decoder rather than the YOLO monkey-patched decoder.
- Frontend typecheck and cockpit production build: pass.
- Local Playwright recovery tests: **3 passed** in Chromium for critical audio interruption, no real emergency dial link, and malformed/missing/unknown API state recovery. These API-fixture tests do not establish model recognition.
- Browser codec/selector checkpoint before the extended matrix: **2 Chromium tests passed**; a real WebM frame reached `MODEL_INFERENCE`, and all eight selector choices/Escape focus return worked. The full actual-model run then exposed a new API contract defect: scenario labels containing commas received HTTP 422 `Invalid frame_id or source_label`, so actual-video E2E accepted zero frames. Fixed by normalizing metadata labels against the current API contract and added two passing frontend unit tests. Re-running this Playwright case is blocked because binding localhost ports fails with `operation not permitted`; post-fix E2E remains NOT VERIFIED.
- Actual model evaluation: eight supplied clips, ten sampled real video frames each, model SHA `f59b3d83…83b36`, no injected detections, no external notification sends. See model evaluation report and raw JSON. DEMO-07 now ends `SAFE` with no incident/notification after fixing a legacy-incident migration bug.
- Frontend unit suite after the label-contract patch: **164 passed**; TypeScript typecheck and `git diff --check` pass. Backend remains 374 passed.
- Production read-only GET returned HTTP 200, but expected security headers were absent. Local Worker preview was not available for runtime header validation after its server ended; unit tests cover configuration only.

## Open/deferred and release gate

The actual model detects a person outside the cabin in DEMO-01; no spatial cabin ROI exists, so this clip cannot verify exterior rejection. DEMO-08 does **not** yield two consecutive backpack detections and therefore correctly creates no item reminder. A fixture proves reminder lifecycle only; it is not video-model evidence. DEMO-06's multiple outputs include repeated person boxes and one cat/dog label each; there is no annotated ground truth for precision/recall. No claim of model validation is made.

Extended Playwright testing exposed pause/reparent behavior; an explicit resume path was added. A focused Chromium E2E then found the source-label 422 defect described above; the local API/browser could not be restarted after patch due to OS sandbox port binding denial. The first broad matrix also timed out waiting for actual accepted frames in Chromium/Chrome/WebKit. These remain blocking integration gaps. Mobile/WebKit is browser emulation, not real Safari hardware. Camera permission, real push/SMS recipients, hardware, and the deployed source digest remain unverified. Phoenix Cohort 4's current form/rubric was not accessible in the available lookup; RULE-26 remains `UNVERIFIED`.

**Status: NOT READY TO DEPLOY / NOT READY TO CLAIM ALL ACCEPTANCE CRITERIA.** Do not publish this branch. Post-fix browser inference remains unverified; Worker headers are unit-tested but not preview-verified and absent in read-only production response; scenario model limits remain. Sync only after owners close the gates. No production deployment, merge, push, or hardware operation was performed.

## Agent handoff

- **Task:** FINAL-DEMO-INTEGRATION-20261017.
- **Files changed:** isolated P-068 candidate worktree plus this report set; BUILD_PHASE canonical reasoning architecture already contains TC21–TC23; root `AI_LOG.md` has a final checkpoint append.
- **Verified:** backend offline fallback through targeted regressions, UI API recovery, real-model eight-clip evaluation, frontend tests/typecheck/build, Worker unit tests.
- **Not verified:** post-fix eight-video browser inference (blocked by localhost bind denial), all eight browser-path inference scenarios in all engines, real Safari/camera/hardware/push, production build/version parity, and security-header propagation.
- **User decisions used:** rear-facing negative vision => occupancy UNKNOWN + existing risk ERROR; item analytics/reminder contract above.
- **Next owner:** integrate/review P-068 owner with Safety + QA; resolve P0/P1 model/browser blockers before release.

### Localhost follow-up — 2026-10-17

The local Vite/API processes remained running in the correct candidate worktree. A localhost GET executed outside the restricted sandbox succeeded: Cockpit HTTP 200 and API model READY with backpack/phone analytics. The localhost accessibility blocker is resolved for manual demo use at `http://127.0.0.1:4187/cockpit/vinfast/`. Post-label-fix Playwright has not been rerun in this follow-up; NO-GO and remaining model/browser/security release gates remain.
