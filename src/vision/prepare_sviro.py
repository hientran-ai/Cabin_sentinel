"""Build person crops from SVIRO boxes + seat-aware masks + filename labels."""

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

from src.vision.age import CROP_PADDING, padded_box

PERSON_PIXELS = [(29,), (227,), (131, 132)]
NAME = re.compile(r"(?P<car>.+)_(?P<split>train|test)_imageID_(?P<id>\d+)_GT_([0-6])_([0-6])_([0-6])$")
AGE_LABEL = {1: "child", 2: "child", 3: "adult"}


def scene_info(stem):
    match = NAME.fullmatch(stem)
    if not match:
        raise ValueError(f"Unexpected SVIRO filename: {stem}")
    labels = tuple(map(int, match.groups()[-3:]))
    return match["car"], match["split"], match["id"], labels


def split_for(car, original_split, scene_id, seed=68, val_fraction=0.2):
    if original_split == "test":
        return "test"
    value = int(hashlib.sha256(f"{seed}:{car}:{scene_id}".encode()).hexdigest()[:8], 16) / 2**32
    return "val" if value < val_fraction else "train"


def intersection_over_union(a, b):
    overlap = max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    return overlap / max(1, area_a + area_b - overlap)


def labelled_boxes(mask, boxes, seat_labels):
    """Match each person box to one seat's visible-person mask, rejecting ambiguity."""
    regions = {}
    for seat, values in enumerate(PERSON_PIXELS):
        ys, xs = np.where(np.isin(mask, values))
        if len(xs):
            regions[seat] = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    accepted, rejected, used_seats = [], Counter(), set()
    for class_id, x1, y1, x2, y2 in boxes:
        if class_id != 3:
            continue
        # SVIRO coordinates include the last pixel (e.g. y_max=639 for H=640).
        bbox = (x1, y1, x2 + 1, y2 + 1)
        candidates = sorted(
            ((intersection_over_union(bbox, region), seat) for seat, region in regions.items()), reverse=True
        )
        if not candidates or candidates[0][0] < 0.5:
            rejected["no_matching_person_mask"] += 1
            continue
        score, seat = candidates[0]
        if len(candidates) > 1 and score - candidates[1][0] < 0.1:
            rejected["ambiguous_seat"] += 1
            continue
        if seat in used_seats:
            rejected["duplicate_person_for_seat"] += 1
            continue
        if seat_labels[seat] not in AGE_LABEL:
            rejected["person_mask_in_unoccupied_seat"] += 1
            continue
        used_seats.add(seat)
        accepted.append(
            {
                "seat": seat,
                "class": AGE_LABEL[seat_labels[seat]],
                "sviro_seat_label": seat_labels[seat],
                "bbox": list(bbox),
                "mask_iou": score,
            }
        )
    return accepted, rejected


def crop_path(output, split, age_class, filename):
    """Validate crop components and reject escapes, including existing symlinks."""
    if split not in {"train", "val", "test"} or age_class not in {"child", "adult"}:
        raise ValueError("Invalid crop split or age class")
    if not filename or filename in {".", ".."} or any(char in filename for char in "/\\:"):
        raise ValueError("Crop filename must be a single relative component")
    rel = Path(split) / age_class / filename
    destination = output / rel
    if not destination.resolve().is_relative_to(output.resolve()):
        raise ValueError("Crop destination escapes output directory")
    return rel, destination


def prepare(source, output, audit_only=False, seed=68):
    annotations = sorted(source.rglob("boundingBoxes_wholeImage/*.txt"))
    if not annotations:
        raise ValueError("No extracted SVIRO bounding-box annotations found")
    if output.exists():
        raise FileExistsError(f"Choose a new output directory: {output}")
    output.mkdir(parents=True)
    counts, rejected, scenes = Counter(), Counter(), Counter()
    missing_rgb = 0
    total_records = 0
    with (output / "manifest.jsonl").open("x", encoding="utf-8") as manifest:
        for annotation in annotations:
            car, original_split, scene_id, labels = scene_info(annotation.stem)
            split = split_for(car, original_split, scene_id, seed)
            scenes[split] += 1
            folder = annotation.parent.parent
            mask_path = folder / "element_segmentations_wholeImage" / (annotation.stem + ".png")
            rgb_path = folder / "RGB_wholeImage" / (annotation.stem + ".png")
            # RGB test archives can use test/, while annotations use test_with_labels/.
            if not rgb_path.exists() and original_split == "test":
                rgb_path = folder.parent / "test" / "RGB_wholeImage" / (annotation.stem + ".png")
            if not rgb_path.exists():
                missing_rgb += 1
                if not audit_only:
                    raise FileNotFoundError(f"Missing RGB image; download/extract first: {rgb_path}")
            with Image.open(mask_path) as image:
                mask = np.asarray(image.convert("L"))
            boxes = [list(map(int, line.split(","))) for line in annotation.read_text().splitlines() if line.strip()]
            accepted, skipped = labelled_boxes(mask, boxes, labels)
            rejected.update(skipped)
            rgb = None
            if not audit_only:
                with Image.open(rgb_path) as image:
                    rgb = image.convert("RGB")
                if rgb.size != (mask.shape[1], mask.shape[0]):
                    raise ValueError(f"RGB/mask size mismatch: {rgb_path}")
            for record in accepted:
                rect = padded_box(record["bbox"], mask.shape[1], mask.shape[0])
                if rect is None:
                    rejected["invalid_crop"] += 1
                    continue
                rel, destination = crop_path(
                    output, split, record["class"], f"{annotation.stem}_seat{record['seat']}.jpg"
                )
                if rgb is not None:
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    rgb.crop(rect).save(destination, quality=95)
                record.update(
                    {
                        "split": split,
                        "original_split": original_split,
                        "scene": f"{car}:{original_split}:{scene_id}",
                        "crop": rel.as_posix(),
                        "crop_box": list(rect),
                        "source_image": str(rgb_path.resolve()),
                    }
                )
                manifest.write(json.dumps(record) + "\n")
                total_records += 1
                counts[f"{split}/{record['class']}"] += 1
    summary = {
        "complete": not audit_only,
        "audit_only": audit_only,
        "scenes": dict(scenes),
        "crops": dict(counts),
        "records": total_records,
        "rejected": dict(rejected),
        "missing_rgb_scenes": missing_rgb,
        "seed": seed,
        "crop_padding": CROP_PADDING,
        "mapping": {"1": "child", "2": "child", "3": "adult"},
        "source": "https://sviro.kl.dfki.de/data/",
        "limitations": "Synthetic single-vehicle data; scene split does not separate train/val human identities.",
    }
    (output / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("data/sviro/extracted"))
    parser.add_argument("--output", type=Path, default=Path("data/sviro-child-adult"))
    parser.add_argument("--audit-only", action="store_true")
    parser.add_argument("--seed", type=int, default=68)
    args = parser.parse_args()
    print(json.dumps(prepare(args.source, args.output, args.audit_only, args.seed), indent=2))


if __name__ == "__main__":
    main()
