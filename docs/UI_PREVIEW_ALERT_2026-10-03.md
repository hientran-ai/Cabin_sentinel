# Preview and inline alert update — 2026-10-03

TASK_ID: FRONTEND-PREVIEW-ALERT-20261003. OWNER: FRONTEND_AGENT.
Scope: BUILD_PHASE/Cabin-frontend dashboard; P-068 unchanged.

USER DECISION — DECISION-20261003-RAW-PREVIEW-INLINE-ALERT
Question: retain full-frame preview blur and fullscreen alert?
Decision: user explicitly requested removing full-frame blur for now and preventing alerts from blurring/covering the screen.
Supersedes DECISION-20261002-REALTIME-PREVIEW for dashboard preview only.
Affected: RealtimeCabinFeed, CabinFeed, CriticalModal, App, Overview, App.css, UI tests.
Privacy disclosure: visible preview is original and unblurred; raw-frame backend transmission remains opt-in. No persistence/retention policy changed.

CHANGE INTENT: draw original camera/capture frame with existing capture-aligned YOLO boxes; replace fullscreen focus-trapping alert with inline notice and collapsed native details. No API, schema, backend risk, freshness, action or authorization changes. Confidence 95%.

VERIFIED FACT:
- CODE_CHANGED: preview renderer, labels, alert placement/style/focus behavior and matching component tests.
- TEST_EXECUTED / TEST_PASSED: 64/64 dashboard tests; TypeScript + Vite production build; oxlint.
- Requirement red phase: 5 failures/10 passes before implementation. Three obsolete blur-capability tests and their helper retired because the user superseded that requirement, not to conceal a defect.
- INTEGRATION_VERIFIED / RUNTIME_VERIFIED (local): production frontend5183 → camera backend7861 → actual YOLO using public bus-image fake camera → CRITICAL → inline alert and original image with boxes.
- Browser assertions: canvas filter none, CSS filter none, no backdrop blur, no modal, alert position static inside MAIN, details initially closed, outside focus retained; notice210px in577px viewport. Details expand/collapse and camera stop confirmed.
- Evidence: ui-preview-alert-evidence/browser-check.json, dashboard-tests.log, inline-critical.png, raw-preview.png.
- Historical realtime integration evidence remains historical; its blur screenshots/tests are superseded by this update.

Known limits: actual webcam/Pi hardware and hosted camera deployment unverified. Existing backend-only safety and SIMULATED labels preserved; no hardware success claim.
RULE-26: checked https://phoenix.note.transformerlabs.ai/dashboard?cohort=cohort-4 and https://phoenix.note.transformerlabs.ai/demo-day on2026-10-03; both inaccessible with web tool. Current rubric UNVERIFIED; owner PO. No submission readiness claim; this UI change follows direct user instruction.

AGENT_HANDOFF
Task/owner and files: above; removed obsolete blurredPreview.ts and blurred-preview.test.ts.
Verified behavior/tests/user decision: above.
Assumptions remaining: none added to safety or API contracts.
Known risks: original preview exposes visible camera imagery as requested; truthful disclosure and opt-in transmission retained.
Next owner: FRONTEND_AGENT for further UI feedback; BACKEND_AGENT for previously documented online camera deployment gap.
