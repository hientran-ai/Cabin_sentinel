#!/usr/bin/env bash
# Publish the current backend to a Hugging Face ZeroGPU Space.
# Usage: deploy/huggingface/deploy.sh [space_id] [--dry-run]   (default Khanh3636/cabinsentinel-backend)
# Needs `pip install huggingface_hub` and a token (HF_TOKEN, or a cached `hf auth login`).
# Uses the Hub API rather than `git push`: the Space rejects binary files such as the YuNet model over plain git.
set -euo pipefail

SPACE_ID="${1:-Khanh3636/cabinsentinel-backend}"
DRY_RUN="${2:-}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
YUNET="$REPO/models/face_detection_yunet_2023mar.onnx"
YUNET_SHA256="8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

actual="$(shasum -a 256 "$YUNET" | cut -d' ' -f1)"
if [ "$actual" != "$YUNET_SHA256" ]; then
  echo "Refusing to deploy: $YUNET checksum $actual != $YUNET_SHA256" >&2
  exit 1
fi

cp "$HERE"/{app.py,routing.py,requirements.txt,packages.txt,README.md} "$STAGE"/
# The backend lives in services/api/src; the repo-root src/ is only an import shim pointing there. The Space has no
# services/ tree, so the real package is published as src/.
rsync -a --exclude __pycache__ "$REPO/services/api/src/" "$STAGE/src/"
mkdir -p "$STAGE/models"
cp "$YUNET" "$REPO/models/YUNET-LICENSE" "$STAGE/models/"
# Never ignore models/: the Hub silently drops ignored files, the YuNet model then never reaches the Space and
# /health reports privacy_model.available=false (reason=model_missing).
printf '__pycache__/\n*.pyc\n/data/\n*.db\n/models/yolo*.pt\n' > "$STAGE/.gitignore"

# Optional age router (evidence only, never an input to risk). Owner accepted responsibility on 2026-10-18 for NON-COMMERCIAL competition use;
# lineage includes SVIRO (CC BY-NC-SA 4.0), so the file ships with an attribution/licence notice. Skipped when AGE_CHECKPOINT is unset/missing.
AGE_CHECKPOINT="${AGE_CHECKPOINT:-/Users/mac/AI/P-068/.claude/worktrees/oem-e2e/runs/age-real-router-20261002/best.pt}"
AGE_SHA256="4c71685b8522e781de7b7b370c05c41ddeadb8819af34cfd81bda12a388e3ce2"
if [ -f "$AGE_CHECKPOINT" ]; then
  [ "$(shasum -a 256 "$AGE_CHECKPOINT" | cut -d' ' -f1)" = "$AGE_SHA256" ] || { echo "Refusing: age checkpoint sha256 mismatch" >&2; exit 1; }
  cp "$AGE_CHECKPOINT" "$STAGE/models/age_router.pt"
  cat > "$STAGE/models/AGE-ROUTER-NOTICE.md" <<NOTICE
# age_router.pt (sha256 $AGE_SHA256)
Non-commercial demo use only (competition / research). Lineage includes SVIRO (https://sviro.kl.dfki.de/, CC BY-NC-SA 4.0): attribution required,
derivatives must stay CC BY-NC-SA 4.0. Rights to the real-video crops used for adaptation are NOT verified. Age is evidence only and never changes the risk level.
NOTICE
fi

REV="$(git -C "$REPO" rev-parse --short HEAD)"
if [ "$DRY_RUN" = "--dry-run" ]; then
  (cd "$STAGE" && find . -type f ! -path '*/__pycache__/*' | sort)
  echo "Dry run: would publish backend $REV to $SPACE_ID"
  exit 0
fi

python3 - "$SPACE_ID" "$STAGE" "$REV" <<'PY'
import sys

from huggingface_hub import HfApi

space, stage, rev = sys.argv[1:]
api = HfApi()
# .gitignore goes first: files it still hides in the Space would be dropped from the next commit.
api.upload_file(path_or_fileobj=f"{stage}/.gitignore", path_in_repo=".gitignore", repo_id=space,
                repo_type="space", commit_message=f"deploy: .gitignore for backend {rev}")
commit = api.upload_folder(folder_path=stage, repo_id=space, repo_type="space",
                           delete_patterns=["src/**"], commit_message=f"deploy: backend {rev}")
print(f"Pushed {commit.commit_url}\nBuild status: https://huggingface.co/spaces/{space}")
PY
