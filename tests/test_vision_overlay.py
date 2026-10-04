import unittest

import numpy as np

from src.vision.overlay import display_age, draw_detections


class OverlayTest(unittest.TestCase):
    def test_uncertain_person_has_age_label_and_marker(self):
        self.assertEqual(
            display_age({"class": "person", "age_scores": {"adult": 0.6, "child": 0.3, "infant": 0.1}}), ("adult", True)
        )
        self.assertEqual(display_age({"class": "infant"}), ("child", False))
        self.assertEqual(display_age({"class": "person", "age_scores": None}), (None, True))
        self.assertEqual(display_age({"class": "dog"}), (None, False))

    def test_scaled_box_and_source_unchanged(self):
        frame = np.zeros((100, 200, 3), dtype=np.uint8)
        detection = {"class": "child", "bbox": [100, 100, 300, 180], "moving": False}
        result = draw_detections(frame, [detection], source_size=(400, 200))
        self.assertFalse(frame.any())
        self.assertTrue(result[90, 100].any())
        self.assertFalse(result[95, 190].any())


if __name__ == "__main__":
    unittest.main()
