# Face blur smoke test ? 2026-10-02

Final output: `runs/privacy/cabin-face-blurred.mp4` (local ignored artifact).
Logs: `eval/cabin-face-blurred.jsonl` and `.summary.json`.

Verified 266/266 decoded MP4 frames, 1280x720, 25 FPS, matching source duration.
No audio is copied. Original-frame processing precedes face blurring; per-frame
age labels match the prior three-class run. Source video is not overwritten.

YuNet threshold 0.3, processing width 960, padding 25%, previous three-frame
mask retention. Strong smooth blur is applied to a separate frame copy.
Face detections across frames: 547.
Frames with no active mask: []. Counts do not represent unique people or
proof that every face was detected. Low confidence may blur non-face regions.

The initial 0.6-threshold experiment (`cabin-blurred-20261002`) missed some
profile/downward faces; the final output above uses 0.3. Manual sampled QA:
frames 1, 50, 100, 124, 157, 181, 231 and 266. Preview:
`runs/privacy/video-preview.jpg`. This sample is not a complete privacy audit;
review the entire video before external sharing. Missed faces can remain visible.

19 unit tests passed (3 privacy, 6 motion, 10 age/preparation), Ruff and diff
checks passed. The file is published only after exported-frame verification;
failed/interrupted encodes stay `.partial.mp4`.

Model source: https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet
Model SHA-256: 8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4
