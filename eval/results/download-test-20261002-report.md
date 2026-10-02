# New cabin video test — 2026-10-02

Source: `C:/Users/ADMIN/Downloads/1790950663757_65777578124380071_1090892326643188333.mp4`.
576x352, 320 frames, nominal 23.925 FPS, approximately 13.4 seconds.
YOLOv8s, image size 640, confidence 0.4, NMS IoU 0.5, CPU/four PyTorch threads.
Age classification was not enabled; this tests person detection only.

Completed all 320 source frames. The final person-overlay H.264 MP4 was decoded
and verified to contain all 320 frames. Detected faces are blurred; exported
video has no audio. The source file was not changed.

- 310 frames had at least one detection; 10 had none.
- Boxes per frame: 0 on 10 frames, 1 on 137, 2 on 167, 3 on 6.
- Total 489 boxes across frames, not unique people.
- Detector assembly mean 134.71 ms; p95 167.74 ms.
- Processing including privacy/export: 6.19 FPS; source playback is 23.925 FPS.

Visual inspection of frames 1, 40, 80, 120, 160, 200, 240, 280, 320 and frame
65 confirms incomplete detection on this different video:

- The rear-seat child is missed at frames 1 and 320, although visible.
- At frame 120 (about 4.97 s), no person is detected; the child is partly hidden
  behind the headrest and the adult is partly outside the right image edge.
- No-detection frame IDs: 120 and 122–130.
- The partially cropped adult is missed at inspected frames 40 and 200.
- Frame 65 has a duplicate pair of adult boxes. Three-box frames are
  65, 71, 74, 75, 93, 99; only frame 65 was inspected individually for duplication.

This is not an accuracy percentage: no independently reviewed frame-by-frame
ground truth exists for the new clip. The earlier 96.97% precision/100% recall
on the first clip must not be applied to this video. The current configuration
still misses small/occluded people and permits duplicates.

Outputs:

- `data/videos/download-test-20261002-people.mp4`: person boxes and detected-face blur.
- `data/download-test-20261002/detection-contact.jpg`: nine sampled output frames.
- `eval/download-test-20261002.jsonl`: per-frame predictions and face masks.
- `eval/download-test-20261002.summary.json`: completion and performance summary.

Next tuning evidence should include separately labeled child/adult boxes on this
camera angle, comparisons of confidence thresholds and input sizes, and tests
for duplicate suppression. Keep an independent recording for final validation.
