# Historical SVIRO infant / child / adult

Current inference and new training use [child/adult](sviro-child-adult.md).
This page records the historical three-class model; `--infant-threshold` has been removed.

Current preparation and training use checkpoint class order `adult`, `child`,
`infant`. Seat labels map as 1 = infant, 2 = child, 3 = adult. Objects and empty
seats remain excluded. These are occupant/seat categories, not exact ages.

For the supplied real-video tests, use the updated checkpoint
`runs/age-real-router-20261002/best.pt`; see [real-video adaptation](real-age-adaptation.md)
for its evaluation and remaining limits. The synthetic baseline below is preserved.

## Usage

Completed baseline results: [evaluation report](../eval/results/age3-report.md).
Test balanced accuracy is 72.57%; infant/child recalls are about 59%, despite
99.42% validation balanced accuracy. See the report before using this model.

```powershell
.venv\Scripts\python.exe -m src.vision.prepare_sviro
.venv\Scripts\python.exe -m src.vision.train_age --epochs 5
.venv\Scripts\python.exe scripts/run_vision.py --source data/videos/cabin_test.mp4 --classifier runs/age-three-class/best.pt --output eval/cabin-age3.jsonl
```

New crops: `data/sviro-age3/`. New checkpoint and reports:
`runs/age-three-class/`. Existing outputs are refused; choose another `--output`
to repeat preparation/training. Binary crops and model are preserved. Inference
still supports binary checkpoints and their original decisions.

Scene splitting remains seed 68, with official test scenes excluded from training
and model selection. Frozen ImageNet features feed a trained classifier head;
validation balanced accuracy selects the checkpoint. `report.json` contains a
3x3 confusion matrix, per-class recall, and decisions including abstentions.

Three-class inference selects the highest-scoring class, then requires that
class's threshold: adult 0.9, child 0.5, infant 0.5. Otherwise return `unknown`
and keep the YOLO `person` label. Use `--infant-threshold` to change its threshold.
Scores are uncalibrated and thresholds provisional.

Synthetic BMW X5 crop results do not establish real-cabin accuracy. Seat appearance
can become a shortcut; train/validation scenes may share human identities.
The classifier cannot recover YOLO misses. Previous binary metrics do not apply
to the new checkpoint.
