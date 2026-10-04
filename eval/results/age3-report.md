# Three-class baseline — 2026-10-02

Prepared 2,275 crops from 2,500 BMW X5 scenes with seed 68. Verified every crop
file and seat-to-class mapping; no scenes overlap across train/validation/test.
Train counts: adult 737, child 455, infant 303. Validation: adult 155, child 114,
infant 68. Official test: adult 234, child 100, infant 109.

Five CPU training epochs, frozen ImageNet MobileNetV3 Small features, class-weighted
head training. Best checkpoint selected at epoch 3 using validation only:
`runs/age-three-class/best.pt`. Validation balanced accuracy: 99.42%.

## Official test

| Actual class | Samples | Argmax recall | Correct default-threshold decisions |
| --- | ---: | ---: | ---: |
| adult | 234 | 100% | 233 |
| child | 100 | 59% | 59 |
| infant | 109 | 58.72% | 61 |

Argmax balanced accuracy: 72.57%. Confusion matrix (actual rows, predicted columns;
order adult, child, infant):

```text
234   0   0
 40  59   1
  6  39  64
```

At default thresholds, adult: 233 adult / 1 unknown; child: 17 adult / 59 child /
1 infant / 23 unknown; infant: 39 child / 61 infant / 9 unknown.

Infant and child separation is implemented, but this baseline generalizes poorly
to held-out synthetic test assets. The validation score must not be used as a
claim of deployed accuracy. No hyperparameters were selected using test results.
Further tuning should use training/validation evidence.

Reports: `runs/age-three-class/report.json` and `history.json` (local ignored
artifacts). Independent saved-checkpoint test reproduction:
`eval/age3-checkpoint-verification.json`.

Labels represent SVIRO occupant/seat categories, not numerical ages. Results are
crop classification metrics, not end-to-end YOLO recall or real-cabin accuracy.

## Combined video smoke test

`eval/cabin-age3-20261002.jsonl` and its `.summary.json` cover all 266 source
frames with sequential IDs and verified three-class score fields. CPU inference
used four PyTorch threads. Processing speed was 2.19 FPS; mean model-stage latency
419.63 ms, p95 690.70 ms. Counts across frames: 254 adult, 83 child, 1 infant,
319 person with unknown age. Counts are boxes across frames, not unique people.
The video has no reviewed ground truth, so this verifies execution/output only,
not age accuracy. Speed remains below the source video's 25 FPS.
