"""Vision tests isolated from API/LLM fixtures; run with unittest."""

import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
import torch
from PIL import Image

from src.vision.age import AgeClassifier, apply_age, build_model, choose_age, choose_group, padded_box
from src.vision.prepare_sviro import labelled_boxes, prepare, scene_info, split_for


class AgeDecisionsTest(unittest.TestCase):
    def test_abstention_and_threshold_boundaries(self):
        self.assertEqual(choose_group(0.8), "child")
        self.assertEqual(choose_group(0.2), "unknown")
        self.assertEqual(choose_group(0.05), "adult")
        self.assertEqual(choose_group(float("nan")), "unknown")
        with self.assertRaises(ValueError):
            choose_group(0.5, 0.4, 0.6)

    def test_merged_child_decisions(self):
        self.assertEqual(choose_age({"adult": 0.1, "child": 0.2, "infant": 0.7}), "child")
        self.assertEqual(choose_age({"adult": 0.1, "child": 0.7, "infant": 0.2}), "child")
        self.assertEqual(choose_age({"adult": 0.8, "child": 0.1, "infant": 0.1}), "unknown")
        self.assertEqual(choose_age({"adult": 0.95, "child": 0.03, "infant": 0.02}), "adult")
        with self.assertRaises(ValueError):
            choose_age({"infant": 1.0}, child_threshold=0)

        self.assertEqual(choose_age({"adult": 0.45, "child": 0.3, "infant": 0.25}), "child")

    def test_legacy_checkpoint(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "legacy.pt"
            torch.save(
                {
                    "format_version": 1,
                    "classes": ["adult", "child"],
                    "image_size": 224,
                    "crop_padding": 0.1,
                    "trained_epochs": 1,
                    "model_state": build_model(classes=["adult", "child"]).state_dict(),
                },
                path,
            )
            classifier = AgeClassifier(path)
            self.assertEqual(classifier.classes, ["adult", "child"])
            result = classifier.classify(np.zeros((64, 64, 3), dtype=np.uint8), [[0, 0, 32, 64]])
            self.assertEqual(set(result[0]["age_scores"]), {"adult", "child"})

    def test_infant_checkpoint_outputs_only_binary_scores(self):
        torch.set_num_threads(2)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "infant.pt"
            model = build_model(classes=["adult", "child", "infant"])
            with torch.no_grad():
                for parameter in model.parameters():
                    parameter.zero_()
                model.classifier[-1].bias[2] = 6
            torch.save({"format_version": 1, "classes": ["adult", "child", "infant"],
                        "image_size": 224, "crop_padding": 0.1, "trained_epochs": 1,
                        "model_state": model.state_dict()}, path)
            classifier = AgeClassifier(path)
            age = classifier.classify(np.zeros((64, 64, 3), np.uint8), [[0, 0, 64, 64]])[0]
            self.assertEqual(classifier.classes, ["adult", "child"])
            self.assertEqual(age["age_group"], "child")
            self.assertEqual(set(age["age_scores"]), {"adult", "child"})
            result = apply_age({"class": "person", "confidence": .8}, age)
            self.assertEqual(result["class"], "child")
            self.assertAlmostEqual(result["confidence"], .8 * age["age_scores"]["child"])

    def test_crop_clips_and_rejects_invalid_geometry(self):
        self.assertEqual(padded_box([-3, 0, 90, 100], 100, 100), (0, 0, 100, 100))
        self.assertIsNone(padded_box([20, 10, 10, 20], 100, 100))
        self.assertIsNone(padded_box([float("nan"), 0, 10, 10], 100, 100))
        self.assertIsNone(padded_box([200, 200, 210, 210], 100, 100))

    def test_confidences_are_not_silently_relabelled(self):
        detection = {"class": "person", "confidence": 0.8, "bbox": [0, 0, 10, 10]}
        classified = apply_age(detection, {"age_group": "child", "age_scores": {"child": 0.75, "adult": 0.25}})
        self.assertEqual(classified["class"], "child")
        self.assertAlmostEqual(classified["confidence"], 0.6)
        self.assertEqual(classified["detector_confidence"], 0.8)
        unknown = apply_age(detection, {"age_group": "unknown", "age_scores": None})
        self.assertEqual(unknown["class"], "person")
        self.assertEqual(unknown["confidence"], 0.8)
        self.assertEqual(detection["class"], "person")

    def test_checkpoint_validation_and_empty_frame(self):
        torch.set_num_threads(2)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "fixture.pt"
            saved = {
                "format_version": 1,
                "classes": ["adult", "child", "infant"],
                "image_size": 224,
                "crop_padding": 0.1,
                "trained_epochs": 0,
                "model_state": build_model(classes=["adult", "child", "infant"]).state_dict(),
            }
            torch.save(saved, path)
            with self.assertRaises(ValueError):
                AgeClassifier(path)
            # Random weights are only a serialization/inference test fixture.
            saved["trained_epochs"] = 1
            torch.save(saved, path)
            classifier = AgeClassifier(path)
            frame = np.zeros((64, 64, 3), dtype=np.uint8)
            self.assertEqual(classifier.classify(frame, []), [])
            result = classifier.classify(frame, [[0, 0, 32, 64], [30, 0, 10, 50]])
            self.assertEqual(len(result), 2)
            self.assertAlmostEqual(sum(result[0]["age_scores"].values()), 1.0, places=5)
            self.assertEqual(result[1], {"age_group": "unknown", "age_scores": None})


class SviroPreparationTest(unittest.TestCase):
    def test_person_masks_resolve_child_and_adult_not_seat_size(self):
        mask = np.full((20, 60), 226, dtype=np.uint8)
        mask[2:18, 2:18] = 29
        mask[2:18, 42:58] = 132
        records, rejected = labelled_boxes(mask, [[3, 2, 2, 17, 17], [3, 42, 2, 57, 17]], (1, 6, 3))
        self.assertEqual([r["class"] for r in records], ["child", "adult"])
        self.assertEqual(records[0]["sviro_seat_label"], 1)
        self.assertFalse(rejected)
        records, _ = labelled_boxes(mask, [[3, 2, 2, 17, 17]], (2, 6, 3))
        self.assertEqual(records[0]["class"], "child")

    def test_empty_child_seat_cannot_become_child(self):
        mask = np.full((20, 20), 226, dtype=np.uint8)
        mask[2:18, 2:18] = 29
        records, rejected = labelled_boxes(mask, [[3, 2, 2, 17, 17]], (6, 0, 0))
        self.assertEqual(records, [])
        self.assertEqual(rejected["person_mask_in_unoccupied_seat"], 1)

    def test_split_is_scene_based_and_test_never_becomes_train(self):
        car, split, scene_id, labels = scene_info("x5_train_imageID_125_GT_1_3_6")
        self.assertEqual(labels, (1, 3, 6))
        self.assertEqual(split_for(car, split, scene_id), split_for(car, split, scene_id))
        self.assertEqual(split_for(car, "test", scene_id), "test")
        self.assertTrue({"train", "val"} <= {split_for("x5", "train", str(i)) for i in range(100)})

    def test_prepare_crops_and_refuse_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / "source" / "x5" / "test_with_labels"
            for directory in ["boundingBoxes_wholeImage", "element_segmentations_wholeImage", "RGB_wholeImage"]:
                (source / directory).mkdir(parents=True)
            stem = "x5_test_imageID_0_GT_1_0_0"
            (source / "boundingBoxes_wholeImage" / (stem + ".txt")).write_text("3,2,2,17,17\n")
            mask = np.full((20, 20), 226, dtype=np.uint8)
            mask[2:18, 2:18] = 29
            Image.fromarray(mask).save(source / "element_segmentations_wholeImage" / (stem + ".png"))
            Image.new("RGB", (20, 20), (40, 80, 120)).save(source / "RGB_wholeImage" / (stem + ".png"))
            output = root / "prepared"
            report = prepare(root / "source", output)
            self.assertTrue(report["complete"])
            self.assertEqual(report["crops"], {"test/child": 1})
            row = json.loads((output / "manifest.jsonl").read_text())
            self.assertTrue((output / row["crop"]).is_file())
            self.assertEqual(row["original_split"], "test")
            with self.assertRaises(FileExistsError):
                prepare(root / "source", output)


if __name__ == "__main__":
    unittest.main()
