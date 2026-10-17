"""Verify model assets or run one local image without starting a web server."""

import argparse
import json
from pathlib import Path

from . import Pipeline, verify_assets


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets-root", type=Path, required=True, help="Repo root containing models/")
    parser.add_argument("--image", type=Path)
    parser.add_argument("--output", type=Path, help="Write a new JSON result; existing files are not replaced")
    parser.add_argument("--device", default="cpu", help="cpu, auto, or cuda:N")
    parser.add_argument("--no-preview", action="store_true", help="Omit the masked JPEG; retain masking metadata")
    parser.add_argument("--geometry", type=Path)
    parser.add_argument("--camera-id")
    args = parser.parse_args()
    paths = verify_assets(args.assets_root)
    if args.image is None:
        result = {"verified": True, "assets": {k: str(v) for k, v in paths.items()}}
    else:
        with Pipeline(args.assets_root, device=args.device, geometry=args.geometry) as pipeline:
            result = pipeline.infer(args.image.read_bytes(), camera_id=args.camera_id,
                                    include_preview=not args.no_preview)
    serialized = json.dumps(result, indent=2, allow_nan=False)
    if args.output:
        with args.output.open("x", encoding="utf-8") as handle:
            handle.write(serialized + "\n")
    else:
        print(serialized)


if __name__ == "__main__":
    main()
