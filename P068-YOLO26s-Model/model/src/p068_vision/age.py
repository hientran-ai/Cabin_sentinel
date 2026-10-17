"""Offline person/face age classifier. Scores are not calibrated probabilities."""

import copy
import hashlib
import math
import os
from pathlib import Path

import torch
from PIL import Image
from torch import nn
from torchvision import transforms
from torchvision.models import mobilenet_v3_small

CLASSES = ["adult", "child"]
LEGACY_CLASSES = ["adult", "child", "infant"]
IMAGE_SIZE = 224
CROP_PADDING = 0.1


def padded_box(box, width, height, padding=CROP_PADDING):
    """Convert xyxy to a clipped, half-open PIL crop rectangle."""
    x1, y1, x2, y2 = map(float, box)
    if not all(math.isfinite(v) for v in (x1, y1, x2, y2)) or x2 <= x1 or y2 <= y1:
        return None
    dx, dy = (x2 - x1) * padding, (y2 - y1) * padding
    clipped = (
        max(0, math.floor(x1 - dx)),
        max(0, math.floor(y1 - dy)),
        min(width, math.ceil(x2 + dx)),
        min(height, math.ceil(y2 + dy)),
    )
    return clipped if clipped[2] > clipped[0] and clipped[3] > clipped[1] else None


def choose_group(child_score, child_threshold=0.5, adult_threshold=0.9):
    if not (0 < child_threshold <= 1 and 0 < adult_threshold <= 1):
        raise ValueError("Thresholds must be in (0, 1]")
    # Child requires p >= child_threshold; adult requires p <= 1 - adult_threshold.
    # Strict separation leaves an unknown region and rejects a shared boundary.
    if child_threshold + adult_threshold <= 1:
        raise ValueError("Child and adult decision regions must not overlap")
    if not math.isfinite(child_score) or not 0 <= child_score <= 1:
        return "unknown"
    if child_score >= child_threshold:
        return "child"
    if 1 - child_score >= adult_threshold:
        return "adult"
    return "unknown"


def image_transform(training=False):
    # Preserve the whole crop; ImageNet's center crop can discard a child's head.
    steps = [transforms.Resize((IMAGE_SIZE, IMAGE_SIZE), antialias=True)]
    if training:
        steps += [transforms.RandomHorizontalFlip(), transforms.ColorJitter(brightness=0.2, contrast=0.2)]
    return transforms.Compose(
        steps
        + [
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )


def merge_age_scores(scores):
    """Merge historical infant probability into child before making a decision."""
    # Float32 softmax parts can sum to a hair above 1 (e.g. 1.0000000152), which the range
    # check would turn into "unknown" for the most confident child/infant crops. Only
    # rounding-sized overshoot is clamped; NaN and real out-of-range values stay "unknown".
    def settle(value):
        return 1.0 if 1.0 < value <= 1.0 + 1e-6 else value

    return {"adult": settle(scores.get("adult", 0.0)),
            "child": settle(scores.get("child", 0.0) + scores.get("infant", 0.0))}


def choose_age(scores, child_threshold=0.5, adult_threshold=0.9):
    choose_group(0.5, child_threshold, adult_threshold)
    if not scores or any(not math.isfinite(value) or not 0 <= value <= 1 + 1e-6 for value in scores.values()):
        return "unknown"  # tolerance covers float32 rounding only
    merged = merge_age_scores(scores)
    return choose_group(merged["child"], child_threshold, adult_threshold)


def build_model(backbone=None, classes=None):
    model = mobilenet_v3_small(weights=None)
    if backbone is not None:
        model.load_state_dict(torch.load(backbone, map_location="cpu", weights_only=True))
    model.classifier[-1] = nn.Linear(model.classifier[-1].in_features, len(CLASSES if classes is None else classes))
    return model


def file_sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


class AgeClassifier:
    def __init__(
        self, checkpoint, child_threshold=0.5, adult_threshold=0.9, *,
        face_model_path=None, face_max_side=768,
    ):
        choose_group(0.5, child_threshold, adult_threshold)
        if isinstance(face_max_side, bool) or not isinstance(face_max_side, int) or face_max_side < 320:
            raise ValueError("face_max_side must be an integer >= 320")
        saved = torch.load(Path(checkpoint), map_location="cpu", weights_only=True)
        if (
            saved.get("format_version") not in (1, 2, 3)
            or saved.get("classes") not in (CLASSES, LEGACY_CLASSES)
            or saved.get("image_size") != IMAGE_SIZE
            or saved.get("crop_padding") != CROP_PADDING
            or saved.get("trained_epochs", 0) < 1
            or (saved.get("format_version") == 2 and not saved.get("domain_adapter"))
            or (saved.get("format_version") == 3 and (
                saved.get("input_kind") != "face" or saved.get("classes") != CLASSES
            ))
        ):
            raise ValueError("Incompatible or untrained age classifier checkpoint")
        self.classes = list(CLASSES)
        self.model_classes = saved["classes"]
        self.sha256 = file_sha256(checkpoint)
        if self.model_classes == CLASSES:
            choose_group(0.5, child_threshold, adult_threshold)
        self.model = build_model(classes=self.model_classes)
        self.model.load_state_dict(saved["model_state"])
        self.model.eval()
        self.real_head = None
        self.domain_gate = None
        adapter = saved.get("domain_adapter")
        if adapter is not None:
            if adapter.get("version") != 1:
                raise ValueError("Incompatible real-domain age adapter")
            width = self.model.classifier[0].in_features
            self.real_head = copy.deepcopy(self.model.classifier)
            self.real_head.load_state_dict(adapter["real_head_state"])
            self.real_head.eval()
            self.domain_gate = nn.Linear(width, 1)
            self.domain_gate.load_state_dict(adapter["gate_state"])
            self.domain_gate.eval()
            self.domain_mean = adapter["feature_mean"]
            self.domain_scale = adapter["feature_scale"]
            if (
                self.domain_mean.shape != (width,) or self.domain_scale.shape != (width,)
                or not torch.isfinite(self.domain_mean).all() or not torch.isfinite(self.domain_scale).all()
                or not (self.domain_scale > 0).all()
            ):
                raise ValueError("Invalid domain-adapter feature normalization")
        self.transform = image_transform()
        self.child_threshold = child_threshold
        self.adult_threshold = adult_threshold
        self.input_kind = "face" if saved.get("format_version") == 3 else "person"
        self.child_age_max = saved.get("child_age_max")
        self.face_max_side = face_max_side
        self.face_detector = None
        if self.input_kind == "face":
            import cv2
            face_path = Path(face_model_path or os.environ.get(
                "FACE_MODEL_PATH", str(Path(__file__).resolve().parents[3] / "models/face_detection_yunet_2023mar.onnx"),
            ))
            if not face_path.is_file():
                raise FileNotFoundError(f"Local YuNet face model required: {face_path}")
            self.face_model_path = face_path
            self.face_backend = "cpu"
            self.face_model_sha256 = file_sha256(face_path)
            self.face_detector = cv2.FaceDetectorYN.create(str(face_path), "", (320, 320), .85, .3, 5000)

    def describe(self):
        return {
            "checkpoint_sha256": self.sha256,
            "precision": str(next(self.model.parameters()).dtype),
            "face_backend": getattr(self, "face_backend", "cpu"),
            "backend": "tensorrt" if getattr(self, "engine_path", None) else "torch", "model_classes": list(self.model_classes),
            "thresholds": {"child": self.child_threshold, "adult": self.adult_threshold},
            **({"input_kind": "face"} if self.input_kind == "face" else {}),
            **({"child_age_max": self.child_age_max} if self.child_age_max is not None else {}),
            **({"face_max_side": self.face_max_side} if self.input_kind == "face" else {}),
        }

    def to(self, device):
        """Move every age tensor together; callers select the runtime device."""
        self.model.to(device)
        if self.domain_gate is not None:
            self.domain_gate.to(device)
            self.real_head.to(device)
            self.domain_mean = self.domain_mean.to(device)
            self.domain_scale = self.domain_scale.to(device)
        return self

    def use_tensorrt_engine(self, path, device):
        if self.domain_gate is not None:
            raise ValueError("TensorRT age engine requires a checkpoint without a domain adapter")
        from p068_vision.tensorrt_age import TensorRTAgeModel
        self.model = TensorRTAgeModel(path, device, self.sha256)
        self.engine_path = str(path)
        return self

    def set_precision(self, half=False):
        parameter = next(self.model.parameters())
        if half and parameter.device.type != "cuda":
            raise ValueError("FP16 age inference requires CUDA")
        dtype = torch.float16 if half else torch.float32
        self.model.to(dtype=dtype)
        if self.domain_gate is not None:
            self.real_head.to(dtype=dtype)
            self.domain_gate.to(dtype=dtype)
            self.domain_mean = self.domain_mean.to(dtype=dtype)
            self.domain_scale = self.domain_scale.to(dtype=dtype)
        return self

    def set_face_backend(self, backend, device):
        if backend not in {"cpu", "cuda", "auto"}:
            raise ValueError("Face backend must be cpu, cuda or auto")
        if self.face_detector is None:
            return
        if backend == "cpu":
            if getattr(self, "face_backend", "cpu") != "cpu":
                import cv2
                self.face_detector.close()
                self.face_detector = cv2.FaceDetectorYN.create(str(self.face_model_path), "", (320, 320), .85, .3, 5000)
                self.face_backend = "cpu"
            return
        from p068_vision.yunet_gpu import CudaFaceDetector
        if backend == "auto":
            if not str(device).startswith("cuda:"):
                return
            try:
                detector = CudaFaceDetector(self.face_model_path, device)
            except (ImportError, RuntimeError):
                return
        elif backend == "cuda":
            detector = CudaFaceDetector(self.face_model_path, device)
        else:
            raise ValueError("Face backend must be cpu, cuda or auto")
        self.face_detector = detector
        self.face_backend = "cuda"

    def detect_frame_faces(self, frame, *, privacy=False):
        """One bounded full-frame pass; return coordinates in source pixels."""
        import cv2
        import numpy as np

        height, width = frame.shape[:2]
        scale = min(1.0, getattr(self, "face_max_side", 768) / max(width, height))
        processing = frame if scale == 1.0 else cv2.resize(
            frame, (max(1, round(width * scale)), max(1, round(height * scale))),
        )
        ph, pw = processing.shape[:2]
        self.face_detector.setInputSize((pw, ph))
        self.face_detector.setScoreThreshold(.3 if privacy else .85)
        try:
            _, found = self.face_detector.detect(processing)
            if found is None:
                return []
            faces = np.array(found, copy=True)
            if scale != 1.0:
                faces[:, [0, 2, 4, 6, 8, 10, 12]] *= width / pw
                faces[:, [1, 3, 5, 7, 9, 11, 13]] *= height / ph
            return list(faces)
        finally:
            self.face_detector.setScoreThreshold(.85)

    @staticmethod
    def age_faces(faces):
        return [face for face in faces if face[-1] >= .85 and min(face[2:4]) >= 32]

    def detect_shared_pipeline_faces(self, frame, detections, full_frame_faces, *, privacy=False):
        return self.detect_pipeline_faces(frame, detections, privacy=privacy,
                                          full_frame_faces=full_frame_faces)

    def detect_pipeline_faces(self, frame, detections, *, privacy=False, rescue_people=False,
                              full_frame_faces=None):
        """Native person ROIs, rescuing people without an age-usable face.

        Keep the existing face-trained age input. Exclude face candidates inside
        detected pets, including full-frame rescue false positives on cats.
        """
        import cv2
        import numpy as np
        height, width = frame.shape[:2]
        people = [d['bbox'] for d in detections if d['class'] == 'person']
        animals = [d['bbox'] for d in detections if d['class'] in {'cat', 'dog'}]
        # The provider already runs one full-frame YuNet pass in parallel with
        # YOLO. Reuse its clear faces to avoid scanning every matching person
        # ROI a second time; retain weak privacy faces in the final evidence.
        faces = list(full_frame_faces) if full_frame_faces is not None else []
        clear_full_faces = self.age_faces(
            [face for face in faces if np.isfinite(face).all()]
        )
        full_face_rects = (
            self._face_rects(frame, people, faces=clear_full_faces)
            if people and clear_full_faces else [None] * len(people)
        )
        self.face_detector.setScoreThreshold(.3 if privacy else .85)
        try:
            for box, existing_face in zip(people, full_face_rects, strict=True):
                if existing_face is not None:
                    continue
                rect = padded_box(box, width, height, padding=0)
                if rect is None:
                    continue
                x1, y1, x2, y2 = rect
                self.face_detector.setInputSize((x2-x1, y2-y1))
                _, found = self.face_detector.detect(frame[y1:y2, x1:x2])
                for face in ([] if found is None else found):
                    mapped = np.array(face, copy=True)
                    mapped[[0, 4, 6, 8, 10, 12]] += x1
                    mapped[[1, 5, 7, 9, 11, 13]] += y1
                    faces.append(mapped)
            usable = self.age_faces([face for face in faces if np.isfinite(face).all()])
            missing_age_face = bool(people) and any(
                rect is None for rect in self._face_rects(frame, people, faces=usable)
            )
            if full_frame_faces is None and (not faces or missing_age_face):
                # Bound rescue cost on HD input; map every coordinate back to
                # source pixels before sharing it with age/privacy.
                scale = min(1.0, getattr(self, "face_max_side", 768) / max(width, height))
                processing = frame if scale == 1.0 else cv2.resize(
                    frame, (max(1, round(width * scale)), max(1, round(height * scale))),
                )
                ph, pw = processing.shape[:2]
                # Animal-only detections still get an independent human-face
                # rescue, using the clear-face age threshold to reject pet and
                # interior false positives rather than disabling the pass.
                self.face_detector.setScoreThreshold(.85 if animals and not people else (.3 if privacy else .85))
                self.face_detector.setInputSize((pw, ph))
                _, found = self.face_detector.detect(processing)
                # Retain ROI evidence for privacy when the rescue finds nothing.
                for face in ([] if found is None else found):
                    mapped = np.array(face, copy=True)
                    mapped[[0, 2, 4, 6, 8, 10, 12]] *= width/pw
                    mapped[[1, 3, 5, 7, 9, 11, 13]] *= height/ph
                    faces.append(mapped)
            if rescue_people:
                # A detected foreground person does not rule out an unseen
                # rear occupant outside/clipped by that person's ROI.
                self.face_detector.setScoreThreshold(.85)
                self.face_detector.setInputSize((width,height))
                _, found = self.face_detector.detect(frame)
                faces.extend([] if found is None else list(found))
        finally:
            self.face_detector.setScoreThreshold(.85)
        result = []
        # Prefer age-usable evidence over overlapping low-score privacy boxes.
        for face in sorted(faces, key=lambda f: (bool(self.age_faces([f])), float(f[-1])), reverse=True):
            if not np.isfinite(face).all() or min(face[2:4]) <= 0:
                continue
            x, y, fw, fh = map(float, face[:4])
            from p068_vision.privacy import _animal_only
            if _animal_only([x,y,x+fw,y+fh], animals, people):
                continue
            from p068_vision.tracking import iou
            if any(iou([x,y,x+fw,y+fh],
                       [float(old[0]),float(old[1]),float(old[0]+old[2]),float(old[1]+old[3])])>=.5
                   for old in result):
                continue
            result.append(face)
        return result

    def _detect_faces(self, frame):
        height, width = frame.shape[:2]
        self.face_detector.setInputSize((width, height))
        _, found = self.face_detector.detect(frame)
        return [] if found is None else [face for face in found if min(face[2:4]) >= 32]

    def face_only_people(self, frame, detections, *, faces=None):
        """Clear faces can supply person evidence when COCO misses a face-only view."""
        if self.face_detector is None:
            return []
        height, width = frame.shape[:2]
        boxes = [row["bbox"] for row in detections if row["class"] == "person"]
        additions = []
        faces = self._detect_faces(frame) if faces is None else faces
        assigned, owned = self._face_rects(frame, boxes, faces=faces, return_face_indices=True)
        for face_index, face in enumerate(faces):
            x, y, fw, fh = map(float, face[:4])
            def coverage(box):
                return (max(0,min(box[2],x+fw)-max(box[0],x))*
                        max(0,min(box[3],y+fh)-max(box[1],y))/(fw*fh))
            if face_index in owned:
                continue
            # A face inside an ambiguous person box must not create extra
            # occupants. Rescue only a distinct, unassigned observed face.
            if any(coverage(box)>=.5 and assigned[i] is None for i,box in enumerate(boxes)):
                continue
            rect = padded_box([x, y, x + fw, y + fh], width, height)
            if rect:
                additions.append({"class": "person", "confidence": float(face[-1]),
                                  "bbox": list(rect), "detector_source": "yunet_face"})
        return additions

    def _face_rects(self, frame, boxes, *, faces=None, return_face_indices=False):
        """Associate one clear face with one person; ambiguous/no face stays unknown."""
        height, width = frame.shape[:2]
        faces = self._detect_faces(frame) if faces is None else faces
        matches = []
        for box in boxes:
            person = padded_box(box, width, height, padding=0)
            candidates = []
            if person:
                px1, py1, px2, py2 = person
                for index, face in enumerate(faces):
                    x, y, fw, fh = map(float, face[:4])
                    overlap = max(0, min(px2, x + fw) - max(px1, x)) * max(0, min(py2, y + fh) - max(py1, y))
                    if overlap / (fw * fh) >= .9:
                        candidates.append(index)
            matches.append(candidates)
        # A small person's face can fall inside a larger foreground person's
        # box. Prefer a substantially tighter owner; comparable overlapping
        # boxes remain ambiguous rather than guessing an identity.
        for face_index in range(len(faces)):
            owners = [i for i, candidates in enumerate(matches) if face_index in candidates]
            if len(owners) <= 1:
                continue
            owners.sort(key=lambda i:(boxes[i][2]-boxes[i][0])*(boxes[i][3]-boxes[i][1]))
            areas = [(boxes[i][2]-boxes[i][0])*(boxes[i][3]-boxes[i][1]) for i in owners]
            winner = owners[0] if areas[0] < .5*areas[1] else None
            for owner in owners:
                if owner != winner:
                    matches[owner].remove(face_index)
        for index,candidates in enumerate(matches):
            if len(candidates)<=1:
                continue
            ranked=sorted(candidates,key=lambda i:float(faces[i][2]*faces[i][3]),reverse=True)
            large,small=faces[ranked[0]],faces[ranked[1]]
            box=boxes[index]
            near_head=float(large[1]+large[3]/2)<=box[1]+.5*(box[3]-box[1])
            if large[2]*large[3]>=2*small[2]*small[3] and near_head:
                matches[index]=[ranked[0]]
        matches = [candidates[0] if len(candidates)==1 else None for candidates in matches]
        rects = []
        owned = []
        for face_index in matches:
            if face_index is None or matches.count(face_index) != 1:
                rects.append(None)
                owned.append(None)
                continue
            x, y, fw, fh = map(float, faces[face_index][:4])
            rects.append(padded_box([x, y, x + fw, y + fh], width, height))
            owned.append(face_index if rects[-1] is not None else None)
        return (rects,owned) if return_face_indices else rects

    @torch.inference_mode()
    def classify(self, bgr_frame, boxes, *, faces=None):
        """Return one decision per input box, preserving order and invalid boxes."""
        height, width = bgr_frame.shape[:2]
        answers = [{"age_group": "unknown", "age_scores": None} for _ in boxes]
        crops, indices = [], []
        rects = (self._face_rects(bgr_frame, boxes, faces=faces) if self.face_detector is not None
                 else [padded_box(box, width, height) for box in boxes])
        for index, rect in enumerate(rects):
            if rect is not None:
                crops.append(self.transform(self._crop_image(bgr_frame, rect)))
                indices.append(index)
        if crops:
            parameter = next(self.model.parameters())
            batch = torch.stack(crops).to(device=parameter.device, dtype=parameter.dtype)
            domains = None
            if self.domain_gate is None:
                logits = self.model(batch)
            else:
                features = self.model.avgpool(self.model.features(batch)).flatten(1)
                domains = self.domain_gate((features - self.domain_mean) / self.domain_scale).flatten() >= 0
                logits = self.model.classifier(features)
                if domains.any():
                    logits[domains] = self.real_head(features[domains])
            scores = logits.float().softmax(dim=1).cpu().tolist()
            for index, values in zip(indices, scores, strict=True):
                age_scores = merge_age_scores(dict(zip(self.model_classes, values, strict=True)))
                group = choose_age(age_scores, self.child_threshold, self.adult_threshold)
                answers[index] = {
                    "age_group": group,
                    "age_scores": age_scores,
                    **({"age_crop": list(rects[index])} if self.input_kind == "face" else {}),
                }
            if domains is not None:
                for index, real in zip(indices, domains.cpu().tolist(), strict=True):
                    answers[index]["age_domain"] = "real" if real else "synthetic"
        return answers

    @staticmethod
    def _crop_image(frame, rect):
        """Convert only the selected pixels to RGB, preserving PIL crop pixels."""
        x1, y1, x2, y2 = rect
        return Image.fromarray(frame[y1:y2, x1:x2, ::-1])


def apply_age(detection, age):
    """Keep detector confidence distinct from the uncalibrated combined score."""
    result = dict(detection, **age)
    if detection["class"] != "person":
        raise ValueError("Age classification only applies to person detections")
    if age["age_group"] in CLASSES:
        group = age["age_group"]
        result.update(
            {
                "class": group,
                "detector_confidence": detection["confidence"],
                "confidence": detection["confidence"] * age["age_scores"][group],
                "confidence_type": "uncalibrated_detector_times_age",
            }
        )
    return result
