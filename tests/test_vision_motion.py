"""Motion tests run independently of API fixtures with unittest."""

import unittest

import numpy as np

from src.vision.motion import MotionDetector


class MotionTest(unittest.TestCase):
    def settled(self):
        detector = MotionDetector(warmup_frames=5)
        frame = np.full((120, 160, 3), 60, dtype=np.uint8)
        for _ in range(10):
            result, mask = detector.update(frame)
        return detector, frame, result, mask

    def test_static_scene_and_warmup(self):
        detector = MotionDetector(warmup_frames=5)
        frame = np.full((120, 160, 3), 60, dtype=np.uint8)
        result, mask = detector.update(frame)
        self.assertEqual(result["status"], "warming_up")
        self.assertIsNone(result["has_motion"])
        self.assertIsNone(detector.for_box(mask, [0, 0, 50, 50], result["status"])["moving"])
        for _ in range(10):
            result, _ = detector.update(frame)
        self.assertEqual(result["status"], "ready")
        self.assertFalse(result["has_motion"])

    def test_foreground_is_localized_to_box(self):
        detector, frame, _, _ = self.settled()
        frame[30:70, 40:80] = 240
        result, mask = detector.update(frame)
        self.assertTrue(result["has_motion"])
        self.assertTrue(detector.for_box(mask, [40, 30, 80, 70])["moving"])
        self.assertFalse(detector.for_box(mask, [100, 80, 150, 110])["moving"])
        self.assertEqual(detector.for_box(mask, [-20, -20, 0, 0]), {"motion_ratio": None, "moving": None})
        self.assertIsNone(detector.for_box(mask, [float("nan"), 0, 10, 10])["moving"])

    def test_noise_global_change_and_resolution_reset(self):
        detector, frame, _, _ = self.settled()
        frame[20, 20] = 240
        result, _ = detector.update(frame)
        self.assertFalse(result["has_motion"])
        result, _ = detector.update(np.full_like(frame, 240))
        self.assertEqual(result["status"], "global_change")
        self.assertIsNone(result["has_motion"])
        result, _ = detector.update(np.zeros((60, 80, 3), dtype=np.uint8))
        self.assertEqual(result["status"], "warming_up")

    def test_invalid_settings(self):
        for kwargs in ({"warmup_frames": 0}, {"min_area_ratio": 0}, {"moving_threshold": 2}):
            with self.assertRaises(ValueError):
                MotionDetector(**kwargs)

    def test_downscale_maps_motion_to_source_coordinates(self):
        detector = MotionDetector(warmup_frames=2, max_width=80)
        frame = np.full((240, 320, 3), 60, dtype=np.uint8)
        for _ in range(10):
            detector.update(frame)
        frame[80:160, 120:200] = 240
        result, mask = detector.update(frame)
        self.assertEqual(mask.shape, (240, 320))
        self.assertTrue(detector.for_box(mask, [120, 80, 200, 160])["moving"])
        self.assertFalse(detector.for_box(mask, [0, 0, 60, 60])["moving"])
        box = result["regions"][0]["bbox"]
        self.assertLessEqual(box[0], 130)
        self.assertGreaterEqual(box[2], 190)

    def test_shadow_is_excluded_and_ratio_counts_pixels(self):
        detector, frame, _, _ = self.settled()
        frame[30:70, 40:80] = 30
        result, _ = detector.update(frame)
        self.assertFalse(result["has_motion"])
        mask = np.zeros((10, 10), dtype=np.uint8)
        mask[:2, :2] = 255
        measured = detector.for_box(mask, [-5, -5, 10, 10])
        self.assertAlmostEqual(measured["motion_ratio"], 0.04)
        self.assertTrue(measured["moving"])


if __name__ == "__main__":
    unittest.main()
