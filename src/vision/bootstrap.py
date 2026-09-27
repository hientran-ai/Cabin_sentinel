"""Wait for verified SVIRO ZIPs, extract safely, prepare crops and train."""

import argparse
import json
import shutil
import time
import zipfile
import zlib
from pathlib import Path

from src.vision.prepare_sviro import prepare
from src.vision.train_age import train


def extract_archives(dataset):
    destination = dataset / "extracted"
    base = destination.resolve()
    files = ["x5-bboxes.zip", "x5-masks.zip", "x5-keypoints.zip", "x5-rgb.zip"]
    for name in files:
        with zipfile.ZipFile(dataset / name) as archive:
            needed = sum(i.file_size for i in archive.infolist() if not (destination / i.filename).exists())
            if shutil.disk_usage(dataset).free < needed + 1024**3:
                raise OSError("Insufficient free disk space for extraction")
            for member in archive.infolist():
                target = (destination / member.filename).resolve()
                if not target.is_relative_to(base):
                    raise ValueError(f"Unsafe archive path: {member.filename}")
                if member.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                if target.exists():
                    crc = 0
                    with target.open("rb") as stream:
                        for block in iter(lambda: stream.read(1024 * 1024), b""):
                            crc = zlib.crc32(block, crc)
                    if target.stat().st_size == member.file_size and crc == member.CRC:
                        continue
                    raise ValueError(f"Existing extracted file differs from archive: {target}")
                target.parent.mkdir(parents=True, exist_ok=True)
                partial = target.with_suffix(target.suffix + ".extracting")
                with archive.open(member) as incoming, partial.open("xb") as outgoing:
                    shutil.copyfileobj(incoming, outgoing)  # Reading to EOF verifies ZIP CRC.
                partial.rename(target)
        print(f"Extracted and checked {name}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=Path("data/sviro"))
    parser.add_argument("--crops", type=Path, default=Path("data/sviro-child"))
    parser.add_argument("--output", type=Path, default=Path("runs/age-baseline"))
    parser.add_argument("--backbone", type=Path, default=Path("data/models/mobilenet_v3_small-047dcff4.pth"))
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--wait", action="store_true", help="Wait up to 12 hours for the separate downloader")
    args = parser.parse_args()
    status_path = args.output.parent / (args.output.name + "-pipeline-status.json")
    status_path.parent.mkdir(parents=True, exist_ok=True)

    def status(stage, **extra):
        status_path.write_text(json.dumps({"stage": stage, **extra}, indent=2), encoding="utf-8")

    try:
        required = [args.dataset / f"x5-{kind}.zip" for kind in ("rgb", "bboxes", "masks", "keypoints")]
        deadline = time.monotonic() + 12 * 3600
        while not all(path.is_file() for path in required):
            missing = [p.name for p in required if not p.is_file()]
            status("waiting_for_download", missing=missing)
            if not args.wait:
                raise FileNotFoundError(f"Download not complete: {missing}")
            if time.monotonic() >= deadline:
                raise TimeoutError("Download did not finish within 12 hours")
            time.sleep(20)
        status("extracting")
        extract_archives(args.dataset)
        status("preparing_crops")
        prepare(args.dataset / "extracted", args.crops)
        status("training")
        report = train(args.crops, args.output, args.backbone, epochs=args.epochs)
        status("complete", checkpoint=str(args.output / "best.pt"), test=report["test"])
    except Exception as error:
        status("failed", error=str(error))
        raise


if __name__ == "__main__":
    main()
