"""Adapt the age head to reviewed real crops while retaining synthetic classes."""
import argparse
import copy
import json
import random
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch import nn
from torch.nn import functional
from torchvision import transforms

from src.vision.age import CLASSES, build_model, choose_age, image_transform

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=Path('runs/age-real-adapted-20261002'))
parser.add_argument('--cache', type=Path)
parser.add_argument('--distillation', type=float, default=0)
args = parser.parse_args()
SEED = 68
random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)
torch.set_num_threads(2)
OUT = args.output
OUT.mkdir(exist_ok=True)
if (OUT / 'best.pt').exists():
    raise FileExistsError('Adapted checkpoint already exists; use a new run directory')
BASELINE = Path('runs/age-three-class/best.pt')
saved = torch.load(BASELINE, map_location='cpu', weights_only=True)
CLASSES = saved['classes']
model = build_model(classes=CLASSES)
model.load_state_dict(saved['model_state'])
model.eval()
teacher = copy.deepcopy(model.classifier).eval()
for parameter in teacher.parameters():
    parameter.requires_grad_(False)
for p in model.features.parameters():
    p.requires_grad_(False)
annotations = json.loads(Path('data/real-age-review-20261002/annotations.json').read_text())
groups = {split: {r['video'] for r in annotations if r['split'] == split} for split in ['train', 'val', 'test']}
assert not groups['train'] & (groups['val'] | groups['test']) and not groups['val'] & groups['test']
augmentation = transforms.Compose([
    transforms.RandomHorizontalFlip(),
    transforms.RandomAffine(12, translate=(.04, .04), scale=(.9, 1.1)),
    transforms.ColorJitter(brightness=.2, contrast=.2, saturation=.15),
    image_transform(),
])


@torch.inference_mode()
def cache(rows, augmentations=1):
    features, labels = [], []
    for start in range(0, len(rows), 32):
        batch = rows[start:start + 32]
        images, targets = [], []
        for path, target in batch:
            with Image.open(path) as opened:
                image = opened.convert('RGB')
            for variant in range(augmentations):
                images.append((image_transform() if variant == 0 else augmentation)(image))
                targets.append(target)
        output = model.avgpool(model.features(torch.stack(images))).flatten(1)
        features.append(output)
        labels.extend(targets)
    return torch.cat(features).clone(), torch.tensor(labels)


data = {}
if args.cache:
    data = torch.load(args.cache, map_location='cpu', weights_only=True)
else:
    for split in ['train', 'val', 'test']:
        rows = [(p, index) for index, label in enumerate(CLASSES) for p in sorted(Path(f'data/sviro-age3/{split}/{label}').glob('*.jpg'))]
        print(f'Caching synthetic {split}: {len(rows)} crops', flush=True)
        data[f'synthetic_{split}'] = cache(rows)
        rows = [(Path('data/real-age-review-20261002') / r['crop'], CLASSES.index(r['label']))
                for r in annotations if r['split'] == split and r['label']]
        print(f'Caching real {split}: {len(rows)} reviewed crops', flush=True)
        data[f'real_{split}'] = cache(rows, 8 if split == 'train' else 1)
data = {name: (features.clone(), labels.clone()) for name, (features, labels) in data.items()}
torch.save(data, OUT / 'feature-cache.pt')


@torch.inference_mode()
def metrics(head, pair):
    head.eval()
    features, labels = pair
    scores = head(features).softmax(1)
    matrix = torch.zeros(3, 3, dtype=torch.int64)
    decisions = torch.zeros(3, 4, dtype=torch.int64)
    for actual, values in zip(labels.tolist(), scores.tolist(), strict=True):
        winner = int(np.argmax(values))
        matrix[actual, winner] += 1
        decision = choose_age(dict(zip(CLASSES, values, strict=True)))
        decisions[actual, CLASSES.index(decision) if decision in CLASSES else 3] += 1
    support = matrix.sum(1)
    recalls = [matrix[i, i].item() / support[i].item() if support[i] else None for i in range(3)]
    present = [v for v in recalls if v is not None]
    return {'classes': CLASSES, 'support': support.tolist(), 'confusion_matrix_actual_rows': matrix.tolist(),
            'recall_argmax': dict(zip(CLASSES, recalls, strict=True)),
            'balanced_accuracy_present_classes': sum(present) / len(present),
            'decisions_columns_adult_child_infant_unknown': decisions.tolist()}


baseline = {name: metrics(model.classifier, pair) for name, pair in data.items() if not name.endswith('train')}
print('Baseline:', json.dumps(baseline), flush=True)
optimizer = torch.optim.AdamW(model.classifier.parameters(), lr=.00015, weight_decay=.01)
criterion = nn.CrossEntropyLoss(label_smoothing=.05)
weights = {}
for domain in ['synthetic', 'real']:
    _, labels = data[f'{domain}_train']
    counts = torch.bincount(labels, minlength=3).clamp(min=1)
    weights[domain] = 1 / counts[labels].float()
best_score, best_state, best_epoch = -1, None, None
history = []
for epoch in range(1, 81):
    model.classifier.train()
    losses = []
    for step in range(24):
        pairs = []
        for domain, size in [('synthetic', 64), ('real', 32)]:
            features, labels = data[f'{domain}_train']
            indices = torch.multinomial(weights[domain], size, replacement=True)
            pairs.append((features[indices], labels[indices]))
        optimizer.zero_grad(set_to_none=True)
        synthetic_logits = model.classifier(pairs[0][0])
        synthetic_loss = criterion(synthetic_logits, pairs[0][1])
        real_loss = criterion(model.classifier(pairs[1][0]), pairs[1][1])
        loss = .6 * synthetic_loss + .4 * real_loss
        if args.distillation:
            with torch.no_grad():
                target = teacher(pairs[0][0]).div(2).softmax(1)
            loss += args.distillation * 4 * functional.kl_div(synthetic_logits.div(2).log_softmax(1), target, reduction='batchmean')
        loss.backward()
        optimizer.step()
        losses.append(loss.item())
    val_s = metrics(model.classifier, data['synthetic_val'])
    val_r = metrics(model.classifier, data['real_val'])
    eligible = all(val_s['recall_argmax'][label] >= baseline['synthetic_val']['recall_argmax'][label] - .03 for label in CLASSES)
    score = .5 * val_s['balanced_accuracy_present_classes'] + .5 * val_r['balanced_accuracy_present_classes']
    row = {'epoch': epoch, 'loss': float(np.mean(losses)), 'synthetic_val': val_s, 'real_val': val_r, 'eligible': eligible}
    history.append(row)
    if eligible and score > best_score:
        best_score, best_epoch = score, epoch
        best_state = copy.deepcopy(model.classifier.state_dict())
    if epoch % 10 == 0 or epoch == 1:
        print(json.dumps(row), flush=True)
if best_state is None:
    raise RuntimeError('No candidate preserved synthetic validation recall; baseline remains active')
model.classifier.load_state_dict(best_state)
after = {name: metrics(model.classifier, pair) for name, pair in data.items() if not name.endswith('train')}
improved = after['real_val']['balanced_accuracy_present_classes'] > baseline['real_val']['balanced_accuracy_present_classes']
report = {'complete': True, 'baseline_checkpoint': str(BASELINE), 'seed': SEED, 'best_epoch': best_epoch,
          'distillation_weight': args.distillation,
          'training': 'Frozen baseline backbone; domain-balanced head adaptation with reviewed real crops and synthetic replay',
          'real_video_splits': {key: sorted(value) for key, value in groups.items()},
          'baseline': baseline, 'adapted': after, 'real_validation_improved': improved,
          'limitations': ['Real labels were visually annotated by assistant; chronological ages are unverified.',
                         'Real validation and test only contain clearly visible children; real adult/infant recall is unmeasured.',
                         'Videos supplied after seeing baseline errors form a development evaluation, not an independent benchmark.',
                         'Ambiguous toddler/infant and incomplete-person crops were excluded.',
                         'Classifier cannot recover detector misses or split overlapping people.']}
(OUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
(OUT / 'history.json').write_text(json.dumps(history, indent=2), encoding='utf-8')
if not improved:
    raise RuntimeError('No real validation improvement; baseline remains active')
checkpoint = {**saved, 'trained_epochs': best_epoch, 'model_state': model.state_dict(),
              'adaptation': {'baseline': str(BASELINE), 'seed': SEED, 'real_video_splits': report['real_video_splits']},
              'validation': {'synthetic': after['synthetic_val'], 'real': after['real_val']}}
torch.save(checkpoint, OUT / 'best.pt')
print(json.dumps(report), flush=True)
