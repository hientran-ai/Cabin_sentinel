"""Boundary between model-specific inference and CabinSentinel reasoning."""

import hashlib
import logging
from collections import OrderedDict
from datetime import UTC, datetime
from pathlib import Path
from time import monotonic, perf_counter
from typing import Any, Protocol

from p068_vision.labels import DETECTION_CLASSES, object_fallback
from p068_vision.resources import ResourceLayer

logger = logging.getLogger(__name__)


class VisionProvider(Protocol):
    def infer(self, image: bytes) -> dict:
        """Return one native detector frame for a successfully decoded image."""


class TamVisionProvider:
    """Single-frame detector with configurable CPU/CUDA execution.

    An optional age classifier labels each ``person`` box as adult/child/unknown in a
    separate ``age_group`` field. The detector ``class`` stays ``person`` so occupancy
    evidence is unchanged; a missing, failed or unsure classifier yields ``unknown``.
    """

    def __init__(
        self, model_path: str | Path, *, confidence: float = 0.25,
        age_classifier: Any = None, age_load_error: str | None = None,
        resource_max_waiting: int = 4, resource_wait_timeout: float = 30.0,
        device: str = "cpu", opencv_threads: int = 4, torch_threads: int = 4,
        resource_interval: float = 1.0, half: bool = False, face_backend: str = "cpu",
        age_engine_path: str | Path | None = None,
        engine_path: str | Path | None = None, engine_imgsz: tuple[int, int] = (384, 640),
        imgsz: int = 640,
        phone_model_path: str | Path | None = None,
        items_model_path: str | Path | None = None,
        cabin_segmenter: Any = None,
        parallel_inference: bool = True,
        cabin_geometry: Any = None,
        open_vocab_model_path: str | Path | None = None,
        items_imgsz: int = 640,
        open_vocab_imgsz: int = 640,
        pet_verifier: Any = None,
        pet_override_floor: float = .5,
        pet_temporal: bool = False,
        wallet_model_path: str | Path | None = None,
        wallet_imgsz: int = 960,
        person_rescue_model_path: str | Path | None = None,
        person_rescue_sizes: tuple[int,...] = (960,1280),
        person_rescue_confidence: float = .07,
        person_rescue_iou: float = .6,
        grounded_person_model_path: str | Path | None = None,
        grounded_person_confidence: float = .1,
    ):
        if device != "cpu":
            import torch
            if device == "auto":
                device = "cuda:0" if torch.cuda.is_available() else "cpu"
            elif not device.startswith("cuda:") or not device[5:].isdigit():
                raise ValueError("Vision device must be cpu, auto or cuda:N")
            if device.startswith("cuda:") and (
                not torch.cuda.is_available() or int(device[5:]) >= torch.cuda.device_count()
            ):
                raise RuntimeError(f"Requested Vision device unavailable: {device}")
        if (half or engine_path or age_engine_path or face_backend == "cuda") and not device.startswith("cuda:"):
            raise ValueError("FP16, TensorRT and CUDA faces require a CUDA Vision device")
        self.half = half
        self._cabin_segmenter = cabin_segmenter
        self._cabin_geometry = cabin_geometry
        self._pet_verifier = pet_verifier
        if not 0<pet_override_floor<=1:
            raise ValueError('Invalid species override floor')
        self._pet_override_floor=pet_override_floor
        self._pet_temporal=pet_temporal
        if not 0<person_rescue_iou<=1:
            raise ValueError('Invalid person rescue merge IoU')
        self._person_rescue_iou = person_rescue_iou
        self._person_rescue = None
        if person_rescue_model_path:
            from p068_vision.person_rescue import PersonRescue
            self._person_rescue = PersonRescue(person_rescue_model_path,device=device,
                sizes=person_rescue_sizes,confidence=person_rescue_confidence)
        self._grounded_person = None
        if grounded_person_model_path:
            from p068_vision.grounded_person import GroundedPerson
            self._grounded_person=GroundedPerson(grounded_person_model_path,device=device,
                confidence=grounded_person_confidence)
        from p068_vision.parallel import FrameBranches
        self._branches = FrameBranches(parallel_inference)
        self.engine_path = str(engine_path) if engine_path else None
        self.device = device
        self._opencv_threads = opencv_threads
        self._torch_threads = torch_threads
        if any(isinstance(v,bool) or not isinstance(v,int) or v < 32 or v % 32 for v in (items_imgsz,open_vocab_imgsz,wallet_imgsz)):
            raise ValueError('Specialist image sizes must be positive multiples of 32')
        self._items_imgsz, self._open_imgsz = items_imgsz, open_vocab_imgsz
        self._wallet_imgsz = wallet_imgsz
        self.resources = ResourceLayer(max_waiting=resource_max_waiting, wait_timeout=resource_wait_timeout,
                                       sample_interval=resource_interval)
        path = Path(model_path)
        ncnn = path.is_dir() and path.name.endswith('_ncnn_model')
        if not path.is_file() and not ncnn:
            raise FileNotFoundError(f"MODEL_PATH is not a local model file or NCNN directory: {path}")
        if isinstance(imgsz, bool) or not isinstance(imgsz, int) or imgsz < 32 or imgsz % 32:
            raise ValueError('Vision imgsz must be a positive multiple of 32')
        if ncnn:
            if device != 'cpu' or half or engine_path:
                raise ValueError('NCNN profile requires CPU without TensorRT or Torch FP16')
            if not all((path/name).is_file() for name in ('model.ncnn.param','model.ncnn.bin','metadata.yaml')):
                raise FileNotFoundError('Incomplete NCNN model directory')
            import yaml
            metadata = yaml.safe_load((path/'metadata.yaml').read_text(encoding='utf-8'))
            shape = metadata.get('imgsz')
            if shape != [imgsz,imgsz]:
                raise ValueError(f'NCNN exported shape {shape} does not match configured imgsz {imgsz}')
            names = metadata.get('names', {})
            if metadata.get('task') != 'detect' or any(names.get(i) != n for i,n in ((0,'person'),(15,'cat'),(16,'dog'))):
                raise ValueError('NCNN metadata must preserve the COCO person/cat/dog detection schema')
        if not 0 < confidence <= 1:
            raise ValueError("MODEL_CONFIDENCE must be in (0, 1]")
        from ultralytics import YOLO

        self._wallet_model = None
        if wallet_model_path:
            if not Path(wallet_model_path).is_file():
                raise FileNotFoundError('Local wallet model required')
            self._wallet_model = YOLO(str(wallet_model_path))
            self._wallet_classes = [i for i,n in self._wallet_model.names.items() if n == 'wallet']
            if not self._wallet_classes:
                raise ValueError('Wallet checkpoint must name its wallet class')

        self._open_model = None
        if open_vocab_model_path:
            if not Path(open_vocab_model_path).is_file():
                raise FileNotFoundError('Local baked open-vocabulary model required')
            from ultralytics import YOLOE
            self._open_model = YOLOE(str(open_vocab_model_path))
            from p068_vision.labels import PERSONAL_ITEM_LABELS
            self._open_classes = [i for i,n in self._open_model.names.items() if n in PERSONAL_ITEM_LABELS]
            if not self._open_classes:
                raise ValueError('Open-vocabulary checkpoint has no supported item labels')

        self._phone_model = None
        self._phone_classes = []
        specialist_path = items_model_path or phone_model_path
        self._specialist_source = 'items_specialist' if items_model_path else 'phone_specialist'
        if specialist_path:
            phone_path = Path(specialist_path)
            if not phone_path.is_file():
                raise FileNotFoundError(f"Item specialist model is not a local file: {phone_path}")
            self._phone_model = YOLO(str(phone_path))
            from p068_vision.labels import PERSONAL_ITEM_LABELS
            supported = PERSONAL_ITEM_LABELS if items_model_path else {'cell phone'}
            self._phone_classes = [i for i, name in self._phone_model.names.items() if name in supported]
            if not self._phone_classes:
                raise ValueError('Item specialist must include supported personal-item classes')

        if engine_path:
            engine = Path(engine_path)
            if not engine.is_file():
                raise FileNotFoundError(f"TensorRT engine not a local file: {engine}")
            if any(v < 32 or v % 32 for v in engine_imgsz):
                raise ValueError("TensorRT input dimensions must be multiples of 32")
            import tensorrt  # noqa: F401 - fail before auto-install paths in Ultralytics
            self._model = YOLO(str(engine), task="detect")
        else:
            self._model = YOLO(str(path), task='detect') if ncnn else YOLO(str(path))
        self._options = {
            "classes": DETECTION_CLASSES,
            "device": device, "conf": confidence,
            "imgsz": imgsz, "verbose": False,
        }
        if half:
            self._options["quantize"] = 16
        if engine_path:
            self._options["imgsz"] = list(engine_imgsz)
        self._age = age_classifier
        self._streams = OrderedDict()
        self._age_load_error = age_load_error
        if self._age is not None and callable(getattr(self._age, "to", None)):
            self._age.to(device)
        if self._age is not None and callable(getattr(self._age, "set_precision", None)):
            self._age.set_precision(half)
        if self._age is not None and callable(getattr(self._age, "set_face_backend", None)):
            self._age.set_face_backend(face_backend, device)
        if age_engine_path:
            if self._age is None:
                raise ValueError("TensorRT age engine requires an age classifier")
            self._age.use_tensorrt_engine(age_engine_path, device)
        self._configure_threads()
        self.resources.start_sampling()

    def _configure_threads(self):
        import sys
        cv2 = sys.modules.get("cv2")
        torch = sys.modules.get("torch")
        if cv2 is not None and callable(getattr(cv2, "setNumThreads", None)):
            if not callable(getattr(cv2, "getNumThreads", None)) or cv2.getNumThreads() != self._opencv_threads:
                cv2.setNumThreads(self._opencv_threads)
        if torch is not None and callable(getattr(torch, "set_num_threads", None)):
            if not callable(getattr(torch, "get_num_threads", None)) or torch.get_num_threads() != self._torch_threads:
                torch.set_num_threads(self._torch_threads)
        predictor = getattr(self._model, 'predictor', None)
        backend = getattr(getattr(predictor, 'model', None), 'backend', None)
        net = getattr(backend, 'net', None)
        if net is not None:
            net.opt.num_threads = self._torch_threads

    @property
    def age_status(self) -> str:
        if self._age is not None:
            return "ok"
        return "load_failed" if self._age_load_error else "disabled"

    @staticmethod
    def _crop_rect(padded_box, bbox, frame):
        """The padded rectangle the classifier crops, recorded for tracing (None if unavailable)."""
        try:
            rect = padded_box(bbox, frame.shape[1], frame.shape[0])
            return list(rect) if rect else None
        except Exception:
            return None

    def close(self):
        self.resources.close()
        if getattr(self, '_branches', None) is not None:
            self._branches.close()
        if hasattr(self, '_streams'):
            self._streams.clear()
        self._model = None
        self._phone_model = None
        self._open_model = None
        self._pet_verifier = None
        self._wallet_model = None
        if self._age is not None and callable(getattr(getattr(self._age, "face_detector", None), "close", None)):
            self._age.face_detector.close()
        self._age = None
        self._person_rescue = None
        self._grounded_person = None

    def infer_with_privacy(self, image: bytes) -> dict:
        return self.infer(image, include_privacy=True)

    def infer_with_context(self, image: bytes, *, stream_id=None, camera_id=None):
        """Share this request's decoded pixels without putting raw pixels in JSON."""
        from p068_vision.decoded_image import DecodedImage

        with self.resources.execution() as telemetry:
            decoded = DecodedImage.decode(image)
            frame = self._infer(image, include_privacy=True, decoded_frame=decoded.pixels, stream_id=stream_id,
                                **({'camera_id': camera_id} if camera_id is not None else {}))
        frame["resources"] = telemetry
        return frame, decoded

    def infer_frame_with_context(self, pixels, *, stream_id=None, camera_id=None):
        """Local camera path: retain privacy identity without a JPEG round trip."""
        from p068_vision.decoded_image import DecodedImage

        with self.resources.execution() as telemetry:
            decoded = DecodedImage.from_bgr(pixels)
            frame = self._infer(decoded.source, include_privacy=True, decoded_frame=decoded.pixels, stream_id=stream_id,
                                **({'camera_id': camera_id} if camera_id is not None else {}))
        frame["resources"] = telemetry
        return frame, decoded

    def infer(self, image: bytes, *, include_privacy=False, stream_id=None, camera_id=None) -> dict:
        with self.resources.execution() as telemetry:
            frame = self._infer(image, include_privacy=include_privacy, stream_id=stream_id,
                                **({'camera_id': camera_id} if camera_id is not None else {}))
        frame["resources"] = telemetry
        return frame

    def _infer(self, image: bytes, *, include_privacy=False, decoded_frame=None, stream_id=None, camera_id=None) -> dict:
        import cv2
        import numpy as np

        decoded = (cv2.imdecode(np.frombuffer(image, dtype=np.uint8), cv2.IMREAD_COLOR)
                   if decoded_frame is None else decoded_frame)
        if decoded is None:
            raise ValueError("Cannot decode image for Vision inference")
        started = perf_counter()
        branches = {'detector': lambda: self._model.predict(decoded, **self._options)[0]}
        if self._phone_model is not None:
            branches['items'] = lambda: self._phone_model.predict(
                decoded, classes=self._phone_classes, device=self.device,
                imgsz=getattr(self,'_items_imgsz',640), conf=0.5, verbose=False)[0]
        if getattr(self, '_open_model', None) is not None:
            branches['open_items'] = lambda: self._open_model.predict(
                decoded, classes=self._open_classes, device=self.device,
                imgsz=getattr(self,'_open_imgsz',640), conf=0.5, verbose=False)[0]
        if (getattr(self._age, 'input_kind', None) == 'face'
                and callable(getattr(self._age, 'detect_frame_faces', None))):
            branches['faces'] = lambda: self._age.detect_frame_faces(decoded, privacy=include_privacy)
        if getattr(self,'_person_rescue',None) is not None:
            branches['person_rescue'] = lambda: self._person_rescue.predict(decoded)
        if getattr(self,'_grounded_person',None) is not None:
            branches['grounded_person'] = lambda: self._grounded_person.predict(decoded)
        if getattr(self, '_wallet_model', None) is not None:
            branches['wallet'] = lambda: self._wallet_model.predict(
                decoded, classes=self._wallet_classes, device=self.device,
                imgsz=self._wallet_imgsz, conf=.5, verbose=False)[0]
        segmenter = getattr(self, '_cabin_segmenter', None)
        if segmenter is not None and callable(getattr(segmenter, 'predict', None)):
            branches['segmentation'] = lambda: segmenter.predict(decoded)
        runner = getattr(self, '_branches', None)
        if runner is None:
            from p068_vision.parallel import FrameBranches
            runner = FrameBranches(False)
        initial = runner.run(branches)
        if initial['detector']['error'] is not None:
            raise initial['detector']['error']
        result = initial['detector']['value']
        self._configure_threads()  # YOLO predictor setup may reset OpenCV threads.
        detector_ms = initial['detector']['latency_ms']
        from p068_vision.belongings import BELONGING_IDS
        allowed = {'person', 'cat', 'dog', *BELONGING_IDS.values()}
        if hasattr(result.boxes, "data"):
            # One result transfer, avoiding CUDA synchronization per field/box.
            rows = result.boxes.data.cpu().tolist()
            detections = [object_fallback({
                "class": result.names[int(row[5])], "confidence": float(row[4]), "bbox": row[:4],
            }) for row in rows if result.names[int(row[5])] in allowed]
        else:
            detections = [
                object_fallback({
                    "class": result.names[int(box.cls.item())],
                    "confidence": float(box.conf.item()),
                    "bbox": box.xyxy[0].tolist(),
                })
                for box in result.boxes
                if result.names[int(box.cls.item())] in allowed
            ]
        from p068_vision.labels import user_visible_detection
        detections = [d for d in detections if user_visible_detection(d)]
        for branch,source in (('items', getattr(self,'_specialist_source','items_specialist')),
                              ('open_items','open_vocabulary'),('wallet','wallet_specialist')):
            if branch not in initial:
                continue
            phones = initial[branch]['value']
            if initial[branch]['error'] is not None:
                logger.error('Item branch failed: %s', initial[branch]['error'])
            from p068_vision.tracking import iou
            for row in ([] if phones is None else phones.boxes.data.cpu().tolist()):
                box = row[:4]
                label = phones.names[int(row[5])]
                item = {'class': label, 'confidence': float(row[4]), 'bbox': box,
                        'detector_source': source}
                if user_visible_detection(item):
                    detections.append(item)
            # Merge both detectors with same-class NMS. A missed specialist item
            # must not discard main-model evidence; overlapping items appear once.
            living = [d for d in detections if d['class'] in {'person', 'cat', 'dog'}]
            items = sorted((d for d in detections if d['class'] not in {'person', 'cat', 'dog'}),
                           key=lambda d: d['confidence'], reverse=True)
            kept_items = []
            for item in items:
                if not any(d['class'] == item['class'] and iou(d['bbox'], item['bbox']) >= .5
                           for d in kept_items):
                    kept_items.append(item)
            detections = living + kept_items
        from p068_vision.tracking import suppress_person_duplicates
        body_rescue_active = 'person_rescue' in initial and initial['person_rescue']['error'] is None
        grounded_active = 'grounded_person' in initial and initial['grounded_person']['error'] is None
        rescue_active = body_rescue_active or grounded_active
        if body_rescue_active:
            from p068_vision.person_rescue import merge_person_proposals
            detections.extend(initial['person_rescue']['value'])
            detections = merge_person_proposals(detections,self._person_rescue_iou)
        else:
            detections = suppress_person_duplicates(detections)
        face_search_detections=detections+(initial['grounded_person']['value'] if grounded_active else [])
        face_options, face_evidence = {}, None
        face_started = perf_counter()
        if getattr(self._age, "input_kind", "person") == "face":
            try:
                if callable(getattr(self._age, "detect_frame_faces", None)):
                    detect_faces = getattr(self._age, 'detect_pipeline_faces', None)
                    shared_faces = getattr(self._age, 'detect_shared_pipeline_faces', None)
                    if callable(shared_faces) and 'faces' in initial and initial['faces']['error'] is None:
                        faces = shared_faces(decoded, face_search_detections, initial['faces']['value'], privacy=include_privacy)
                    else:
                        faces = (detect_faces(decoded, face_search_detections, privacy=include_privacy) if callable(detect_faces)
                                 else initial['faces']['value'] if 'faces' in initial and initial['faces']['error'] is None
                                 else self._age.detect_frame_faces(decoded, privacy=include_privacy))
                    # Independent full-frame search covers faces outside person
                    # ROIs too, including people behind windows. ROI search can
                    # still rescue small faces at native resolution.
                    if not callable(shared_faces) and 'faces' in initial and initial['faces']['error'] is None:
                        from p068_vision.tracking import iou
                        faces = list(faces)
                        for candidate in initial['faces']['value']:
                            x,y,w,h = map(float, candidate[:4])
                            if not any(iou([x,y,x+w,y+h], [float(f[0]),float(f[1]),
                                       float(f[0]+f[2]),float(f[1]+f[3])]) >= .5 for f in faces):
                                faces.append(candidate)
                    from p068_vision.privacy import _animal_only
                    animals = [d['bbox'] for d in detections if d['class'] in {'cat','dog','pet_unknown'}]
                    humans = [d['bbox'] for d in detections if d['class'] == 'person']
                    faces = [f for f in faces if not _animal_only(
                        [float(f[0]),float(f[1]),float(f[0]+f[2]),float(f[1]+f[3])],animals,humans)]
                    face_options = {"faces": self._age.age_faces(faces)}
                    if include_privacy:
                        face_evidence = {
                            "image_sha256": hashlib.sha256(image).hexdigest(),
                            "model_sha256": self._age.face_model_sha256,
                            "width": decoded.shape[1], "height": decoded.shape[0],
                            "faces": [face.tolist() for face in faces],
                            "animal_boxes": [d['bbox'] for d in detections if d['class'] in {'cat', 'dog'}],
                            "person_boxes": [d['bbox'] for d in detections if d['class'] == 'person'],
                        }
                detections.extend(self._age.face_only_people(decoded, detections, **face_options))
                from p068_vision.tracking import merge_face_rescue_duplicates
                detections = merge_face_rescue_duplicates(detections, face_options.get('faces'),
                    **({'preserve_body_proposals':True} if rescue_active else {}))
            except Exception:
                logger.exception("Face-only person detection failed; keeping YOLO evidence")
        if face_evidence is not None and grounded_active:
            face_evidence['animal_filter_person_boxes']=[d['bbox'] for d in detections if d['class']=='person']
        if grounded_active:
            from p068_vision.grounded_person import append_grounded_people
            detections=append_grounded_people(detections,initial['grounded_person']['value'])
        face_ms = (perf_counter() - face_started) * 1000 + initial.get('faces', {}).get('latency_ms', 0)
        segmentation_status, segmentation_ms = 'disabled', 0.0
        segmenter = getattr(self, '_cabin_segmenter', None)
        if segmenter is not None:
            segmentation_started = perf_counter()
            try:
                if 'segmentation' in initial:
                    if initial['segmentation']['error'] is not None:
                        raise initial['segmentation']['error']
                    from p068_vision.cabin_segmentation import context_for_box
                    for detection in detections:
                        detection['segmentation_context'] = context_for_box(
                            initial['segmentation']['value'], detection['bbox'])
                else:
                    segmenter.annotate(decoded, detections)
                segmentation_status = 'advisory'
            except Exception:
                logger.exception('Cabin segmentation failed; retaining all detections')
                for detection in detections:
                    detection.pop('segmentation_context', None)
                segmentation_status = 'error'
            segmentation_ms = (perf_counter() - segmentation_started) * 1000
            segmentation_ms += initial.get('segmentation', {}).get('latency_ms', 0)
        geometry = getattr(self, '_cabin_geometry', None)
        if geometry is not None:
            for detection in detections:
                detection['cabin_membership'] = geometry.evidence(
                    detection['bbox'], decoded.shape[1::-1], camera_id=camera_id)
        age_status, age_ms = self.age_status, 0.0
        people = [d for d in detections if d["class"] == "person"]
        for detection in people:
            detection.update(age_group="unknown", age_scores=None)
        dependent = {}
        verifier = getattr(self, '_pet_verifier', None)
        if verifier is not None:
            dependent['species'] = lambda: verifier.annotate(decoded, detections, retain_on_abstention=True,
                override_floor=getattr(self,'_pet_override_floor',.5))
        if self._age is not None and people:
            dependent['age'] = lambda: self._age.classify(decoded, [d['bbox'] for d in people], **face_options)
        second = runner.run(dependent)
        initial.update(second)
        if verifier is not None and second['species']['error'] is None:
            from p068_vision.tracking import suppress_pet_duplicates
            # Keep overlapping different species distinct. Reconciled same-species
            # proposals for one pet must not create competing temporal IDs.
            detections=suppress_pet_duplicates(detections,.6,same_species_only=True)
        if self._age is not None and people:
            age_started = perf_counter()
            try:
                from p068_vision.age import padded_box  # once per frame, only when a classifier is set

                # The original decoded frame is classified; nothing blurred is ever used here.
                if second['age']['error'] is not None:
                    raise second['age']['error']
                answers = second['age']['value']
                if len(answers) != len(people):
                    raise ValueError("age classifier returned a different number of answers")
                for detection, answer in zip(people, answers, strict=True):
                    detection.update(answer)
                    detection.setdefault("age_crop", None if getattr(self._age, "input_kind", "person") == "face"
                                         else self._crop_rect(padded_box, detection["bbox"], decoded))
            except Exception:
                logger.exception("Age classification failed; people stay age_group=unknown")
                age_status = "error"
                for detection in people:
                    detection.update(age_group="unknown", age_scores=None)
            age_ms = (perf_counter() - age_started) * 1000 + second['age']['latency_ms']
        from p068_vision.tracking import TemporalTracker
        now = monotonic()
        # Stateless requests never share IDs. Explicit streams have bounded,
        # resolution-specific state, updated under ResourceLayer's execution lock.
        shape = decoded.shape[:2]
        if stream_id is None:
            tracker = TemporalTracker(30)
        else:
            if not isinstance(stream_id, str) or not stream_id or len(stream_id) > 256:
                raise ValueError('Invalid Vision stream ID')
            self._streams = OrderedDict((k, v) for k, v in self._streams.items() if now-v[2] <= 30)
            state = self._streams.pop(stream_id, None)
            tracker = state[0] if state and state[1] == shape else TemporalTracker(30,max_gap_seconds=30)
            self._streams[stream_id] = (tracker, shape, now)
            while len(self._streams) > 128:
                self._streams.popitem(last=False)
        motion, motion_answers = tracker.update(detections, now)
        for index, answer in motion_answers.items():
            detections[index].update(answer)
        if stream_id is not None and verifier is not None and getattr(self,'_pet_temporal',False):
            from p068_vision.pet_temporal import PetTemporal
            if not hasattr(tracker,'_pet_evidence'):
                tracker._pet_evidence=PetTemporal(max_gap_seconds=30)
            tracker._pet_evidence.update(detections,now)
        if stream_id is not None and self._age is not None and hasattr(self._age, 'child_threshold'):
            from p068_vision.age_fusion import TemporalAgeEvidence
            if not hasattr(tracker, '_age_evidence'):
                tracker._age_evidence = TemporalAgeEvidence()
            tracker._age_evidence.update(detections, now, self._age.child_threshold, self._age.adult_threshold)
        latency_ms = (perf_counter() - started) * 1000
        if include_privacy:
            if face_evidence is None:
                from p068_vision.preview import MODEL_SHA256
                face_evidence = dict(image_sha256=hashlib.sha256(image).hexdigest(),
                                     model_sha256=MODEL_SHA256,
                                     width=decoded.shape[1], height=decoded.shape[0], faces=None)
            face_evidence['person_boxes'] = [d['bbox'] for d in detections if d['class'] == 'person']
            face_evidence['animal_boxes'] = [d['bbox'] for d in detections if d['class'] in {'cat','dog','pet_unknown'}]
        return {
            "timestamp": datetime.now(UTC).isoformat(), "frame_id": 1,
            "detections": detections, "latency_ms": latency_ms,
            "detector_latency_ms": detector_ms, "age_latency_ms": age_ms,
            "face_latency_ms": face_ms,
            'branches': {name: {'latency_ms': r['latency_ms'],
                               'status': 'error' if r['error'] is not None else 'ok'}
                         for name,r in initial.items()},
            **({'cabin_segmentation': {'status': segmentation_status,
                                      'latency_ms': segmentation_ms, 'advisory_only': True}}
               if segmenter is not None else {}),
            "pipeline_version": 3, "motion": motion,
            **({"_face_evidence": face_evidence} if face_evidence is not None else {}),
            "age_classifier": {
                "status": age_status,
                **(self._age.describe() if self._age is not None else {}),
                **({"error": self._age_load_error} if self._age_load_error else {}),
            },
        }
