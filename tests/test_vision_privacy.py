import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import numpy as np

from src.vision.privacy import FaceBlurrer, blur_boxes


class FacePrivacyTest(unittest.TestCase):
    def test_blur_changes_only_roi_and_preserves_source(self):
        rng = np.random.default_rng(68)
        frame = rng.integers(0, 256, (80, 100, 3), dtype=np.uint8)
        original = frame.copy()
        result = blur_boxes(frame, [[20, 20, 60, 60], [200, 0, 220, 10]])
        np.testing.assert_array_equal(frame, original)
        np.testing.assert_array_equal(result[:20], original[:20])
        self.assertLess(result[30:50, 30:50].var(), original[30:50, 30:50].var() / 10)

    def test_clipped_edge_and_no_faces(self):
        frame = np.random.default_rng(1).integers(0, 256, (20, 20, 3), dtype=np.uint8)
        np.testing.assert_array_equal(blur_boxes(frame, []), frame)
        result = blur_boxes(frame, [[-5, -5, 5, 5], [3, 3, 2, 2]])
        self.assertFalse(np.array_equal(result[:5, :5], frame[:5, :5]))
        np.testing.assert_array_equal(result[5:], frame[5:])

    def test_scaling_hold_and_expiry(self):
        detector = Mock()
        face = np.zeros((1, 15), dtype=np.float32)
        face[0, :4] = [10, 10, 20, 20]
        detector.detect.side_effect = [(1, face), (0, None), (0, None)]
        with tempfile.TemporaryDirectory() as folder:
            model = Path(folder) / "fixture.onnx"
            model.touch()
            with patch("src.vision.privacy.cv2.FaceDetectorYN.create", return_value=detector):
                blurrer = FaceBlurrer(model, max_width=100, hold_frames=1)
        frame = np.zeros((100, 200, 3), dtype=np.uint8)
        _, first = blurrer.apply(frame)
        self.assertEqual(first["masked_boxes"], [[16, 16, 64, 64]])
        _, held = blurrer.apply(frame)
        self.assertEqual(held["detected_faces"], 0)
        self.assertEqual(held["masked_boxes"], first["masked_boxes"])
        _, expired = blurrer.apply(frame)
        self.assertEqual(expired["masked_boxes"], [])

    def test_moving_face_replaces_old_mask(self):
        detector = Mock()
        faces = []
        for x in (20, 25, 30):
            face = np.zeros((1, 15), dtype=np.float32)
            face[0, :4] = [x, 20, 20, 30]
            faces.append((1, face))
        detector.detect.side_effect = faces
        with tempfile.TemporaryDirectory() as folder:
            model = Path(folder) / "fixture.onnx"
            model.touch()
            with patch("src.vision.privacy.cv2.FaceDetectorYN.create", return_value=detector):
                blurrer = FaceBlurrer(model)
        frame = np.zeros((100, 100, 3), dtype=np.uint8)
        for x in (20, 25, 30):
            _, metadata = blurrer.apply(frame)
            self.assertEqual(metadata["masked_boxes"], [[x - 2, 17, x + 22, 53]])

    def test_smooth_oval_preserves_corners(self):
        frame = np.random.default_rng(3).integers(0, 256, (80, 80, 3), dtype=np.uint8)
        result = blur_boxes(frame, [[0, 0, 80, 80]])
        np.testing.assert_array_equal(result[:10, :10], frame[:10, :10])
        self.assertLess(result[25:55, 25:55].var(), frame[25:55, 25:55].var() / 10)
        self.assertGreater(np.unique(result[25:55, 25:55].reshape(-1, 3), axis=0).shape[0], 10)


if __name__ == "__main__":
    unittest.main()
