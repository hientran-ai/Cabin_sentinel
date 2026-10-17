import unittest
from unittest.mock import patch

import numpy as np
from p068_vision.overlay import display_age, draw_detections, draw_motion_status


class OverlayTest(unittest.TestCase):
    def test_motion_banner_without_detections_and_unknown_states(self):
        frame = np.zeros((100, 400, 3), dtype=np.uint8)
        cases = [
            (None, "MOTION: OFF (enable --motion)"),
            ({"status": "warming_up", "has_motion": None}, "MOTION: WARMING UP"),
            ({"status": "global_change", "has_motion": None}, "MOTION: UNKNOWN (camera/light change)"),
            ({"status": "ready", "has_motion": True}, "MOTION: YES"),
            ({"status": "ready", "has_motion": False}, "MOTION: NO"),
        ]
        for motion, expected in cases:
            with self.subTest(expected=expected), patch("p068_vision.overlay.cv2.putText") as put_text:
                rendered = draw_motion_status(frame, motion)
                self.assertEqual(put_text.call_args.args[1], expected)
                self.assertTrue(rendered[-10:].any())
                self.assertFalse(frame.any())

    def test_uncertain_person_has_age_label_and_marker(self):
        self.assertEqual(
            display_age({"class": "person", "age_scores": {"adult": 0.6, "child": 0.3, "infant": 0.1}}), ("adult", True)
        )
        self.assertEqual(display_age({"class": "infant"}), ("child", False))
        self.assertEqual(display_age({"class": "person", "age_scores": None}), (None, True))
        self.assertEqual(display_age({"class": "dog"}), ("dog", False))

    def test_scaled_box_and_source_unchanged(self):
        frame = np.zeros((100, 200, 3), dtype=np.uint8)
        detection = {"class": "child", "bbox": [100, 100, 300, 180], "moving": False}
        result = draw_detections(frame, [detection], source_size=(400, 200))
        self.assertFalse(frame.any())
        self.assertTrue(result[90, 100].any())
        self.assertFalse(result[95, 190].any())


if __name__ == "__main__":
    unittest.main()
