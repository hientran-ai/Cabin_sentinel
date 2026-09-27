"""Train and evaluate an offline MobileNetV3 Small child/adult crop baseline."""

import argparse
import json
import random
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader
from torchvision.datasets import ImageFolder

from src.vision.age import CLASSES, CROP_PADDING, IMAGE_SIZE, build_model, choose_group, image_transform


@torch.inference_mode()
def evaluate(model, loader, device):
    model.eval()
    confusion = [[0, 0], [0, 0]]
    decisions = {name: {"adult": 0, "child": 0, "unknown": 0} for name in CLASSES}
    for images, labels in loader:
        probabilities = model(images.to(device)).softmax(dim=1).cpu()
        for label, scores in zip(labels.tolist(), probabilities.tolist(), strict=True):
            predicted = int(scores[1] > scores[0])
            confusion[label][predicted] += 1
            decisions[CLASSES[label]][choose_group(scores[1])] += 1
    support = [sum(row) for row in confusion]
    if not all(support):
        raise ValueError("Evaluation must contain both adult and child examples")
    recalls = [confusion[i][i] / support[i] for i in range(2)]
    return {
        "confusion_matrix_actual_rows": confusion,
        "classes": CLASSES,
        "adult_recall_argmax": recalls[0],
        "child_recall_argmax": recalls[1],
        "balanced_accuracy_argmax": sum(recalls) / 2,
        "decisions_at_default_thresholds": decisions,
        "child_threshold": 0.5,
        "adult_threshold": 0.9,
        "note": "Crop classification only, not YOLO end-to-end detection recall.",
    }


def train(data, output, backbone, epochs=5, batch_size=32, seed=68, device="cpu"):
    if epochs < 1 or batch_size < 2:
        raise ValueError("Use epochs >= 1 and batch size >= 2")
    if not backbone.is_file():
        raise FileNotFoundError(f"Local ImageNet backbone required: {backbone}")
    metadata = json.loads((data / "summary.json").read_text())
    if not metadata.get("complete") or metadata.get("crop_padding") != CROP_PADDING:
        raise ValueError("Prepare complete RGB crops first; audit-only output cannot be trained")
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.set_num_threads(4)
    datasets = {
        split: ImageFolder(data / split, transform=image_transform(split == "train"))
        for split in ("train", "val", "test")
    }
    for split, dataset in datasets.items():
        if dataset.classes != CLASSES or not all(dataset.targets.count(i) for i in range(2)):
            raise ValueError(f"{split} must contain adult and child classes")
    loaders = {
        split: DataLoader(
            dataset,
            batch_size=batch_size,
            shuffle=split == "train",
            num_workers=0,
            generator=torch.Generator().manual_seed(seed),
        )
        for split, dataset in datasets.items()
    }
    output.mkdir(parents=True, exist_ok=False)
    model = build_model(backbone).to(device)
    for parameter in model.features.parameters():
        parameter.requires_grad_(False)
    counts = torch.tensor([datasets["train"].targets.count(i) for i in range(2)], dtype=torch.float32)
    criterion = nn.CrossEntropyLoss(weight=(counts.sum() / (2 * counts)).to(device))
    optimizer = torch.optim.AdamW(model.classifier.parameters(), lr=0.001)
    best, history = -1, []
    for epoch in range(1, epochs + 1):
        model.train()
        model.features.eval()  # Freeze running statistics as well as backbone weights.
        loss_sum = 0
        seen = 0
        for images, labels in loaders["train"]:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad(set_to_none=True)
            loss = criterion(model(images), labels)
            loss.backward()
            optimizer.step()
            loss_sum += loss.item() * len(labels)
            seen += len(labels)
        metrics = evaluate(model, loaders["val"], device)
        history.append({"epoch": epoch, "train_loss": loss_sum / seen, "val": metrics})
        print(json.dumps(history[-1]), flush=True)
        if metrics["balanced_accuracy_argmax"] > best:
            best = metrics["balanced_accuracy_argmax"]
            torch.save(
                {
                    "format_version": 1,
                    "classes": CLASSES,
                    "image_size": IMAGE_SIZE,
                    "crop_padding": CROP_PADDING,
                    "trained_epochs": epoch,
                    "preprocessing": "resize224_imagenet_normalization",
                    "model_state": {k: v.detach().cpu() for k, v in model.state_dict().items()},
                    "validation": metrics,
                },
                output / "best.pt",
            )
        (output / "history.json").write_text(json.dumps(history, indent=2), encoding="utf-8")
    checkpoint = torch.load(output / "best.pt", map_location="cpu", weights_only=True)
    model.load_state_dict(checkpoint["model_state"])
    test_metrics = evaluate(model, loaders["test"], device)
    report = {
        "complete": True,
        "architecture": "mobilenet_v3_small",
        "classes": CLASSES,
        "training": "Frozen ImageNet features; train classifier head only",
        "seed": seed,
        "best_epoch": checkpoint["trained_epochs"],
        "dataset": str(data.resolve()),
        "crop_counts": metadata["crops"],
        "validation": checkpoint["validation"],
        "test": test_metrics,
        "limitations": [
            "Synthetic BMW X5 only; requires held-out real-cabin evaluation.",
            "Infant and child are combined into child.",
            "Empty child seats are excluded, not treated as adults.",
            "Detector misses cannot be recovered by the crop classifier.",
            "Default thresholds are provisional and scores are not calibrated.",
        ],
    }
    (output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path("data/sviro-child"))
    parser.add_argument("--output", type=Path, default=Path("runs/age-baseline"))
    parser.add_argument("--backbone", type=Path, default=Path("data/models/mobilenet_v3_small-047dcff4.pth"))
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--seed", type=int, default=68)
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()
    train(args.data, args.output, args.backbone, args.epochs, args.batch_size, args.seed, args.device)


if __name__ == "__main__":
    main()
