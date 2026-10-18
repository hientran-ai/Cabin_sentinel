# UX_UI_AUDIT — CabinSentinel VinFast cockpit demo

Inspected on production in branded Chrome and WebKit at 1920×1080, 1440×900, 1366×768, 1024×768, 390×844 and the zoom equivalents (1536×864 ≈ 125 %, 1280×720 ≈ 150 % of 1920). All measurements are **measured** values (`evidence/viewports/metrics.json`). Every claim links to a screenshot.

## 1. Overall verdict

The demo page explains itself better than most hackathon HMIs. There's a one-line simulation disclaimer, labelled scenario cards with "Mong đợi: …", a 7-step flow bar driven only by committed backend state, and a "same revision" chip between the car and the phone. Safety wording is careful on the cockpit ("Chưa thấy nguy cơ", "Chưa thể xác minh cabin", "Dữ liệu cũ"). The weak points:
- the scaled cockpit is too small on laptop screens;
- the critical alert is not visually dominant on the cockpit;
- the phone's wording and layout drift from the cockpit's (BUG-005, BUG-009);
- several overlaps appear exactly at the alarm moment (BUG-008, BUG-009).

## 2. Component inspection

| Area | Finding | Severity | Evidence |
|---|---|---|---|
| Header | Clear title and disclaimer. The session id "Phiên 895a9a3b" is meaningless to a judge; consider "Phiên demo mới" + tooltip | P3 | `evidence/discovery/baseline-1920-full.png` |
| Scenario strip | Good: the expected outcome is printed on each card. At 1920 the strip wraps "Mất kết nối" to a second row, so the 4 scenarios read as 3+1 | P3 | baseline |
| Scenario strip | The pressed state (`aria-pressed`) persists after "Đặt lại"? It is reset; OK. No running/progress indicator on the card after click; the flow bar carries progress instead | — | sc-child-hot `01-alarm` |
| Flow bar | Strong concept. Step 5 lags the visible phone alert by 10–20 s (BUG-026); step 7's hint doesn't say the cabin must first look empty ("Cabin trống") before the check can close, which is the main judge confusion (see §5) | P3 | timeline |
| Cockpit frame | At 1920×1080 the artboard renders at **0.617** scale: tile headline 21 px, smallest button 30 px, 18 buttons < 44 px. At 1440×900: 0.45, headline 15 px, 9 buttons < 24 px | P2 (BUG-012) | metrics |
| Cockpit: critical alert | CRITICAL appears as (a) a 345×39 px banner in the left panel, (b) a red-bordered tile in the lower-right quadrant, (c) a toast that overlaps the media widget (BUG-008). Nothing takes the centre of the screen and the map stays dominant. For an in-vehicle HMI, a critical child-left-behind alert should be the largest element on screen (full-width interrupt or modal sheet with one primary action) | P2 | `evidence/sc-child-hot/01-alarm-viewport.png` |
| Cockpit: tile | Good: counts show "—" not "0" when no frame was inspected; image age is shown; SR-01 caution line shown with SAFE. The "why" line is wrong for blocked camera / no frame yet (BUG-010) | P2 | `evidence/matrix/CS-blocked/final.png` |
| Cockpit: colour only? | Tone is backed by text (Nguy hiểm / Cảnh báo / Chưa thể xác minh) and icons; status is not conveyed by colour alone. PASS | — | |
| Cockpit: left panel | "Phanh tay" + "Giữ phanh" duplicated (BUG-029); "TÚI KHÍ chưa có dữ liệu" honest but 9–10 px at demo scale | P3 | baseline |
| Cockpit: top-view labels | Part labels 93×30 px at 1920 (≈ 150×48 px at full scale), readable; state change text "Mở/Đóng" plus aria-label. PASS | — | controls VC-02..08 |
| Cockpit: lock button | Says "MÔ PHỎNG" in a toast, never actuates. Good honesty, but a "Khoá cửa" button that does nothing may confuse; consider renaming it "Khoá (mô phỏng)" | P3 | VC-09 |
| Cockpit: bottom bar | Set-temperature label "A/C ON · ĐẶT" clarifies setpoint versus measurement. PASS. Clamp 15–28 °C | — | VC-12..14 |
| Panels | Consistent glass panel, ✕ top-right, 260 ms slide-in. Escape and Home close. Focus does not move in (BUG-018). Map search swallows Escape (BUG-031) | P2/P3 | |
| Car Mode | Clear "does / does not" columns per mode, which is excellent for honesty. Wash mode blocks with the reason ("1 chưa đóng · Cửa đang mở"). The "Chỉ giám sát" badge for Bé is good. Pet name input is limited to 16 chars | — | `evidence/controls/carmode-*.png` |
| Settings | 10 categories, all open; units switch converts setpoints (21.5 °C → 70.7 °F); brightness dims the artboard. Read-only safety rows explain why they are not editable (thresholds per §5.4). PASS | — | settings-*.png |
| Toasts | Info toasts dedupe (10 taps → 1 toast) and expire (< 9 s). Critical toast has a transparent background (BUG-008) | P2 | TS-01..03 |
| Phone | Clear verdict card; "Không coi là an toàn" for no data is excellent. Problems: "BÌNH THƯỜNG" for SAFE (BUG-005), raw enums "NO_FEED" (BUG-022), countdown pill floating under the action row (BUG-009), two stacked toasts at incident start (BUG-027), active-tab contrast 1.46:1 (BUG-025) | P1–P3 | `evidence/alarm-prompts/phone-zoom.png` |
| Phone: "Gọi 112" | A large red real `tel:112` link right next to "Đã xem". In a demo frame that judges click freely, a mis-tap on a phone or tablet would dial emergency services. Suggest a confirmation step or disabling it in the hosted demo ("Gọi 112 · mô phỏng") | P2 (UX safety) | phone-zoom |
| Folds | Summaries are informative ("Revision 2 · Không xác minh được · dữ liệu đã cũ · đang kết nối"). Charts carry honest notes ("không phải độ chính xác") | — | `evidence/controls/trace-offline.png` |

## 3. Spacing, alignment, typography

- No horizontal overflow at any tested width (`docW ≤ vw` everywhere).
- No text clipping in demo-page buttons or flow steps at ≥ 1024 px (`clippedTextEls = 0`).
- At 390 px the flow bar scrolls horizontally inside its card, with step 3 cut at the edge and no scroll affordance (P3).
- The design-system audit scripts already in the repo (`e2e-browser/vinfast/audit3.mjs`, `nest.mjs`, `squeeze.mjs`) target a local dev server and were not re-run against production.
- Border radii and shadows are consistent across panels, cards and chips on the screenshots inspected; no misaligned icon/label pairs were found in the quick controls or launcher.

## 4. Automotive HMI checklist

| Question | Result |
|---|---|
| Main safety status identifiable immediately? | **Partly.** The demo page yes (flow bar + tile). On the cockpit the CabinSentinel tile is one of six widgets and is not in the primary visual position; at 1366×768 it is below the fold |
| Selected vehicle obvious? | Single vehicle ("VinFast VF 8 · MÔ PHỎNG" on the phone, "Chủ xe" on the cockpit). N/A for multi-vehicle |
| Safety-critical alerts visually dominant? | **No** (see §2, critical alert row) |
| Actionable versus informational distinguishable? | Mostly. Exceptions: the gear P-R-N-D and speed look tappable but are display-only (they correctly have no button role); "Chưa tích hợp" tiles look identical to live apps until tapped (they carry a badge) |
| Frequently used functions easy to find? | Yes: launcher, quick controls and bottom bar mirror the VinFast layout |
| Dangerous operations confirmed? | Resolve needs 3 checklist ticks and a server check (good). "Gọi 112" has **no** confirmation (see §2). Unlock is not offered on the cockpit (good) |
| System state visible without navigating? | Yes for risk; incident ack state only in the cabin panel or phone |
| Easy recovery from mistakes? | Escape, Home and ✕ all close panels; "Đặt lại" restores a clean session. Fullscreen view has no back control (BUG-028) |
| Critical interactions minimised while driving? | Map text entry is disabled while moving (verified). Other panels stay fully interactive while driving |
| Touch targets for in-vehicle use? | At native 1920×1080 (fullscreen) the smallest cockpit button is 48 px (PASS). At demo-page scale they drop to 20–30 px |
| States communicated beyond colour? | Yes: text + icon + tone |

## 5. Animation

- With `prefers-reduced-motion: reduce`: 0 running Web Animations; the concept video does not autoplay (`videosAutoplaying 0`). PASS.
- Normal motion: panel open about 260 ms; median overlay open latency **45 ms**, max 126 ms over 40 toggles (measured, Chrome). No flicker observed in screenshots. The critical banner/tile render with no animation delay (by design: "never delays an alert").
- The `Khẩn cấp` hazard pill uses a blink class (only shown with hazard on); keep it under 3 Hz.

## 6. First-time-user (judge) walkthrough

What I did as a first-time visitor on a 1440×900 laptop in Chrome, with no instructions:

1. **Landing.** I read "thử luồng cảnh báo trên xe và điện thoại" and the disclaimer. Clear. The car screen is small (0.45 scale) but readable. The tile says "Chưa thể xác minh cabin", which is slightly alarming for an idle state; the phone says "Không coi là an toàn". **Confusion 1:** the app looks broken before I have pressed anything. Suggest an idle hint on the tile: "Chưa có hình · bấm một kịch bản".
2. **Pressed "Trẻ trong xe, xe nóng".** About 2 s later the flow bar ticks 4 steps, the tile turns red "Nguy hiểm", the phone shows "Nghiêm trọng". Strong moment. **Confusion 2:** the red toast overlaps the music widget and is hard to read (BUG-008); two phone toasts stack (BUG-027); the "Cabin Care tự bật sau 85s" pill appears with no explanation of what will happen.
3. **Next action?** The flow bar step 6 says 'Bấm "Đã xem" trên điện thoại'. I found it. The incident stays open (correct and explained).
4. **Close the incident.** "Xử lý ngay" → tick 3 boxes → "Gửi xác nhận" → **rejected: "Sự cố đã thay đổi… xác nhận lần nữa"** (observed once; the backend refuses resolve while a person is visible, so any retry with the child clip running is also refused by design). **Blocker:** nothing tells me I must first make the cabin look empty (press "Cabin trống" or pick the empty clip in the hidden "Môi trường giả lập" fold). A judge will likely conclude resolve is broken. The rejection reason is also misleading (BUG-011).
5. **Waited instead.** After 90 s Cabin Care starts by itself (BUG-006) and the level drops to "Cảnh báo". **Confusion 3:** why did it get *less* dangerous with the child still inside? The UI doesn't explain that the simulated A/C cooled the cabin.
6. **Tried other scenarios.** "Camera bị che" gives grey "Chưa thể xác minh cabin", but the reason line says "Ảnh gần nhất đã hết hiệu lực" instead of "camera bị che" (BUG-010). "Mất kết nối" shows "Dữ liệu cũ · Nguy hiểm", which is very good.
7. **Explored the sim panel**, picked "Trẻ ngồi ghế an toàn quay lưng" in a hot car: the cockpit reads "Chưa thấy nguy cơ" and the phone "BÌNH THƯỜNG" (BUG-001/BUG-005). As a judge I would score this as "the product misses the core case". The explanation exists only in the offline-trace fold note.

**Proposed UX improvements, in order of judge impact:**
1. After an alert, add a guided "Bước tiếp: bấm Cabin trống (giả lập bé đã được bế ra), rồi xác nhận trên điện thoại" hint to flow step 7, or a "Bé đã được đưa ra" scenario button that switches to the empty clip.
2. Make the critical alert a full-width interrupt on the cockpit with an opaque background.
3. Align the phone's wording with the cockpit; translate raw enums.
4. Mark the rear-facing clip in the UI as a known detector miss ("SR-01: model gốc bỏ sót ca này") and add the hot-car fallback rule.
5. Default the demo page to fit 1366×768, or auto-suggest the fullscreen view.
