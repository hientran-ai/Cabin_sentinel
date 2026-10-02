import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

from src.vision.video import encode_h264


class VideoEncodingTest(unittest.TestCase):
    def test_h264_is_decodable_and_preserves_frames(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "source.mp4"
            output = Path(folder) / "h264.mp4"
            writer = cv2.VideoWriter(str(source), cv2.VideoWriter_fourcc(*"mp4v"), 25, (64, 48))
            self.assertTrue(writer.isOpened())
            for value in range(8):
                writer.write(np.full((48, 64, 3), value * 25, dtype=np.uint8))
            writer.release()
            original = source.read_bytes()
            encode_h264(source, output)
            cap = cv2.VideoCapture(str(output))
            frames = 0
            try:
                self.assertTrue(cap.isOpened())
                self.assertIn(
                    int(cap.get(cv2.CAP_PROP_FOURCC)),
                    (cv2.VideoWriter_fourcc(*"avc1"), cv2.VideoWriter_fourcc(*"h264")),
                )
                self.assertAlmostEqual(cap.get(cv2.CAP_PROP_FPS), 25)
                while True:
                    ok, frame = cap.read()
                    if not ok:
                        break
                    self.assertEqual(frame.shape, (48, 64, 3))
                    frames += 1
            finally:
                cap.release()
            self.assertEqual(frames, 8)
            self.assertEqual(source.read_bytes(), original)
            with self.assertRaises(FileExistsError):
                encode_h264(source, output)


if __name__ == "__main__":
    unittest.main()
