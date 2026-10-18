# CabinSentinel — 8 demo videos (integration pack)

All 8 user-provided MP4 files have been copied to ASCII-safe paths, with posters and a scenario manifest. Clips are 1280×720, around 10 seconds, H.264 + AAC. This archive is NOT yet integrated/deployed in any CabinSentinel repository.

## Import
- Copy `videos/` and `posters/` into the existing Cockpit public demo asset location (inspect actual code).
- Import `scenario_manifest.json` as a draft manifest; adapt its shape to existing API contract.
- Add an accessible Demo Scenario selector and a single `startScenario` method.
- On scenario switch, stop old media/streams, close unresolved *test* state only through an explicit reset of demo session, re-init context fixture, play selected video, and let the REAL model process frames.
- Test key states using real model output. Manual visual observations are for evaluation only, not labels to feed to frontend as if the model detected them.
- Render `DEMO VIDEO` and `SIMULATED SENSOR DATA` badges.
- Do not infer temperatures, door status, driving status, or ownership from pixels.
- Don't use negative detections as proof of safe cabin.
- Provide compatible WebM alternative or robust decode error/fallback and test Chrome, Chromium and WebKit.
- Keep these test videos only in DEMO environment, not permanent background monitoring; confirm rights/consent for footage showing recognizable people.

## Media / compatibility
Videos are H.264 MP4. For Playwright Chromium without H.264 decode support, transcode a WebM copy while keeping source frames: `ffmpeg -i input.mp4 -an -c:v libvpx-vp9 -b:v 1300k -deadline realtime -cpu-used 5 output.webm` (verify visual/detection equivalence). A poster is a preview, not a substitute for AI inference.

## Missing scenarios still needed
Standalone rear-facing child, pet alone, adult sleeping/camping, camera fully offline (not just obscured), sensor contradiction, and disconnect/reconnect should be added as fixtures or separate recordings.
