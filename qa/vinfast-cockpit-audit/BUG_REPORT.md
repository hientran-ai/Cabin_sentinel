# BUG_REPORT — CabinSentinel VinFast cockpit demo (production, 2026-10-17)

Every bug below was reproduced in a real browser against the deployed build `vinfast-DNzbu6dk.js`, except where it says **mock**, meaning a Playwright route mock injected the failure (production was never disrupted). Evidence paths are relative to `qa/vinfast-cockpit-audit/`. Regression test names refer to `tests/*.spec.ts`. Known-open bugs are encoded with `test.fail()`, so the suite stays green while the bug persists and turns red once it is fixed.

**Severity count: P0 = 1, P1 = 4, P2 = 13, P3 = 13 (31 total).**

---

## P0

### BUG-001 · P0 · Rear-facing child in a 40 °C locked, parked car shows "Chưa thấy nguy cơ" on the cockpit and "BÌNH THƯỜNG" (normal) on the phone, and no incident opens
- **Screen:** cockpit cabin tile, owner phone home; backend rule evaluation.
- **Repro:** fresh session → Môi trường giả lập → cabin slider 40 °C, "Cửa khoá" on, "Điều hoà bật" off → clip "Trẻ ngồi ghế an toàn quay lưng". Watch for 30 s.
- **Expected (SR-01, safety brief CS-06):** "nothing detected" is not "empty". In a hot, locked, parked car with the engine off, the system should at least be UNVERIFIED or WARNING and must never read as normal.
- **Actual:** revisions 6 to 41 all `SAFE / EMPTY_CABIN / ABSENT`, cabin 39.3 to 39.8 °C, detections empty, no incident, no notification. The cockpit is green-toned "Chưa thấy nguy cơ" with the caution line. The phone shows "BÌNH THƯỜNG · Chưa thấy nguy cơ".
- **Evidence:** `evidence/matrix/CS06d-rear-child-hot-fresh/timeline.json`, `rear-hot.png`; also `evidence/matrix/CS06-rear-child/`.
- **Root-cause hypothesis:** the stock YOLOv8n COCO detector misses rear-facing child seats (known: 0/21 frames, SR-01 open, shown in the offline trace tab). The rules then treat "no detection + fresh + no radar" as `EMPTY_CABIN` regardless of temperature and lock state.
- **Context:** not on the scripted judge path (the "Trẻ trong xe" scenario uses a forward-facing AI clip that *is* detected). Still, it is the exact case the product exists for, and a judge who picks this clip from the sim panel gets a calm screen.
- **Fix:** (1) a rule: `engine OFF ∧ locked ∧ temp ≥ hot threshold ∧ no occupant evidence` ⇒ at least `WARNING`/unverified ("không xác minh được cabin, xe nóng"), never `SAFE`; (2) a finetuned detector (planned); (3) until then, label the clip in the UI as a known miss.
- **Regression test:** `safety.spec.ts › BUG-001` (currently `test.fail`).

## P1

### BUG-002 · P1 · Camera blocked + radar reports a person in a hot, locked car → `ERROR` only, no incident, no notification
- **Repro:** "Camera bị che" (or sim fault "Bị che") → "Radar báo có người" → cabin 30 to 40 °C, locked. Watch for 60 s.
- **Expected (CS-07):** keep the radar risk; the owner must be told someone may be inside and the camera cannot see.
- **Actual:** `ERROR / CAMERA_UNAVAILABLE / SUSPECTED`, notifications 0, no incident. Compare CS-08 (same radar, camera clear and seeing nobody): `WARNING / RADAR_FALLBACK` with an incident and a push. **A blocked camera escalates less than a working camera.**
- **Evidence:** `evidence/matrix/CS07-blocked-radar/`, `evidence/matrix/CS07b-blocked-radar-long/` (60 s, n=0), `evidence/matrix/CS08-radar-vs-vision/`.
- **Root cause (hypothesis):** `CAMERA_UNAVAILABLE` takes precedence over `RADAR_FALLBACK` in the rule order, and `ERROR` never opens an incident.
- **Fix:** evaluate radar presence before camera unavailability, or make `CAMERA_UNAVAILABLE ∧ radar_presence` open a WARNING incident ("radar báo có người, camera không xác minh được").
- **Regression:** `safety.spec.ts › BUG-002`.

### BUG-003 · P1 · Any malformed `/state` body blanks the whole page (cockpit and phone): no error boundary
- **Repro (mock):** serve `200 {}` for `GET /sessions/:id/state`.
- **Expected:** the cockpit stays mounted and shows "Không xác minh được / dữ liệu lỗi".
- **Actual:** `TypeError: Cannot read properties of undefined (reading 'vision')` → the React root unmounts → white page. Also triggered by any state missing `freshness`.
- **Evidence:** `evidence/negative/N-08.png` (fully white), `evidence/negative/results.json`.
- **Root cause:** `liveAge(state.freshness.vision)` and similar code assume a full schema; `src/` has no app-level `ErrorBoundary` (only around the 3D car).
- **Fix:** validate the read model in `pollOnce` (reject and count a failure if required fields are missing) and wrap `VinfastExperience` and `PhoneFrame` in an error boundary that renders the "unverifiable" state.
- **Regression:** `resilience.spec.ts › BUG-003`.

### BUG-004 · P1 · The headline scenario silently never alarms in browsers without H.264 (e.g. open-source Chromium builds)
- **Repro:** open the demo in Playwright's bundled Chromium (no proprietary codecs) → "Trẻ trong xe, xe nóng".
- **Expected:** a CRITICAL alert, or a clear "this browser cannot play the sample clip" message.
- **Actual:** the video never decodes → the client posts `NO_FEED` → backend `ERROR / CAMERA_UNAVAILABLE` for 45+ s. The flow bar says "Camera lỗi: không có hình để phân tích"; the scenario card still promises "Mong đợi: cảnh báo trên xe và điện thoại". Branded Chrome and WebKit work (CRITICAL in about 2 s). Firefox could not be launched here (not tested).
- **Evidence:** `evidence/sc-child-hot-chromium-nocodec/` (timeline), `evidence/viewports/engines.json`.
- **Fix:** ship WebM/VP9 (or AV1) alongside the MP4 (`<source>` fallback), or pre-extract JPEG frames; on `video.error` show "Trình duyệt không phát được clip mẫu".
- **Regression:** `safety.spec.ts` (runs on `chrome` and `webkit`; documents the skip for bundled Chromium).

### BUG-005 · P1 · The phone calls `SAFE/EMPTY_CABIN` "BÌNH THƯỜNG" (normal), while the cockpit carefully says "Chưa thấy nguy cơ"
- **Repro:** "Cabin trống" → phone home.
- **Expected:** the same non-committal wording on every surface (SR-01): e.g. "CHƯA THẤY NGUY CƠ".
- **Actual:** the phone kicker is "BÌNH THƯỜNG". Combined with BUG-001, a missed child reads as "normal" on the owner's phone.
- **Evidence:** `evidence/matrix/CS09-stale/` (phone text), `evidence/matrix/CS06d-rear-child-hot-fresh/timeline.json`.
- **Root cause:** the Cabin Noir phone UI maps `level: safe` to its own label; `e2e-bridge.js` maps `ok → safe`.
- **Fix:** map the cockpit `ok` tone to a dedicated "unconfirmed-clear" level in the bridge, or patch the phone label.

## P2

### BUG-006 · P2 · Cabin Care auto-starts 90 s after an alert without the owner opting in; the UI copy says it requires prior consent
- **Repro:** "Trẻ trong xe" and do not touch the phone for 100 s.
- **Actual:** `care.auto_consent` is `true` by default (`services/api/.../care.py IDLE`). At about 92 s Cabin Care becomes `ACTIVE`, `started_by: AUTO_TIMEOUT`, and the simulated climate turns on. The cabin then cools and the backend downgrades `CRITICAL → WARNING` (about 118 s) with the child still present. The cockpit ladder says "Tự bật dỗ bé **nếu chủ xe đã đồng ý trước**". The phone shows a countdown pill "Cabin Care tự bật sau 85s".
- **Evidence:** `evidence/sc-escalation/escalation.json`, `t090.png`.
- **Fix:** default `auto_consent=false` (opt-in in CabinSentinel settings), or change the copy to "mặc định bật, tắt trong Cài đặt". Consider keeping the incident at the original severity until a human checks.

### BUG-007 · P2 · Escalation notification is `push: NOT_PLANNED`
- **Actual:** at the 90 s escalation the 4th notification (`ESCALATED#4 CRITICAL`) has `push.state = NOT_PLANNED`; only SMS (simulated) is in the ledger. The owner's phone gets no push at the most severe stage.
- **Evidence:** `evidence/sc-escalation/escalation.json` (t=96).
- **Fix / verify:** confirm intent with §5.2 of the compliance baseline. If escalation should also re-alert the owner, plan the push.

### BUG-008 · P2 · The critical cockpit toast has a transparent background and sits exactly on the media widget; both texts overlap
- **Actual:** toast box `[992,381,321,70]` over media `[935,375,373,69]`, `background-color: rgba(0,0,0,0)`. "Giám sát cabin: Có người/thú…" is drawn over "Mưa trên kính xe / Trạm Số 9".
- **Evidence:** `evidence/sc-child-hot/01-alarm-viewport.png`, `evidence/alarm-prompts/cockpit-zoom.png`.
- **Fix:** give `.vf-toast` an opaque surface (the glass backdrop is not applied), or hide the media widget while a critical toast is shown.

### BUG-009 · P2 · Phone: the floating "Cabin Care tự bật sau Ns" pill sits a few px under the Xử lý ngay / Đã xem / Gọi 112 row and covers the next card; two stacked toasts cover the top of the screen
- **Actual:** the countdown pill is absolutely positioned about 4 px below the "Gọi 112" button and overlaps the seat-map card, which risks a mis-tap next to the emergency button. At incident start, two OS-style toasts ("Nghiêm trọng…" and "Cảnh báo…", see BUG-027) cover the verdict area.
- **Evidence:** `evidence/alarm-prompts/phone-zoom.png`, `evidence/sc-child-hot/01-alarm-viewport.png`.
- **Fix:** put the pill in normal flow inside the incident card; show one toast per incident (replace, do not stack).

### BUG-010 · P2 · The "why" line on the cabin tile is wrong for most unverifiable states, and an open CRITICAL incident becomes a grey tile when data goes stale
- **Actual:** for every non-current state the tile says "Ảnh gần nhất đã hết hiệu lực", including a fresh session where no image ever arrived, a blocked camera, and `NO_FEED`. After a still upload or source stop during a CRITICAL incident, the tile shows grey "Chưa thể xác minh cabin" and drops the open incident. The left banner and phone do keep "Sự cố vẫn mở".
- **Evidence:** `evidence/matrix/CS-blocked/final.png`, `evidence/upload-timing/timeline.json`.
- **Fix:** `whyText()` should use `RULE_VI[state.rule_id]` (Camera không thể xác minh / Chưa có dữ liệu cảm biến…). When `incident.status==='OPEN'`, show "Sự cố đang mở · không xác minh được" with the incident severity colour.

### BUG-011 · P2 · Resolving while frames stream is often rejected with "Sự cố đã thay đổi" (revision race); a still-present child is reported as "data changed"
- **Actual:** the first resolve with the child visible → `409 State changed; inspect the current revision` → phone "Sự cố đã thay đổi… xác nhận lần nữa", not "Vẫn phát hiện người". Revisions advance about twice per second (sensor + observation), so the GET-then-POST window races.
- **Evidence:** `evidence/sc-child-hot/net.json` (409 at t=45.9 s), `summary.json.reject1`.
- **Fix:** resolve against the incident plus an evidence check, not the global revision; or retry once server-side when only sensor/observation revisions moved. Report presence before the revision check.

### BUG-012 · P2 · At 1366×768 and at 125%/150% browser zoom the safety tile is below the fold; 11 cockpit buttons are under 24 px
- **Evidence:** `evidence/viewports/metrics.json`, `1366x768.png`, `1280x720.png`. At 1440×900: 9 buttons under 24 px; the tile headline is 14–15 px.
- **Fix:** below about 1500 px wide, collapse the flow bar into one line or reduce scenario-card height so the cockpit row fits; or offer the fullscreen view (which fits 1366×768 at 0.71 scale) as the default on small screens.
- **Regression:** `a11y-responsive.spec.ts › BUG-012`.

### BUG-013 · P2 · Phone-width (390 px) layout: the cockpit is rendered at 18 % scale (6 px headline, 9 px buttons) and there is no fallback
- **Evidence:** `evidence/viewports/390x844-full.png`, `metrics.json`.
- **Fix:** below 768 px show the owner phone first and a "Mở trên máy tính để xem màn xe" note (or the fullscreen cockpit in landscape).

### BUG-014 · P2 · The HTML has no security headers
- **Actual:** no `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `Strict-Transport-Security`, `X-Content-Type-Options` or `Referrer-Policy` on `/cockpit/vinfast/` (the API sets `nosniff` only). The page can be framed (clickjacking of the scenario and reset buttons).
- **Evidence:** `evidence/a11y-perf-sec/html-headers.txt`.
- **Fix:** add the headers in the Worker response for static assets (CSP allowing self, openfreemap tiles, the weather API).

### BUG-015 · P2 · Privacy claim on the cockpit contradicts the hosted data flow
- **Actual:** "Cách hoạt động" and Settings say "Ảnh gốc không rời thiết bị", but the hosted demo uploads every clip frame and any user-uploaded photo to the demo server for inference. The backend reads the image in memory and does not persist it (`e2e_api.post_observation`), which matches the consent text "không được lưu sau khi phân tích".
- **Fix:** on the hosted build say "Ở bản demo, khung hình được gửi tới máy chủ demo để phân tích và không được lưu; trên xe thật ảnh gốc không rời thiết bị" (CLAUDE.local rule: figures and claims must state real versus target).

### BUG-016 · P2 · Focusable controls inside `aria-hidden`; nested interactive controls
- **Actual (axe, serious):** while a panel is open the right-hand widgets get `aria-hidden=true` but stay focusable (`aria-hidden-focus`). `.vf-bt-logo` has `role=img` and contains the mode-widget button (`nested-interactive`).
- **Evidence:** `evidence/a11y-perf-sec/results.json`.
- **Fix:** add `inert` to the hidden layer; move the mode widget out of the `role=img` wrapper.

### BUG-017 · P2 · The critical alarm is announced up to three times; one of them is an invisible 0×0 `role=alert`
- **Actual:** during CRITICAL, `[role=alert]` = left banner (visible), `.vf-prompt` (0×0 in the blue skin, still in the a11y tree), toast (visible).
- **Evidence:** `evidence/alarm-prompts` console output in this report's run log.
- **Fix:** do not render `VinfastPrompt` in the blue skin; keep one `role=alert` per event.

### BUG-018 · P2 · Opening a panel does not move focus into it, and the panel does not trap focus
- **Actual:** Enter on "Tổng quan xe" opens Settings, but focus stays on the launcher behind it (Escape correctly returns focus).
- **Regression:** `navigation.spec.ts › BUG-018`.

## P3

| ID | Summary | Evidence | Fix |
|---|---|---|---|
| BUG-019 | `/status` failure banner is wiped when session creation succeeds (`newSession` sets `serviceError: null`), so a model/status outage is invisible (**mock**) | `evidence/negative/N-01.png` | keep separate `statusError` and `sessionError` |
| BUG-020 | 6 rapid "Đặt lại" clicks create 6 sessions and 6 erases; no in-flight guard (**mock**) | `evidence/negative/results.json` N-12 | disable the button while `newSession` is pending |
| BUG-021 | API responses leak infrastructure: `x-proxied-host: http://10.120.20.55`, `x-proxied-replica`; CORS reflects any `Origin` with `authorization` allowed (bearer-token auth, so impact is low) | `evidence/a11y-perf-sec/api-headers.txt` | strip `x-proxied-*` in the Worker; allow-list origins |
| BUG-022 | Phone shows raw enums for camera status ("NO_FEED", "BLOCKED") | `evidence/sc-child-hot-chromium-nocodec/summary.json` phoneText | map them in `e2e-bridge.js` |
| BUG-023 | Media "Bài trước/Bài sau" switch **stations** on Radio (by design), but the labels say track | controls MD-02 | label "Kênh trước/sau" when source = radio |
| BUG-024 | "Chưa tích hợp" library tiles are `aria-disabled=true` yet clickable (they toast) | controls LB-01 | drop `aria-disabled`, keep the badge |
| BUG-025 | Contrast 1.46:1 on the phone's active tab label (#f5c518 on #f2f2f7); map attribution target 15 px; `<dl>` nested in `<dl>` in the cabin panel | `evidence/a11y-perf-sec/results.json` | darker active colour; fix markup |
| BUG-026 | Flow step 5 "Điện thoại nhận" stays pending for 10–20 s while the phone already shows the alert; delivery is marked only when the bell list is fetched | `evidence/sc-child-hot/timeline.json` (feed PUBLISHED → IN_APP_DELIVERED at t≈24 s) | call `confirmDelivered` when the phone renders the incident card |
| BUG-027 | Two notifications within about 1 s at incident start (INITIAL WARNING, then LOCK_WARNING CRITICAL) | `evidence/sc-escalation/escalation.json` t=3–4 | coalesce stage upgrades inside a short window |
| BUG-028 | Fullscreen cockpit (`?view=cockpit`) has no on-screen way back | controls DP-09 | small "← Trang demo" chip outside the artboard |
| BUG-029 | Left panel shows both "Phanh tay" and "Giữ phanh" pills for the same parking-brake flag | `evidence/discovery/baseline-1920-full.png` | keep one |
| BUG-031 | "Sạc / EV" opens the map with the search input auto-focused; Escape is then ignored (the global handler skips `INPUT` targets), so the keyboard user cannot close the map | `navigation.spec.ts › launcher "Sạc / EV"` | in the input, Escape should close the sheet and then the map |
| BUG-030 | Every page load logs a console 404 (`GET /state` before the first evaluation is a 404 by design) | `evidence/discovery/console.json` | return `204`/`{state:null}` for "not evaluated yet" |

## Not bugs (verified behaviour worth keeping)

- Out-of-order revisions are ignored (`mergeState`), and 401 recreates the session with an explanation.
- `500`/`429`/HTML/timeout responses become "Dữ liệu cũ" within about 1.5 s and never green.
- Link loss and real offline (`context.setOffline`) show "Dữ liệu cũ · Nguy hiểm" and recover in about 3 s.
- Every vehicle action (horn, SMS, unlock) is `simulated` or `pending_human_confirmation`; the lock button never actuates.
- The cockpit has no acknowledge or resolve control; only the phone does.
- Resolve is refused while a person is visible. Ack never closes the incident. A new event after resolution opens a new incident ID.
- Uploads: GIF, text, empty and corrupt files are rejected client-side; a hostile filename is sanitised server-side and React-escaped (no script ran).
- Driving: text entry in map search is disabled while moving.
- The weather API failed once out of two runs, and the UI fell back gracefully ("Không lấy được thời tiết, dùng thanh trượt").
