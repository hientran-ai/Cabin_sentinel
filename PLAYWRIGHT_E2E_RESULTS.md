# Playwright E2E results

## Completed runs

| Run | Result | What it proves |
|---|---|---|
| Baseline Cockpit unit suite | 145 tests passed before integration | Existing frontend baseline only |
| Final Cockpit unit suite before final label fix | 162 passed across 20 files | Unit regressions including validators, source epochs/counts, consent and recovery |
| Final Cockpit unit suite after label fix | 164 passed across 21 files | Includes sanitizer test for API source-label validation |
| Worker suite | 20 passed | Header, proxy metadata, cache and rejected-origin behavior at Worker unit level |
| Local recovery spec, Chromium | 3 passed | Malformed JSON/missing nested/unknown enum retains UI and recovers; audio blocked for API-fixture critical; phone has no live `tel:` link |
| Earlier local codec/selector spec, Chromium | 2 passed | H.264 capability absent chooses WebM; one actual video frame reached local YOLO; 8 selector choices and Escape focus return |
| Expanded eight-video matrix | **INCOMPLETE / FAILED** | Eight actual-frame tests timed out waiting for two accepted frames in Chromium, Chrome and WebKit. DEMO-01 retry showed actual video decoding but API returned HTTP 422 `Invalid frame_id or source_label` because scenario title includes a comma. UI metadata is now normalized within the existing API contract, and two unit tests pass. Post-fix browser rerun is blocked: local API startup failed binding `127.0.0.1:8012` with OS `operation not permitted`. |
| Browser-level app modes, live camera permission, notification recipient | Not run | No device or authorized recipient claim |

Playwright configuration uses desktop Chromium at 1366×768, branded Chrome, WebKit, and iPhone 13 emulation at 390×844. iPhone/WebKit is emulation and does not count as physical Safari verification. Test browser API fixtures are clearly marked; they do not prove model detection.

## Artifacts

- Test code: `qa/vinfast-cockpit-audit/integration/`.
- Earlier green small codec/selector output: `player-selector-green.txt`.
- Recovery output: `recovery-green.txt`.
- First eight-clip matrix: `browser-matrix.txt`; failed screenshots and traces (where generated) are in `playwright-artifacts/`.
- Failed retry before the source-label fix: `browser-demo01-final.txt`; error context confirms HTTP 422 and actual video element reached `ENDED`.

The expanded run did not reach successful actual-browser inference for all eight scenarios. The metadata fix is code/unit-tested but its browser/API path remains unverified. Do not treat a page that renders, a clip URL returning 200, an API fixture, a unit test, or a standalone Python model evaluation as a passing full Playwright flow.
