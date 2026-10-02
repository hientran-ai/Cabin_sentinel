# Face blurring

```powershell
.venv\Scripts\python.exe scripts/run_vision.py --source data/videos/cabin_test.mp4 --classifier runs/age-three-class/best.pt --motion --mask-faces --video-output runs/privacy/cabin-blurred-new.mp4 --output eval/cabin-blurred-new.jsonl
```

The original source is preserved. YOLO, age classification and motion use the
original frame. Exported frames include age bounding boxes and motion labels.
Only child/adult appear as age labels; `?` marks an argmax label below the
decision threshold. These uncertain labels do not override the original JSON
decision (`person`/unknown). Animals and unavailable age scores are not age-labeled.
`src/vision/privacy.py` detects faces independently of YOLO person
boxes, pads their bounds by 10%, and applies strong smooth blur inside a feathered
oval on a frame copy. The soft oval edge follows the face without a rectangular
border or visible mosaic blocks.
Current detections replace overlapping historical positions so masks follow the
face without stacking old rectangles. Unmatched boxes remain masked for up to
three frames to reduce flicker on detection misses. This overlap matching is not
full motion tracking; rapid movement may leave temporary historical masks.

Default face-detection width is 960; export width is at most `--video-width 1280`.
The face confidence threshold (`--face-threshold`) is 0.3 to favor coverage of profile/occluded faces;
false positives may blur surrounding areas as well.
Frames preserve source FPS and duration, but the MP4 has no audio.
The final MP4 is H.264/yuv420p with faststart for browser/editor preview. Install
`requirements-vision.txt` to get the bundled FFmpeg encoder.
JSON boxes use original-frame coordinates. Privacy inference time is reported separately from
the existing detector/age/motion latency; processing FPS includes the frame loop
and intermediate export, excluding final H.264 conversion and verification.

YuNet local model: `data/models/face_detection_yunet_2023mar.onnx`.
Source: [OpenCV Zoo](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet).
SHA-256: `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`.
The source model is MIT licensed. To install on another machine, download the
model from the official repository; inference does not download automatically.

Output paths must be new. Encoding uses a `.partial.mp4` filename and publishes
the requested filename only after decoding and verifying every exported frame.
Failed/interrupted outputs may remain partial; they are not complete artifacts.
If face inference raises an error, processing stops instead of exporting that
frame without blurring. A detection miss does not raise an error, so profile,
occluded or small faces can remain visible. Blur does not guarantee anonymization;
review the exported video before sharing it.
