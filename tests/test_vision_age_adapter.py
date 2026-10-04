"""Checkpoint compatibility and end-to-end domain expert inference."""
import copy
import tempfile
import unittest
from pathlib import Path

import numpy as np
import torch
from torch import nn

from src.vision.age import AgeClassifier, build_model


class AgeAdapterTest(unittest.TestCase):
    def checkpoint(self, bias):
        model = build_model(classes=["adult", "child", "infant"])
        with torch.no_grad():
            for parameter in model.parameters():
                parameter.zero_()
            model.classifier[-1].bias[0] = 6
        head = copy.deepcopy(model.classifier)
        with torch.no_grad():
            head[-1].bias.zero_()
            head[-1].bias[1] = 6
        width = model.classifier[0].in_features
        gate = nn.Linear(width, 1)
        with torch.no_grad():
            gate.weight.zero_()
            gate.bias.fill_(bias)
        return {
            'format_version': 2, 'classes': ['adult', 'child', 'infant'],
            'image_size': 224, 'crop_padding': .1, 'trained_epochs': 1,
            'model_state': model.state_dict(),
            'domain_adapter': {'version': 1, 'real_head_state': head.state_dict(),
                               'gate_state': gate.state_dict(), 'feature_mean': torch.zeros(width),
                               'feature_scale': torch.ones(width)},
        }

    def test_checkpoint_roundtrip_selects_each_expert_and_preserves_invalid_boxes(self):
        torch.set_num_threads(2)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'model.pt'
            for bias, label, domain in [(1, 'child', 'real'), (-1, 'adult', 'synthetic')]:
                torch.save(self.checkpoint(bias), path)
                answers = AgeClassifier(path).classify(np.zeros((64, 64, 3), np.uint8),
                                                       [[0, 0, 64, 64], [8, 8, 4, 4]])
                self.assertEqual(answers[0]['age_group'], label)
                self.assertEqual(answers[0]['age_domain'], domain)
                self.assertAlmostEqual(sum(answers[0]['age_scores'].values()), 1, places=5)
                self.assertEqual(answers[1], {'age_group': 'unknown', 'age_scores': None})

    def test_invalid_feature_normalization_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'model.pt'
            checkpoint = self.checkpoint(1)
            checkpoint['domain_adapter']['feature_scale'].zero_()
            torch.save(checkpoint, path)
            with self.assertRaisesRegex(ValueError, 'feature normalization'):
                AgeClassifier(path)

    def test_version_two_cannot_silently_fall_back_to_baseline(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'model.pt'
            checkpoint = self.checkpoint(1)
            del checkpoint['domain_adapter']
            torch.save(checkpoint, path)
            with self.assertRaises(ValueError):
                AgeClassifier(path)


if __name__ == '__main__':
    unittest.main()
