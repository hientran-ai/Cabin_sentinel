# AGENT_HANDOFF: cockpit HMI redesign (SU7-inspired), 2026-10-16

**Task.** Redesign the in-car screen of `apps/cockpit-web` (worktree `oem-e2e`, branch `feat/oem-e2e-v1`, uncommitted).
First pass followed the HMI prompt (charcoal theme, left overview, right panels); mid-task the user asked to apply the
Xiaomi SU7 HMI from their reference images. Final direction = SU7 framework, our own CabinSentinel styling, no logo,
no Chinese text, no claim of being an official interface.

**Decisions used (user):** SU7 HMI framework (2026-10-16, chat) supersedes "vehicle overview fixed on the left" from
the earlier prompt. Phone stays Cabin Noir. Pipeline, API, store, thresholds, TTL, actions unchanged.

## What changed (frontend only)
| Area | Before | After |
|---|---|---|
| Status bar | 56 px, battery / lock / clock / temp spread out | 48 px (3 rem): profile · range bar + % · P R N D · lock … SIM tag · outside temp · bell · clock |
| Home, parked (P, 0 km/h) | 40 % vehicle column + map | full scene (night sky to horizon) with the car, clock + date top-left, cabin status chip bottom-left |
| Home, driving | same as parked | three panes: vehicle (speed + chase view) · map · music. Pane handle `•••` widens a pane to 2/3 |
| Dock | three grouped cards, climate in the middle | one bar: home · driver temp ‹ › · vehicle / cabin / camera / apps · mini player · passenger temp ‹ › · volume |
| Panels | modal sheets with backdrop over everything | one panel fills the content area; status bar and dock stay; close button top-right |
| Settings | small tabs | title "Cài đặt", category column with outlined active item, 72 px rows, neutral segmented controls |
| Cabin monitor | photo + 4 small cards with revision/model | status headline, one sentence, five rows (occupant, cabin temp, camera, image age, incident), adult camp-mode action, "Chi tiết kỹ thuật" disclosure (revision, rule, detections, model, latency), blurred last frame or neutral cabin outline with no seat marked |
| Cabin Care | balloons, emoji, pink gradient, "bố mẹ đang quay lại", "mình ổn" | same type and surfaces as the cockpit; copy states only facts: alert sent, set point, measured temperature, track |
| Notifications | centred, stacked | top-right, one cabin toast at a time, hidden while the cabin panel is open |
| Type | body 19 px | body 23 px, secondary 18–20 px, titles 28–34 px, values 64–67 px at 1920×1080 (targets, not a compliance claim) |
| Vehicle labels | bubbles always on | only when something is open, or unlocked while parked |

Paint colours, camera angle and the 3D model credit (CC-BY) moved to Cài đặt › Hiển thị.
`?view=cockpit` shows the car screen alone on the live session; `?debug=1` exposes test hooks only.

## Files
`src/styles/index.css`, `src/components/automotive/{AutomotiveDashboard,BottomControlBar,TopStatusBar,Desktop(new),ui}.tsx`,
`vehicle/{VehiclePanel,Vehicle3D}.tsx`, `media/MediaPlayer.tsx`, `navigation/NavigationMap.tsx`, `settings/VehicleSettings.tsx`,
`climate/ClimateOverlay.tsx`, `camera/CameraPanel.tsx`, `launcher/AppLauncher.tsx`, `notifications/NotificationLayer.tsx`,
`src/e2e/{CockpitCabin,CabinCareScreen,E2ePage,store}.tsx|ts`, `src/main.tsx`, `e2e-browser/{run.mjs,hmi-steps.json,page-steps.json}`.

## Verified (headless Chrome, live backend + real YOLOv8n, local only)
- 1920×1080, 1600×900, 1280×720 with `?view=cockpit`: parked, settings, display tab, parked CRITICAL, cabin CRITICAL,
  camera blocked → ERROR, sources stopped → stale (decision_current false, shown as "Không xác minh được", never safe),
  driving three panes, map widened to 2/3, Cabin Care child active. Evidence: `docs/evidence-hmi-2026-10-16/`.
- Demo page 1920×1080 with the Cabin Noir phone: CRITICAL on both.
- `tsc` clean, vitest 21/21, `npm run build:web` OK. Backend untouched (last run 337 passed).

## Not verified / limits
- Visual review is mine only; no user or OEM review. Not checked on a real car display or touch hardware.
- In the demo page the cockpit is scaled to its column (≈ 0.77 at 1920 wide), so text is ≈ 18 px body there;
  use `?view=cockpit` for full size.
- The 3D body is a generic CC-BY concept car, not a VinFast/Xiaomi model. Driving "SR" pane shows our car only,
  no road or object rendering (we have no perception data for that).
- Pane swap by long-press drag and three-finger gestures from the SU7 references were not implemented.
- Dark theme tuned; light theme and the Tesla mode keep older tokens.

**Next owner:** FRONTEND_AGENT (visual QA on target display), PO for design sign-off.

## Update 2026-10-16 (later): clone of the "Xiaomi SU7 Free UIkit" Figma
Source: Figma community file 1357206881312579528 by Jackywine, **CC BY 4.0** (credit required; kept in this doc and the
code comments). Read in the user's logged-in Figma (a draft copy "Xiaomi SU7 Free UIkit (Community)" now exists in their
drafts, plus one they made themselves). Values were read from the file's node tree (sizes, radii, colours, font sizes).
Only Slide 16:9-2/6 (home) is high fidelity; the other 10 frames are grey wireframes (settings, music, map), cloned as layouts.
- Canvas is now 1920×1200 (16:10) like the kit (`COCKPIT_H` 75 rem, root font 100vh/75).
- Home: three 592×1000 panes, 36 px gaps, radius 24, `•••` handles, splitter bars (drag or tap to widen to 2/3);
  vehicle pane (top view, nose up), map pane (black search bar 520×100, exit button 120×100), music pane (379 px cover, 48/24 px text).
- Status bar 100 px (time 39 px, range bar green #45F642, PRND), dock 100 px (home · temp 42 px with ° at 30 % · four app icons · now playing · temp · volume).
- New layers: quick-control centre (pull down from left = driver/whole car, right = passenger), full music page, full map page,
  app list with coloured icons, settings with 66 px category icons and the car on the right.
- Not copied: Xiaomi photos/album art/app icons/MiSans font file (we fall back to system fonts), Chinese text.
Evidence: `docs/evidence-hmi-2026-10-16/su7kit-1920x1200-*.png`. Car paint: smooth clearcoat (was a noisy flake normal map).

## Update 2026-10-16 (v3): brand book, MiSans, motion, softer surfaces
Sources read: Behance "Xiaomi SU7 Concept Brand Book" (Ivan Inozemtsev; fan concept, not Xiaomi official) for the palette
(Blue #08A9BD, Green #7D8369, Basalt #939290, Purple #766680, Dark Blue #364562, Meteor #3A5372, Lava #CD3E12, Pearl #B3B8BC,
Diamond #232531) and the font (MiSans Latin); Pinterest pin 857654322817188815 (Xiaomi HyperOS video: parked desktop with
twinkling stars, clock/date top-left, car centred, 5-icon dock) and the basic-layout reference (P = parked desktop, driving = 3 panes).
- Font: official MiSans Latin (5 weights, woff2, 330 KB) from hyperos.mi.com, copied unmodified to `public/fonts/misans/` with `NOTICE.txt`.
  Vietnamese glyphs checked (none missing). Owner approved local + deploy use (2026-10-16). License still requires the statement
  "MiSans Fonts used" — add it to the product About page before a public deploy; files must not be offered for separate download
  (the deployed site serves them as web-font assets: owner accepted this risk).
- Tokens: brand palette as CSS vars (`--su-*`), numerals weight 200, labels 500 uppercase tracked, radii 24/20/16/12, hairlines.
- Surfaces: translucent gradients + faint top light + hairline instead of flat fills; squircle app icons (28 %); glass on control centre, search bar, toasts.
- Motion (`src/lib/motion.ts`): springs — layout 320/34, pages 260/30, tap 700/28 — pane widening animates flex-grow, desktop
  cross-fade parked↔driving with scale+blur, sheets/control centre/toasts spring in, dock icons lift/press, temperature digits roll.
  **Xiaomi publishes no spring values for the car UI**; values are tuned by eye against the screen recording and are NOT Xiaomi's.
  Reduced-motion is respected (MotionConfig + CSS).
- Parked scene restored: dusk gradient, 46 twinkling stars, clock/date (Vietnamese), cabin status chip.
Limits: no frame-by-frame measurement of Xiaomi's animation timing was possible (video is 5.9 s, 480×640, compressed);
"smooth like the original" is not verified against the real car; MiSans tracking/line-height set by eye from the brand-book page.
Evidence: `docs/evidence-hmi-2026-10-16/su7kit-v3-*.png`.

## Update 2026-10-16 (v4): refinement against the review prompt
Reference images "ảnh đầu" and the SU7 set were not re-attached in the final prompt; the "before" is the running v3 screen.
Layout (1920×1200 @16 px root): top bar 84, dock 96, outer margin 24, panel gap 24, radius 24. Three zones keep: vehicle | map | music.
- **Map mode**: menu "•••" → "Mở rộng 2/3"; vehicle 1/3, map 2/3, music folds into the dock; visible "Về ba vùng" button. Resize by menu, by
  dragging the splitter (> 40 px snaps to 2/3) — no multi-finger gestures. "•••" menu rows all work (widen, back to thirds, full screen).
  State `paneWide` lives in uiStore so the dock knows whether the music panel is open.
- **Vehicle**: speed 80 px / unit 21 px, weight 500; car ≈ 48 % of pane height (top view); calmer paint (metal .5, rough .38, clearcoat .8, env .95).
  Cabin strip: label "Giám sát cabin", main message, short cause, chevron to details. Stale → "Chưa thể xác minh cabin / Ảnh gần nhất đã hết
  hiệu lực" (from `view.kind`, not invented). SAFE tone is neutral grey, never green/tick. No lanes, cars, doors or seats added.
- **Map**: road names only for motorway/trunk/primary/secondary from zoom 15, places city/town/suburb only; search bar 68 px, "Nhà" and
  "Văn phòng" are labelled chips; attribution kept; no route/ETA invented.
- **Music**: graphite panel with faint artwork tint, artwork 52 % of width, title 35 px, secondary 21 px, header 22 px; one centred group
  (header → artwork → name/source → playback); radio shows "Trực tiếp", no progress; progress only for non-radio; shuffle removed (not implemented);
  simulated-audio note wraps fully. Dock mini-player: compact (play only) when the music panel is open (music page, or 3-zone mode with music visible), full otherwise; same store.
- **Status bar/dock**: time quieter than range and gear; tabular numerals; dock order Home | A/C left | apps | media | A/C right | volume; A/C temps
  labelled "Đặt" (set point; measured cabin temperature is shown only in the cabin panel). CabinSentinel icon = neutral graphite "scan" glyph
  with a red/amber dot only while the backend reports critical/warning.
- **Visual system**: palette bg #0D0F12 / panel #181B20 / control #252A32 / text #F4F6F8 / secondary #B4BBC5 / accent #4B8DFF; MiSans Latin 400/500/600
  (numerals no longer ultralight); transitions 160–220 ms ease-out; **no looping animation** (stars static, music background static); reduced motion respected.
Verified (headless Chrome, live backend, real YOLOv8n): 4 viewports (1920×1200, 1920×1080, 1600×900, 1280×720; 16:10 canvas is letter-boxed, not stretched):
parked, 3 zones, map expanded, cabin missing, CRITICAL from backend, cabin critical, cabin stale, settings, demo page with phone.
- Touch targets at 1920×1200: every cockpit button ≥ 56×56 (script). At 1280×720 the screen is scaled by 0.6, so targets are ≈ 34 CSS px — design target
  only; a real car display is judged by physical size, not verified.
- Text clipping: none found (script, 2 viewports). Contrast measured on screenshot pixels: lowest 5.3:1 (simulated-audio note), body/title 7–16:1.
- tsc clean, vitest 21/21, build:web OK, backend pytest 337 passed / 3 skipped (unchanged).
Not verified: real vehicle display, glare/night use, color-blind review, screen-reader pass, long-run memory of the 3D canvas, a second reviewer.
Known gaps: the parked scene vs three-zone switch is driven by gear P and speed < 0.5 (my earlier layout choice from the SU7 reference, not a safety
policy); interaction limits while driving remain as they were (none added). 3D car is still a generic concept car. Evidence: `docs/evidence-hmi-2026-10-16/v4/`.

## Update 2026-10-16 (v5): car grounded, ADAS illustration, twilight gradients, glass
**Root cause of the floating car (reproduced by measurement, not guessed):** the old scene had no ground plane; the horizon was a CSS
gradient behind a transparent canvas; the car was only lifted 0 (+ a ≤0.06 m intro offset per frame) and the 4 tyres bottomed at
y = −0.141 / −0.159 / −0.108 / −0.151 m (up to 5 cm under the "floor", spread 5 cm) with the footprint centre 0.238 m off the orbit
pivot; `OrbitControls` also let the camera go to polar 0.15…π/2.05 around target y 0.55 while the "horizon" stayed fixed on screen.
**Fix** (`GlbCar.tsx`, `StudioScene.tsx`, `Vehicle3D.tsx`): footprint measured once from the 4 tyres' real vertices at rest → car offset
(−centreX, −minY, −centreZ); no per-frame bounding box, no intro bobbing, doors/wheels cannot move it. Real ground disc, sky dome and fog share
colours so horizon = camera horizon; key light casts a real soft shadow + a footprint-sized contact patch on the ground; orbit pivot at
footprint centre (target y 1.5), horizontal drag = camera orbit only (no model yaw → no double rotation), vertical drag = camera
height within polar 0.1…π/2+0.1 (camera y ≥ 0.65 m), zoom 5.5–11 m, pan off, damping off (no drift), reset button (bottom-right of the car pane).
Measured (headless Chrome, real pointer-event drags): wheel min-Y 0.0000…0.0015 m and footprint centre (0.000, 0.000) in every
state — start, 500 px drag right, 900 px left, drag to both vertical limits, 10 random drags, doors+hood+hatch opened and closed, 0.8 s after release
(0 control "change" events → no drift). Default parked view: horizon 49 % of scene height, tyre contact ≈ 78–84 %.
**ADAS illustration** (`adasFixture.ts`, `StudioScene.tsx`): static fixture, 2 converging lane lines, pale cyan strip, 2 distant silhouettes, ego car
from behind-above, label "ADAS minh họa · Mô phỏng". Not connected to YOLO, risk, telemetry or actions; no distances, no confidence, no "Autopilot",
no animation. Shown in the vehicle pane of the 2- and 3-zone layouts; parked scene and settings keep the free-orbit studio car.
**Gradients**: sky midnight → slate → lavender at the horizon (dithered, no banding), ground blue-grey pool → charcoal, ADAS petrol/cyan, music plum/indigo.
Stars removed. No animated gradient, no bloom.
**Glass** (`styles/index.css`): `.su-glass` = backdrop blur 28 px + saturate 1.18, black tint .56, white 13 % border, top highlight, soft shadow; `.su-glass-lite`
for lighter surfaces; alerts use solid `.su-alert-critical/-warning`. Applied to search bar, pane menu, quick controls, cabin strip, toasts. Fallbacks: no
`backdrop-filter` support, `prefers-reduced-transparency`, and a manual `html[data-glass="off"]`. No blur on the 3D canvas, ADAS road or map. No light theme exists, so no white-glass variant.
Checks: tsc, vitest 21/21, build:web OK; 58 fps parked and 57.7 fps in 3-zone (headless Chrome, Apple GPU, 1920×1200, dpr 1; 341 draw calls, 633 k triangles) — NOT a car SoC measurement.
Contrast measured on pixels: lowest 6.6:1 for text on the glass strip against its brightest background; others 6.7–17.5:1.
Evidence: `docs/evidence-hmi-2026-10-16/v5/` (before/after orbit angles, 3 viewports, `orbit-sweep.gif`, `glass-on-vs-off.png`).
Not done / limits: light theme glass (no light theme), a real video file (GIF of 24 frames instead), a second device/GPU, low-power GPU fallback beyond dpr cap 2,
reduced-motion has nothing 3D to reduce (no autonomous motion; the camera ease on view change snaps when reduced motion is set).
The generic concept-car model (CC-BY, Khronos) is still the car; `CustomCar` path was not changed to the same ground logic — a downloaded model needs `measureFootprint`-style grounding (CustomCar already puts the lowest point on y=0 and centres the bounding box once).

## Update 2026-10-16 (v6): exact visual spec

Spec: `/Users/mac/BUILD_PHASE/docs/HMI_V6_EXACT_VISUAL_SPEC_VI_2026-10-16.md`. Acceptance table with target / measured / PASS-FAIL / evidence: `docs/evidence-hmi-2026-10-16/v6/ACCEPTANCE_V6.md` (screenshots, GIF clip, measurement JSON next to it).

- **Tokens and layout**: 1 rem = 16 px, breakpoint at viewport W 1600 (status 72/56, dock 96/80, margins, gaps, radii, 56 px touch targets, typography roles, fixed glass). `?view=cockpit` now renders the cockpit at the window size with no scaling, which is the spec's own viewport. The demo page (car + phone) still scales the cockpit to sit next to the phone.
- **3D**: `vehicle/studioCamera.ts` solves the default camera from the real car vertices (footprint 57%/82%, width 52%, horizon 50%, card clearance). `StudioScene.tsx` paints sky/ground as a screen-space gradient anchored to the camera's true horizon, the ground only receives the real shadow, lights follow the spec preset scaled by L. ACESFilmic exposure 1.0, IBL 0.5, shadow 2048 bias -0.0001. No blob shadow, fog, stars. Model materials restored (only the Paint normal/roughness maps are dropped).
- **Constraint conflicts reported, not hidden**: the horizon/footprint targets need polar at the 82 deg limit, target 0.09-0.10L and a lens shift (setViewOffset, not in the spec); at 1280x720 the width uses its tolerance (50.8%) to keep 16 px from the cabin card. Proposals are in ACCEPTANCE_V6.md.
- **Also fixed while measuring**: speed weight 400 to 500, title role overrides, search box 34 px wide at 1280, text on the light accent (white 2:1 to dark 8.7:1), chip/unit contrast, notification badge, camera tag on pale sky, music page overflow at 1280.
- **Measurement scripts**: `e2e-browser/v6-*.json`, `v6-lib.js`, `v6-styles.js` (run with `node run.mjs <w> <h> <url> <steps.json>`; `resize` step added).
- **Verified**: tsc clean, vitest 26/26, cockpit build, pytest 337 passed / 3 skipped. Perf 3 x 30 s after 5 s warm-up: median 59.9 fps, p95 16.7-16.8 ms (headless Chrome on an M1 Pro: not vehicle hardware). Only the parked scene was measured with that procedure.
- **Not done**: no commit/push; "MiSans used" notice before public deploy; badge contrast not re-measured; ADAS camera is outside the spec (kept).

AGENT_HANDOFF FRONTEND_AGENT to REVIEW_AGENT / owner: decide the two conflict proposals (lens shift + polar interval, or a 33% horizon), then re-measure with `v6-geom.json`. INTEGRATION and HARDWARE are NOT_VERIFIED.

**Cập nhật cùng ngày (quyết định chủ dự án):** chấp nhận lens shift, nâng polar tối đa 82° → 86° (spec §7 sửa). Camera cuối: polar 82.5/83/82.5°, target 0.12/0.12/0.10L, khoảng cách 1.639/1.458/1.439L, lens shift (+7.0%, +20.6/19.2/21.2%). Chân trời 49.7/49.7/50.3%, footprint (57,82)%, ground contact 0.00034L, perf 3×30 s median 59.9 fps. Chỉ còn xung đột 2 (độ rộng 50.8% ở 1280×720) và ghi nhận ground material.
