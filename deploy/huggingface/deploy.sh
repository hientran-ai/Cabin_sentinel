#!/usr/bin/env bash
# Publish the current backend to the Hugging Face ZeroGPU Space.
# Usage: deploy/huggingface/deploy.sh [space_id]   (default Khanh3636/cabinsentinel-backend)
# Git must already be able to push to huggingface.co (credential helper or token).
set -euo pipefail

SPACE_ID="${1:-Khanh3636/cabinsentinel-backend}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

GIT_LFS_SKIP_SMUDGE=1 git clone --quiet "https://huggingface.co/spaces/$SPACE_ID" "$WORK/space"
cd "$WORK/space"
git rm -r --quiet --ignore-unmatch . >/dev/null
cp "$HERE"/{app.py,routing.py,requirements.txt,packages.txt,README.md} .
rsync -a --exclude __pycache__ "$REPO/src" ./
printf '__pycache__/\n*.pyc\n/data/\n/models/\n*.db\n' > .gitignore
git add -A
missing="$(comm -23 <(find src -type f ! -path '*/__pycache__/*' | sort) <(git ls-files src | sort))"
if [ -n "$missing" ]; then
  echo "Refusing to deploy: files under src/ would be left out:" >&2
  echo "$missing" >&2
  exit 1
fi
if git diff --cached --quiet; then
  echo "Space already matches $(git -C "$REPO" rev-parse --short HEAD)"
  exit 0
fi
git commit --quiet -m "deploy: backend $(git -C "$REPO" rev-parse --short HEAD)"
git push --quiet origin HEAD:main
echo "Pushed. Build status: https://huggingface.co/spaces/$SPACE_ID"
