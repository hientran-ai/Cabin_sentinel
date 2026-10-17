#!/bin/bash
# offline run of the 14/10 bundle with origin/main's own pipeline code on the three sample clips (CPU)
WT=/Users/mac/AI/P-068/.claude/worktrees/oem-e2e
S=/private/tmp/claude-501/-Users-mac-AI-P-068/721c6d92-d6cb-4b9a-874a-18496a50192a/scratchpad
cd $S/vmain/services/api
for c in ai-child child-rear empty-cabin; do
  PYTHONPATH=$S/vmain/services/api /Users/mac/AI/P-068/.venv312/bin/python $S/vmain/scripts/run_vision.py --source $WT/apps/cockpit-web/public/samples/$c.mp4 --model $WT/yolov8s.pt --classifier $WT/runs/age-two-cabin-replay4-20261014/candidate.pt --person-age-fallback $WT/runs/age-real-router-20261002/best.pt --child-threshold 0.7 --adult-threshold 0.8 --age-label-hold 0.5 --face-person-rescue --phone-imgsz 1280 --items-model $WT/runs/items-two-cabin-20261014/weights/best.pt --device cpu --motion --output $S/vout/$c/detections.jsonl > $S/vout/$c.log 2>&1
  echo "$c exit $?" >> $S/vout/done.txt
done
