# Motion integration smoke test ? 2026-10-02

Final implementation: OpenCV MOG2 with shadow removal, morphological filtering,
minimum component area and maximum processing width 640. YOLO and three-class
age classification run on every source frame.

Output: `eval/cabin-motion-scaled-20261002.jsonl` and its summary.
Verified all 266 sequential frames, 30 warmup frames with null motion decisions,
236 ready frames, valid pixel ratios, and moving decisions matching the configured
0.02 threshold. Per-frame age labels match the previous three-class video run.
All 236 ready frames contained foreground regions. This does not establish
motion-detection accuracy; the source video has no reviewed motion ground truth.

Object-box decisions across frames: {'None': 78, 'True': 560, 'False': 19}. These are not unique people
or tracked movement histories.

Motion mean latency: 70.99 ms; p95:
95.23 ms. End-to-end processing:
1.36 FPS (below source 25 FPS). Four PyTorch threads
were used. Another full-resolution experimental run overlapped this run, so
these timings are not a controlled performance comparison.

The earlier `cabin-motion-20261002` output is a full-resolution experiment;
use the scaled output above as evidence for current defaults.

Six motion tests and ten age/preparation tests passed; Ruff and diff checks passed.
More fixed-camera clips with labeled motion intervals are needed to measure
false positives/misses and tune thresholds for the actual camera.
