"""Prepare pinned public weights or check local assets without running inference."""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.vision.model_assets import download_asset, import_age, model_report  # noqa: E402


def main():
    manifest = json.loads((ROOT / "vision-models.json").read_text())
    models = manifest["models"]
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--download", action="store_true", help="Explicit setup-time download of selected public weights")
    mode.add_argument("--check", action="store_true", help="Read-only offline integrity check")
    parser.add_argument("--models", nargs="+", choices=list(models), default=["yolov8n", "yolov8s", "yunet"])
    parser.add_argument("--directory", type=Path, default=ROOT / "models")
    parser.add_argument("--age-checkpoint", type=Path, help="Exact BaoTam checkpoint supplied outside Git")
    parser.add_argument("--age-sha256", help="SHA-256 supplied by the checkpoint owner")
    args = parser.parse_args()
    if bool(args.age_checkpoint) != bool(args.age_sha256):
        parser.error("Use --age-checkpoint and --age-sha256 together")
    if args.check and args.age_checkpoint:
        parser.error("--check is read-only; omit it when importing a checkpoint")
    error = None
    try:
        if args.age_checkpoint:
            import_age(args.age_checkpoint, args.directory, args.age_sha256)
        if args.download:
            for name in args.models:
                if models[name]["url"]:
                    download_asset(models[name], args.directory)
    except (OSError, ValueError) as exc:
        error = str(exc)
    observed = model_report(args.directory, models)
    report = {"source": manifest["source"], "models": observed,
              "complete": all(item["status"] == "VERIFIED" for item in observed.values()),
              "selected_ready": all(observed[name]["status"] == "VERIFIED" for name in args.models),
              "integrity_only": True, "inference_verified": False,
              "age_safety_integration": "NOT_INTEGRATED", "error": error}
    print(json.dumps(report, indent=2))
    return 0 if report["selected_ready"] and error is None else 1


if __name__ == "__main__":
    raise SystemExit(main())
