# Motion detection

Enable foreground motion alongside YOLO and age classification:

```powershell
.venv\Scripts\python.exe scripts/run_vision.py --source data/videos/cabin_test.mp4 --classifier runs/age-three-class/best.pt --motion --output eval/cabin-motion-new.jsonl
```

No model training or additional dataset is required. `src/vision/motion.py` uses
OpenCV MOG2, removes shadow pixels, filters noise and small connected regions.
It expects a fixed camera. YOLO continues to run on every frame, including frames
without motion, so stationary occupants are not deliberately skipped.

Frame records gain `motion` (status, foreground ratio, regions, has_motion) and
`motion_latency_ms`. Each detected object gains `motion_ratio` and `moving`,
measured inside its current bounding box. These fields also apply to animals.
Regions use original-image pixel coordinates, [x1, y1, x2, y2], exclusive upper
bounds. The ratio counts foreground pixels, not the entire enclosing rectangle.

Defaults: `--motion-warmup 30`, `--motion-min-area-ratio 0.001` (minimum component
area divided by frame area), `--moving-threshold 0.02` (foreground fraction inside
an object box). Warmup uses source frame count, not CPU processing time. Warmup
frames and frames with more than 65% global foreground report null decisions;
null does not mean stationary. Resolution changes reset background learning.

Motion processing is downscaled to at most `--motion-width 640` pixels wide to
limit CPU cost on 4K input. Region boxes and masks are mapped back to source
coordinates; region `area_ratio` is measured on the processing image. Small
movements can disappear when downscaled; adjust width and thresholds using your
camera clips. This resizing does not change YOLO or age-classifier input.

Foreground change is only an approximation of motion: camera shake, light changes
and background objects can cause false positives, and slowly moving/stationary
objects may be absorbed into the adaptive background. `moving: false` means the
configured foreground threshold was not reached; it does not establish sleep,
breathing or wellbeing. No tracking IDs or duration-based alerts are implemented.

For tuning/accuracy evaluation, use fixed-camera cabin clips with stationary
occupants, small movements, an empty cabin, lighting changes and vibration,
plus labeled time intervals of visible motion/no motion. The existing cabin video
can verify execution, but lacks reviewed motion ground truth.
