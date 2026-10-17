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
DEFAULT_MODEL = Path(__file__).resolve().parents[3] / 'models' / 'face_detection_yunet_2023mar.onnx'


class FacePreview:
    def __init__(self, *, blurrer=None, model_path=None):
        if blurrer is None:
            from p068_vision.privacy import FaceBlurrer
            path = Path(model_path or os.environ.get('FACE_MODEL_PATH', str(DEFAULT_MODEL)))
            if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != MODEL_SHA256:
                raise ValueError('Pinned local YuNet artifact unavailable or checksum mismatch')
            blurrer = FaceBlurrer(path, coverage='opaque')
        self.blurrer = blurrer

    def __call__(self, image_bytes, *, include_image=True, face_evidence=None, decoded_image=None):
        """Mask faces; with include_image=False only the masked boxes are returned (no JPEG encode, tiny reply)."""
        import cv2
        import numpy as np
        started = perf_counter()
        if decoded_image is not None:
            from p068_vision.decoded_image import DecodedImage
            if not isinstance(decoded_image, DecodedImage) or decoded_image.source != image_bytes:
                raise ValueError('Decoded image does not match preview request')
            frame = decoded_image.pixels
        else:
            frame = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError('Cannot decode preview image')
        if face_evidence is not None:
            if (face_evidence.get('image_sha256') != hashlib.sha256(image_bytes).hexdigest()
                    or face_evidence.get('model_sha256') != MODEL_SHA256
                    or (face_evidence.get('height'), face_evidence.get('width')) != frame.shape[:2]):
                raise ValueError('Shared face evidence does not match preview image/model')
            raw_faces = face_evidence['faces']
            faces = None if raw_faces is None else np.asarray(raw_faces, dtype=np.float32)
            if faces is not None and faces.size and (faces.ndim != 2 or faces.shape[1] != 15 or not np.isfinite(faces).all()):
                raise ValueError('Invalid shared face evidence')
            animals = face_evidence.get('animal_boxes', [])
            from p068_vision.privacy import FaceBlurrer
            if isinstance(self.blurrer, FaceBlurrer):
                processed, metadata = self.blurrer.apply(
                    frame, faces=faces, animal_boxes=animals,
                    person_boxes=face_evidence.get('animal_filter_person_boxes',
                        face_evidence.get('person_boxes', [])))
            elif animals:
                processed, metadata = self.blurrer.apply(frame, faces=faces, animal_boxes=animals)
            else:
                processed, metadata = self.blurrer.apply(frame, faces=faces)
        else:
            processed, metadata = self.blurrer.apply(frame)
        # Computed from ALL people, before cabin filtering. A missed face must
        # not silently yield an unmasked known person. Proxies are disclosed.
        from p068_vision.privacy import cover_boxes, person_privacy_fallbacks, subtract_boxes
        proxies = person_privacy_fallbacks(
            [{'class': 'person', 'bbox': b} for b in
             (face_evidence or {}).get('person_boxes', [])], metadata['masked_boxes'],
            frame.shape[1], frame.shape[0])
        proxies = subtract_boxes(proxies,(face_evidence or {}).get('animal_boxes',[]),
                                 frame.shape[1],frame.shape[0])
        if proxies:
            processed = cover_boxes(processed, proxies)
            metadata['masked_boxes'] = [*metadata['masked_boxes'], *proxies]
        result = {
            'status': 'PROCESSED', 'method': 'YUNET_OPAQUE_RECTANGLE_WITH_PERSON_FALLBACK',
            'model_sha256': MODEL_SHA256,
            'width': frame.shape[1], 'height': frame.shape[0],
            'detected_faces': metadata['detected_faces'],
            'masked_regions': len(metadata['masked_boxes']),
            'fallback_regions': len(proxies),
            'coverage_verified': False,
            # Pixel boxes (x1, y1, x2, y2) of the masked regions in this frame, so a client can keep
            # masking faces on its own full-rate video between backend previews.
            'masked_boxes': [[int(v) for v in box] for box in metadata['masked_boxes']],
        }
        if include_image:
            ok, encoded = cv2.imencode('.jpg', processed, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if not ok:
                raise ValueError('Cannot encode processed preview')
            result['data_url'] = 'data:image/jpeg;base64,' + base64.b64encode(encoded).decode('ascii')
        result['latency_ms'] = (perf_counter() - started) * 1000
        return result
