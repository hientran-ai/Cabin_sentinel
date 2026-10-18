# FEATURE_INVENTORY — CabinSentinel VinFast cockpit demo

- **Target:** https://c4-app-068.cabinsentinel-platform.workers.dev/cockpit/vinfast/ (audited 2026-10-17)
- **Build:** entry bundle `vinfast-DNzbu6dk.js`. This is byte-identical by hash to `apps/cockpit-web/dist` in worktree `oem-e2e` (branch `feat/cockpit-worker-backend`, HEAD `70b48aa`), so the source was read alongside the live app.
- **How the inventory was made:** a DOM enumeration of every interactive element on the page and inside the phone iframe (`scripts/discover.mjs` → `evidence/discovery/inventory.json`: 52 page elements and 7 phone elements on the home state), plus every overlay opened during the control run, plus reading the router and source.

## 1. Screens, routes and states

| ID | Screen / route | How reached | Notes |
|---|---|---|---|
| SCR-01 | Demo page `/cockpit/vinfast/` | direct URL | Header, scenario strip, 7-step flow bar, cockpit (scaled 1920×1080 artboard), revision chip, owner phone (iframe), 3 folds |
| SCR-02 | Fullscreen cockpit `?view=cockpit` | "Toàn màn hình xe" link | Cockpit only. It has no exit control; you go back with browser Back (BUG-028) |
| SCR-03 | Debug hooks `?debug=1` | URL | Exposes read-only stores to test runners; does not change the UI |
| SCR-04 | Aurora skin `?skin=aurora` | URL only | Alternate layout. **Not audited** (not reachable from the UI) |
| SCR-05 | Intro animation `?intro=1` | URL only | 2.1 s "V" animation with a skip button. Not linked from the UI |
| SCR-06 | Owner phone `/cockpit/phone/?frame=0` (iframe) | embedded | Cabin Noir owner app. Its `/v1` calls are answered by `e2e-bridge.js` from the parent page's backend state |
| PH-01 | Phone `#/home` | default | Verdict card, counts chips, incident card (Xử lý ngay / Đã xem / Gọi 112), seat map, tiles, "Làm mới dữ liệu" |
| PH-02 | Phone `#/incident/:id` | "Xử lý ngay" | Escalation plan, 3 checklist boxes, "Gửi xác nhận", rejection banner with "Yêu cầu dữ liệu mới" |
| PH-03 | Phone `#/history` | bottom tab "Lịch sử" | Incident list and event log from the session history |
| PH-04 | Phone bell sheet | bell button | Notification list. Opening it marks in-app delivery |

Cockpit overlays (`useUi.overlay`): `vehicle`, `climate`, `cabinset`, `carmode`, `cabin`, `camera`, `phone`, `media`, `library`, `map`. Exactly one is open at a time; Escape, Home or ✕ closes it.

Safety states shown (backend `risk_level` × freshness × link). The UI never computes risk itself:

| Backend / client condition | Cockpit tile headline | Tone | Phone kicker |
|---|---|---|---|
| no session | Chưa có phiên | unknown | — |
| session, no evaluation yet | Chưa có dữ liệu | unknown | CHƯA CÓ DỮ LIỆU MỚI / Không coi là an toàn |
| `SAFE` + current (`EMPTY_CABIN`) | Chưa thấy nguy cơ + SR-01 caution line | ok | **BÌNH THƯỜNG** (BUG-005) |
| `NOTICE` | Lưu ý | info | — |
| `WARNING` | Cảnh báo | warning | CẢNH BÁO |
| `CRITICAL` | Nguy hiểm | critical | NGHIÊM TRỌNG |
| `ERROR` or `decision_current=false` | Chưa thể xác minh cabin | unknown | CHƯA CÓ DỮ LIỆU MỚI / Không coi là an toàn |
| link lost (2 failed polls or >5 s without an answer) | "Dữ liệu cũ · <level>" | unknown | goes offline after ~10 s |

## 2. Demo page controls

| ID | Control | Type | Behaviour (source) |
|---|---|---|---|
| DP-C01 | Toàn màn hình xe | link | `?view=cockpit` |
| DP-C02 | Trẻ trong xe, xe nóng | scenario | Sets 40 °C, locked, P, A/C off; streams the `ai-child.mp4` clip at 1 fps to the real model |
| DP-C03 | Cabin trống | scenario | 25 °C; `empty-cabin.mp4` |
| DP-C04 | Camera bị che | scenario | 30 °C; posts a simulated `BLOCKED` camera status |
| DP-C05 | Mất kết nối | scenario | Child clip, then a client-side 15 s link cut after 4 s |
| DP-C06 | Camera máy | conditional | Shows "tắt ở bản trực tuyến" on the hosted build (no device camera). The consent dialog exists only on localhost |
| DP-C07 | Đặt lại | button | Stops the source, resets the vehicle, erases the old session, creates a new one |
| DP-C08 | Flow bar (7 steps) | status | Nguồn hình → Model → Quyết định đã lưu → Cảnh báo trên xe → Điện thoại nhận → Chủ xe đã xem → Đã kiểm tra cabin |
| DP-C09 | Fold "Môi trường giả lập" | disclosure | 2 temperature sliders; heat ×1/×10/×60; real weather (Hà Nội); gear P/R/N/D; engine, lock, driver, radar, A/C, A/C fault; vehicle mode (Không/Thú cưng/Cắm trại/Khởi động từ xa); 3 sample clips; image upload (JPEG/PNG); stop source; camera fault Bị che / Mất kết nối; messaging provider fail/restore; 15 s network cut |
| DP-C10 | Fold "Biểu đồ theo dõi" | disclosure + tabs | Live session tab (5 SVG charts); offline 14/10 bundle tab with 3 clip buttons |
| DP-C11 | Fold "Bằng chứng" | disclosure | Evidence grid; log download (.jsonl, .csv); clear log |

## 3. Cockpit controls (blue skin, default)

| ID | Area | Controls |
|---|---|---|
| CK-01 | IPC / left panel | Drive-mode button (cycles Tiết kiệm / Tiêu chuẩn / Thể thao), speed, P-R-N-D (display only), battery/range, airbag "chưa có dữ liệu" |
| CK-02 | Vehicle top view | 7 part labels: 4 doors, frunk, trunk, charge port (toggle, simulated) |
| CK-03 | Cabin banner | Status or alert line; tapping an alarm opens the cabin panel |
| CK-04 | Quick controls | Tổng quan, Khoá cửa (info only), Điều hòa, Sưởi ghế (popover Tắt/Thấp/Vừa/Cao, auto-close 6 s), CabinSentinel, CAR MODE |
| CK-05 | Map | Search (sheet, 7 demo places, typing disabled while driving), expand/collapse, recenter, zoom ±, north, 2D/3D, chargers, end route, OSRM route card |
| CK-06 | Media widget | Open player, previous, play/pause, next (simulated, no audio) |
| CK-07 | Launcher | Camera, Giám sát cabin, Điện thoại, Âm nhạc, Sạc/EV, Cài đặt |
| CK-08 | Cabin tile | CabinSentinel status, why line, image age, counts (trẻ em/người/thú cưng/đồ vật) |
| CK-09 | Top bar | Mode widget (opens Car Mode, or stops the active mode), "Mất kết nối máy chủ", owner chip |
| CK-10 | Bottom bar | Home, app library, driver/passenger set temperature ±0.5 (15–28 °C), climate panel (fan level), front/rear defrost |
| CK-11 | Toasts | Info, warning and critical toasts; ✕ to hide; swipe to dismiss; info toasts expire |

Overlay contents:

| ID | Overlay | Controls |
|---|---|---|
| OV-01 | Cài đặt (`vehicle`) | 10 categories: Trạng thái, Giám sát cabin, Màn hình (Hình nền / Hiển thị tabs: appearance, brightness, units), Ánh sáng (headlights, ambient hue wheel), Hỗ trợ lái (clips), Áp suất lốp, Xe (quick tiles, child lock, drive mode, regen), Âm thanh, Sạc (limit, port), Hệ thống |
| OV-02 | CabinSentinel settings (`cabinset`) | Per-class "show on main tile" switches, Cabin Care auto-start consent switch, read-only threshold/TTL/blur/unlock/model rows |
| OV-03 | Giám sát cabin (`cabin`) | Tabs Tổng quan / Cách hoạt động / Bằng chứng; concept video; counts; "Bật cắm trại" (only when backend `can_start`); "Trạng thái điện thoại chủ xe" |
| OV-04 | Chế độ xe (`carmode`) | 4 modes: Cắm trại (backend Cabin Care), Bé (monitor + "Dỗ bé"), Thú cưng (sim + backend), Rửa xe (blocked unless closed); music choices; fan level; pet name and kind |
| OV-05 | Điều hòa (`climate`) | Auto/manual, A/C, max cooling, recirculation, ION (sim), vents |
| OV-06 | Camera (`camera`) | Views; device camera disabled on the hosted build; opens automatically in gear R |
| OV-07 | Âm nhạc (`media`) | Source segments, station/track list, volume, mute |
| OV-08 | Thư viện (`library`) | 7 integrated apps and 9 "Chưa tích hợp" placeholders (info toast, no command) |
| OV-09 | Điện thoại (`phone`) | Phone-status feature screen |

## 4. Backend endpoints used (`/api/v1/e2e`)

`GET /status`, `POST /sessions`, `GET /sessions/:id/state | /notifications | /history?after=`, `POST /sensor` (every 2 s plus on change), `POST /observations` (multipart, 1 fps, 5 MB limit), `POST /camera-status`, `POST /notifications/:n/delivered`, `POST /acknowledge`, `POST /resolve` (revision-checked), `POST /care/{declare,start,stop,consent}`, `POST /faults`, `DELETE /sessions/:id`. Auth is a per-session bearer token stored in `sessionStorage`.

## 5. Features in the brief that do not exist (NOT IMPLEMENTED, not counted as FAIL)

- Multiple vehicles, vehicle switching, admin/family roles, login, session expiry UI. There is one demo vehicle and one owner role; the phone's restricted-role branches are unreachable.
- Real SMS, Telegram, push, calls, horn, unlock and ventilation. Every outbound action is `simulated` or `pending_human_confirmation` in the action ledger. "Gọi 112" is a plain `tel:` link and was **not** activated.
- Warning sound and mute for alerts (no alert audio; comfort audio only in Cabin Care).
- Left-behind object detection (CS-16). The counts show "Đồ vật: Chưa hỗ trợ" and the model's `items_tracking` is absent.
- Bounding-box overlay on the cockpit (detections are counts only; the image is blurred or replaced by a concept video).
- Device camera on the hosted build (disabled on purpose; local only).
- Child-vs-adult age labels on the hosted model (`age_group: unknown`; the age classifier is not enabled).
- Adult-only and pet-only image fixtures: the repo ships no adult or pet sample, so CS-02 and CS-04 could not be driven with real model input.
