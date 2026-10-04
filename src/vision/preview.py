"""In-memory preview adapter for BaoTam's YuNet face blurrer.

No downloads, raw-image fallback or persistence. Detection misses are possible;
PROCESSED means the masking pass completed, not guaranteed anonymization.
"""
import base64
import hashlib
import os
from pathlib import Path
from time import perf_counter

MODEL_SHA256 = '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4'
DEFAULT_MODEL = Path(__file__).resolve().parents[2] / 'models' / 'face_detection_yunet_2023mar.onnx'


class FacePreview:
    def __init__(self, *, blurrer=None):
        if blurrer is None:
            from src.vision.privacy import FaceBlurrer
            path = Path(os.environ.get('FACE_MODEL_PATH', str(DEFAULT_MODEL)))
            if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != MODEL_SHA256:
                raise ValueError('Pinned local YuNet artifact unavailable or checksum mismatch')
            blurrer = FaceBlurrer(path)
        self.blurrer = blurrer

    def __call__(self, image_bytes):
        import cv2
        import numpy as np
        started = perf_counter()
        frame = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError('Cannot decode preview image')
        processed, metadata = self.blurrer.apply(frame)
        ok, encoded = cv2.imencode('.jpg', processed, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not ok:
            raise ValueError('Cannot encode processed preview')
        return {
            'status': 'PROCESSED', 'method': 'YUNET_SOFT_OVAL',
            'model_sha256': MODEL_SHA256,
            'data_url': 'data:image/jpeg;base64,' + base64.b64encode(encoded).decode('ascii'),
            'width': frame.shape[1], 'height': frame.shape[0],
            'detected_faces': metadata['detected_faces'],
            'masked_regions': len(metadata['masked_boxes']),
            # Pixel boxes (x1, y1, x2, y2) of the masked regions in this frame, so a client can keep
            # masking faces on its own full-rate video between backend previews.
            'masked_boxes': [[int(v) for v in box] for box in metadata['masked_boxes']],
            'latency_ms': (perf_counter() - started) * 1000,
        }
