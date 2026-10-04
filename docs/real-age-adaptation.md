# Real-video age model adaptation

The synthetic-only checkpoint labelled visible children as adults in the supplied
videos. The recommended checkpoint for the batch runner is now
`runs/age-real-router-20261002/best.pt`. The old checkpoint is preserved.

## Changes

Four frames from each five-second preview were exported as unblurred person crops.
`data/real-age-review-20261002/annotations.json` records assistant visual labels,
source videos, boxes, and exclusions. Labels were assigned from the images rather
than copied from the old model. Incomplete-person and ambiguous infant/child crops
were excluded.

The real-data split is by video: Instagram and people-original supply 14 training
crops; funny-funny supplies four validation child crops; family-vacation supplies
seven test child crops. The you-would-swear toddler was excluded from supervised
evaluation because chronological age and the infant boundary are unverified.

The existing MobileNet backbone is frozen. A new classification head learns from
balanced real and synthetic crops, with eight augmented variants of each real
training crop. A learned binary domain gate selects this head for real images and
the original head otherwise. Its checkpoint includes both heads, the gate, and
training feature normalization. No labels are forced by video name, bounding-box
size, seat, or position. Existing three-class and binary checkpoints still load.

## Results and limits

| Evaluation | Old | New |
|---|---:|---:|
| Real validation child argmax | 0/4 | 4/4 |
| Real test child argmax | 2/7 | 7/7 |
| Real test child above decision threshold | 2/7 | 6/7 |
| Synthetic test balanced argmax accuracy | 72.57% | 72.27% |
| Synthetic test adult recall | 100% | 100% |
| Synthetic test child recall | 59% | 59% |
| Synthetic test infant recall | 58.72% | 57.80% |

These are crop results, not end-to-end detection recall. The seven real test crops
are correlated frames from one video, not seven independent children. Real labels
are preliminary assistant visual annotations. Real adult/infant validation is
absent. The synthetic test was inspected during development to detect regressions,
so it is a development regression check rather than an untouched benchmark.
The model and domain gate still need broader independently labelled real videos.

Detailed metrics: `runs/age-real-router-20261002/report.json`. Twenty-seven vision
unit tests pass, including checkpoint routing, old checkpoint compatibility,
invalid crop handling, and rejection of invalid normalization.
The routed checkpoint uses format version 2, so older inference code rejects it
rather than silently ignoring the real-image adapter.

## Run

```powershell
.venv/Scripts/python.exe scripts/test_video_batch.py
.venv/Scripts/python.exe scripts/run_vision.py --source data/videos/cabin_test.mp4 --model yolov8s.pt --classifier runs/age-real-router-20261002/best.pt --motion --mask-faces --video-output runs/privacy/cabin-fixed-new.mp4 --output eval/cabin-fixed-new.jsonl
```

The batch runner creates five-second, 10 FPS previews with tags `fixed`. Use a new
`--tag` to rerun without overwriting outputs. The video runner restores requested
CPU thread count after Ultralytics initialization, so age inference and the
reported thread setting agree. Test previews have no audio.
