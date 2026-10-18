# FINAL_RELEASE_READINESS — CabinSentinel VinFast cockpit demo

Build `vinfast-DNzbu6dk.js` at https://c4-app-068.cabinsentinel-platform.workers.dev/cockpit/vinfast/ (audited 2026-10-17). Evidence: BUG_REPORT.md, TEST_CASES.md, TEST_SUMMARY.md and `evidence/`.

| Bar | Verdict | Why |
|---|---|---|
| **Live demo** (presenter-driven, Chrome/Safari on a ≥1440 px screen) | **CONDITIONAL GO** | The scripted path works end to end on real backend + real model: CRITICAL in about 2 s, phone alert, ack, refused resolve, resolve after empty evidence, new incident, link-loss "Dữ liệu cũ" (SC-01..05, SC-09/10). No P0/P1 sits on that path **if** the presenter (a) uses branded Chrome or Safari (BUG-004), (b) presses "Cabin trống" before resolving (BUG-011 / walkthrough step 4), and (c) avoids the rear-facing clip (BUG-001) and camera-blocked + radar (BUG-002). |
| **Hackathon judging** (judges click freely, own laptops) | **CONDITIONAL GO, close to NO-GO** | Judges will hit the walkthrough blockers: resolve looks broken, the critical alert is not dominant and overlaps the music widget (BUG-008), and at 1366×768 the safety tile is below the fold (BUG-012). Any judge who opens "Môi trường giả lập" and picks the rear-facing clip sees a calm cockpit and "BÌNH THƯỜNG" on the phone with a child in a 40 °C car (BUG-001 + BUG-005). Fix these before judging: BUG-005, BUG-008, BUG-010, BUG-011 (or add the guided hint), BUG-012, label the rear-facing clip as a known miss, and add a codec fallback (BUG-004). |
| **Internal prototype** | **GO** | The architecture choices hold up under failure injection: backend-only risk, no fallback to SAFE, revision ordering, stale/link handling, simulated-action ledger, phone-only ack/resolve. Open defects are tracked with executable regression tests. |
| **Real-world vehicle integration** | **NO-GO** | 1 P0 (BUG-001: missed child in a hot car reads as no risk) and 4 P1s (BUG-002 blocked camera + radar gives no alert; BUG-003 the UI blanks on malformed data; BUG-005 "normal" wording; BUG-004 the input pipeline silently depends on a codec). Also: no real vehicle/ECU, radar, push, SMS or OEM integration exists (all simulated, correctly labelled); the detector is stock COCO YOLOv8n with no child-seat finetune; the age classifier is off; Cabin Care is opt-out (BUG-006); there are no security headers (BUG-014). |

## GO criteria check (for "Live demo")

| Criterion | Status |
|---|---|
| All critical demo flows pass | PASS in Chrome and WebKit (SC-01..05, SC-07..12, SC-16, SC-22). Resolve needs the "Cabin trống" step first |
| No unresolved P0 | **Not met globally** (BUG-001), but BUG-001 is off the scripted demo path, hence CONDITIONAL |
| No blocking P1 in the demo path | Met only with the browser condition (BUG-004) |

## Minimum fix list before judging (ordered by impact/effort)

1. BUG-005: phone wording for SAFE → "Chưa thấy nguy cơ" (one mapping in `e2e-bridge.js`).
2. BUG-008: opaque critical toast.
3. Flow step 7 hint, or a "Bé đã được đưa ra" scenario; translate the "changed" rejection (BUG-011).
4. BUG-001 (interim): hot + locked + engine off + no detection ⇒ not SAFE; and mark the rear-facing clip "SR-01: model gốc bỏ sót".
5. BUG-002: radar presence must survive a blocked camera.
6. BUG-003: error boundary + read-model validation.
7. BUG-004: WebM fallback for the three sample clips.
8. BUG-012: fit the demo page at 1366×768.

Per CLAUDE.local, items 4 and 5 touch `rules.py`. They need the §5.4 process (sensitivity may only go up, never down), an update to the §5.3 threshold table, and the §8 checklist in the PR description.

## Limits of this audit

- Firefox was not testable (headless launch failed twice in this environment).
- CS-02 (adult) and CS-04 (pet) have no real-model fixtures in the repo.
- Device camera is disabled on the hosted build; permission granted/denied flows were not exercised.
- The Aurora skin (`?skin=aurora`) was not audited.
- Real SMS/push/call providers do not exist; only the simulated ledger was verified.
- Performance numbers are single runs from one location (Vietnam → Cloudflare SIN), not load tests.
- Production backend sessions were created by the tests (several dozen short-lived demo sessions, one per page load, which is normal page usage). Each erases on "Đặt lại" or ages out under the server's idle retention. No production data or configuration was modified and nothing was deployed.
