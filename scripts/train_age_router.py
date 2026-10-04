"""Learn a real/synthetic domain gate using train crops and validation selection."""
import copy
import json
from pathlib import Path

import torch
from torch import nn

from src.vision.age import CLASSES, build_model, choose_age

torch.set_num_threads(2)
torch.manual_seed(68)
out = Path('runs/age-real-router-20261002')
out.mkdir(exist_ok=False)
data = torch.load('runs/age-real-adapted-20261002/feature-cache.pt', weights_only=True)
baseline = torch.load('runs/age-three-class/best.pt', weights_only=True)
CLASSES = baseline['classes']
adapted = torch.load('runs/age-real-adapted-20261002/best.pt', weights_only=True)
model = build_model(classes=CLASSES)
model.load_state_dict(baseline['model_state'])
model.eval()
real = copy.deepcopy(model.classifier)
real.load_state_dict({key.removeprefix('classifier.'): value for key, value in adapted['model_state'].items() if key.startswith('classifier.')})
real.eval()
synthetic_x = data['synthetic_train'][0]
real_x = data['real_train'][0]
mean = torch.cat([synthetic_x, real_x]).mean(0)
scale = torch.cat([synthetic_x, real_x]).std(0).clamp(min=.05)
gate = nn.Linear(synthetic_x.shape[1], 1)
optimizer = torch.optim.AdamW(gate.parameters(), lr=.003, weight_decay=.1)
criterion = nn.BCEWithLogitsLoss()
best, state, epoch_selected = -1, None, None
for epoch in range(1, 101):
    gate.train()
    for _ in range(12):
        sx = synthetic_x[torch.randint(len(synthetic_x), (64,))]
        rx = real_x[torch.randint(len(real_x), (64,))]
        features = torch.cat([sx, rx])
        labels = torch.cat([torch.zeros(64), torch.ones(64)])
        optimizer.zero_grad(set_to_none=True)
        loss = criterion(gate((features - mean) / scale).flatten(), labels)
        loss.backward()
        optimizer.step()
    gate.eval()
    with torch.no_grad():
        synthetic_correct = (gate((data['synthetic_val'][0] - mean) / scale) < 0).float().mean().item()
        real_correct = (gate((data['real_val'][0] - mean) / scale) >= 0).float().mean().item()
    score = (synthetic_correct + real_correct) / 2
    if score > best:
        best, state, epoch_selected = score, copy.deepcopy(gate.state_dict()), epoch
gate.load_state_dict(state)
gate.eval()


@torch.inference_mode()
def evaluate(pair, routed=False):
    features, labels = pair
    logits = model.classifier(features)
    routing = gate((features - mean) / scale).flatten() >= 0
    if routed:
        logits[routing] = real(features[routing])
    probabilities = logits.softmax(1)
    matrix = torch.zeros(3, 3, dtype=torch.int64)
    decisions = torch.zeros(3, 4, dtype=torch.int64)
    for actual, scores in zip(labels.tolist(), probabilities.tolist(), strict=True):
        matrix[actual, max(range(3), key=scores.__getitem__)] += 1
        decision = choose_age(dict(zip(CLASSES, scores, strict=True)))
        decisions[actual, CLASSES.index(decision) if decision in CLASSES else 3] += 1
    support = matrix.sum(1)
    recalls = [matrix[i, i].item() / support[i].item() if support[i] else None for i in range(3)]
    present = [value for value in recalls if value is not None]
    return {'support': support.tolist(), 'confusion_matrix_actual_rows': matrix.tolist(),
            'recall_argmax': dict(zip(CLASSES, recalls, strict=True)),
            'balanced_accuracy_present_classes': sum(present) / len(present),
            'decisions_columns_adult_child_infant_unknown': decisions.tolist(),
            'routed_to_real': routing.sum().item() if routed else 0}


before = {name: evaluate(pair) for name, pair in data.items() if not name.endswith('train')}
after = {name: evaluate(pair, True) for name, pair in data.items() if not name.endswith('train')}
report = {'complete': True, 'classes': CLASSES, 'gate_epoch': epoch_selected,
          'gate_validation_balanced_accuracy': best, 'baseline': before, 'adapted': after,
          'real_video_splits': adapted['adaptation']['real_video_splits'],
          'limitations': ['Assistant visual crop labels are preliminary; real adult/infant validation is absent.',
                         'Real test contains seven correlated crops from one video, not seven independent subjects.',
                         'Synthetic test was inspected during model development; this is a regression check, not a fresh benchmark.',
                         'The learned domain gate can fail on unfamiliar cameras or image styles.']}
passed = after['real_val']['balanced_accuracy_present_classes'] > before['real_val']['balanced_accuracy_present_classes']
passed &= all(after['synthetic_test']['recall_argmax'][label] >= before['synthetic_test']['recall_argmax'][label] - .01 for label in CLASSES)
report['regression_guard_passed'] = passed
(out / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
if not passed:
    raise RuntimeError('Domain routing failed regression checks; no checkpoint promoted')
checkpoint = {**baseline, 'format_version': 2, 'domain_adapter': {'version': 1, 'real_head_state': real.state_dict(),
              'gate_state': gate.state_dict(), 'feature_mean': mean, 'feature_scale': scale},
              'adaptation': {'real_checkpoint': 'runs/age-real-adapted-20261002/best.pt',
                             'real_video_splits': report['real_video_splits'], 'domain_gate_epoch': epoch_selected}}
torch.save(checkpoint, out / 'best.pt')
print(json.dumps(report), flush=True)
