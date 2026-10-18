"""In-memory preview adapter for BaoTam's YuNet face blurrer.

No downloads, raw-image fallback or persistence. Detection misses are possible;
PROCESSED means the masking pass completed, not guaranteed anonymization.
"""
import base64
import hashlib
import math
import os
from pathlib import Path
from time import perf_counter

from src.config import APP_ROOT

MODEL_SHA256 = '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4'
# services/api/src/vision/preview.py -> repository root
DEFAULT_MODEL = APP_ROOT / 'models' / 'face_detection_yunet_2023mar.onnx'


class FacePreview:
    def __init__(self, *, blurrer=None):
        if blurrer is None:
            from src.vision.privacy import FaceBlurrer
            path = Path(os.environ.get('FACE_MODEL_PATH', str(DEFAULT_MODEL)))
            if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != MODEL_SHA256:
                raise ValueError('Pinned local YuNet artifact unavailable or checksum mismatch')
            blurrer = FaceBlurrer(path)
        self.blurrer = blurrer

    def __call__(self, image_bytes, *, detections=None, clip_sample=False):
        import cv2
        import numpy as np
        started = perf_counter()
        frame = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError('Cannot decode preview image')
        if detections is not None and hasattr(self.blurrer, 'history'):
            self.blurrer.history.clear()
        processed, metadata = self.blurrer.apply(frame)
        method = 'YUNET_SOFT_OVAL'
        fallback = []
        if detections is not None:
            # Independent REST frames/sessions must not inherit another frame's face history.
            regions = head_regions(detections, frame.shape[1], frame.shape[0])
            if regions is None and clip_sample:
                # Show build (owner decision 2026-10-18, non-commercial demo): the bundled sample clips are public footage already in the page.
                # With no detection box a clip frame keeps only YuNet's own masks instead of a whole-frame mosaic. Uploads and cameras never reach this branch.
                method = 'CLIP_SAMPLE_PASSTHROUGH'
            elif regions is None:
                # No detector evidence is not proof that no face is present (SR-01).
                small = cv2.resize(frame, (max(1, frame.shape[1] // 26), max(1, frame.shape[0] // 26)), interpolation=cv2.INTER_AREA)
                processed = cv2.resize(small, (frame.shape[1], frame.shape[0]), interpolation=cv2.INTER_NEAREST)
                metadata['masked_boxes'] = [[0, 0, frame.shape[1], frame.shape[0]]]
                method = 'FULL_FRAME_FALLBACK'
            else:
                for rect in regions:
                    # Keep YuNet's tighter face mask when it found a face in this head region.
                    if any(rect[0] <= (b[0] + b[2]) / 2 <= rect[2] and rect[1] <= (b[1] + b[3]) / 2 <= rect[3] for b in metadata['masked_boxes']):
                        continue
                    x1, y1, x2, y2 = rect
                    _pixelate_ellipse(processed, frame, x1, y1, x2, y2)
                    fallback.append(rect)
                metadata['masked_boxes'] = [*metadata['masked_boxes'], *fallback]
                if fallback:
                    method = 'YUNET_HEAD_FALLBACK'
        ok, encoded = cv2.imencode('.jpg', processed, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not ok:
            raise ValueError('Cannot encode processed preview')
        return {
            'status': 'PROCESSED', 'method': method,
            'coverage_verified': False, 'fallback_regions': len(fallback),
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


def _pixelate_ellipse(out, src, x1, y1, x2, y2):
    """Natural-looking cover: coarse pixelation inside the ellipse inscribed in the head rectangle, feathered at the edge. Works on `out` in place."""
    import cv2
    import numpy as np
    w, h = x2 - x1, y2 - y1
    if w < 2 or h < 2:
        return
    block = max(6, round(w / 7))
    crop = src[y1:y2, x1:x2]
    small = cv2.resize(crop, (max(1, w // block), max(1, h // block)), interpolation=cv2.INTER_AREA)
    pix = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)
    mask = np.zeros((h, w), dtype=np.float32)
    cv2.ellipse(mask, (w // 2, h // 2), (max(1, w // 2 - 1), max(1, h // 2 - 1)), 0, 0, 360, 1.0, -1)
    k = max(3, (min(w, h) // 8) | 1)
    mask = cv2.GaussianBlur(mask, (k, k), 0)[..., None]
    region = out[y1:y2, x1:x2].astype(np.float32)
    out[y1:y2, x1:x2] = (pix.astype(np.float32) * mask + region * (1 - mask)).astype(np.uint8)


def head_regions(detections, width, height):
    """Top 40% of each living box, padded 15% on each head edge; None means full-frame fallback."""
    if not detections:
        return None
    regions = []
    for detection in detections:
        box = detection.get('bbox')
        if detection.get('class') not in {'person', 'cat', 'dog', 'pet', 'pet_unknown'} or not isinstance(box, (list, tuple)) or len(box) != 4:
            return None
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in box):
            return None
        x1, y1, x2, y2 = box
        if x2 <= x1 or y2 <= y1:
            return None
        dx, head = (x2 - x1) * .15, (y2 - y1) * .4
        dy = head * .15
        rect = [max(0, math.floor(x1 - dx)), max(0, math.floor(y1 - dy)), min(width, math.ceil(x2 + dx)), min(height, math.ceil(y1 + head + dy))]
        if rect[2] <= rect[0] or rect[3] <= rect[1]:
            return None
        regions.append(rect)
    return regions
