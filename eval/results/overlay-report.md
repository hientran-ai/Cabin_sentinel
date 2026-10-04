# Age label overlay — 2026-10-02

Output: `runs/privacy/cabin-labeled.mp4`, H.264, 1280x720, 25 FPS, 266 verified
decoded frames. Face-blurred video from `cabin-face-blurred-h264.mp4` was annotated
using frame-aligned detections in `eval/cabin-face-blurred.jsonl`; no inference
was repeated and no labels were fabricated from visual appearance.

The exported label vocabulary is infant/child/adult only. If the model's original
decision is person/unknown but valid age scores exist, the highest-scoring class
is drawn with `?` to mark a below-threshold prediction. Missing scores and animals
are not age-labeled. Original JSON uncertainty is preserved. Motion status is
yes/no/pending; source boxes are scaled to exported video dimensions.

New exports from `scripts/run_vision.py` also draw the overlay after face blurring
and resizing, so the analysis uses original pixels and labels remain readable.
Visual sample: `runs/privacy/labeled-preview.jpg` (frame 50).

Bounding boxes/labels reflect model predictions, not ground truth. Previously
reported infant/child accuracy limitations still apply.
