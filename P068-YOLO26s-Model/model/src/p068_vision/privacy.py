"""Blur detected faces on a copy; inference retains the original frame."""

import math
from collections import deque
from pathlib import Path

import cv2
import numpy as np


# Ported from BaoTam f7c04a0; crop math kept local to avoid loading the age model.
def padded_box(box, width, height, padding=0.1):
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


def blur_boxes(frame, boxes):
    result = frame.copy()
    height, width = frame.shape[:2]

    for box in boxes:
        rect = padded_box(box, width, height, padding=0)
        if rect is None:
            continue

        x1, y1, x2, y2 = rect
        region = frame[y1:y2, x1:x2]
        rh, rw = region.shape[:2]

        # Smooth facial detail while keeping a feathered oval around the face.
        small = cv2.resize(
            region,
            (min(16, rw), min(16, rh)),
            interpolation=cv2.INTER_AREA,
        )
        small = cv2.GaussianBlur(small, (0, 0), sigmaX=2)
        blurred = cv2.resize(small, (rw, rh), interpolation=cv2.INTER_LINEAR)

        yy, xx = np.ogrid[:rh, :rw]
        radius = np.sqrt(
            ((xx + 0.5 - rw / 2) / (rw / 2)) ** 2
            + ((yy + 0.5 - rh / 2) / (rh / 2)) ** 2
        )
        alpha = np.clip((1 - radius) / 0.15, 0, 1)
        alpha = (alpha * alpha * (3 - 2 * alpha))[..., None]

        current = result[y1:y2, x1:x2]
        result[y1:y2, x1:x2] = np.rint(
            blurred * alpha + current * (1 - alpha)
        ).astype(frame.dtype)

    return result


def cover_boxes(frame, boxes):
    """Opaque rectangles: every pixel in a reported face region is covered."""
    result = frame.copy()
    height, width = frame.shape[:2]
    for box in boxes:
        rect = padded_box(box, width, height, padding=0)
        if rect is not None:
            x1,y1,x2,y2 = rect
            result[y1:y2,x1:x2] = 32
    return result


def face_privacy_box(box, width, height):
    """Include cheeks/ears in profile without extending far into a pet below."""
    x1,y1,x2,y2 = box
    dx,dy = .3*(x2-x1),.2*(y2-y1)
    return padded_box([x1-dx,y1-dy,x2+dx,y2+dy],width,height,padding=0)


def subtract_boxes(boxes, exclusions, width, height):
    """Remove known animal rectangles from approximate human fallback regions."""
    pieces = list(boxes)
    for exclusion in exclusions:
        animal = padded_box(exclusion,width,height,padding=0)
        if animal is None:
            continue
        remaining = []
        for x1,y1,x2,y2 in pieces:
            left,top,right,bottom = max(x1,animal[0]),max(y1,animal[1]),min(x2,animal[2]),min(y2,animal[3])
            if right <= left or bottom <= top:
                remaining.append([x1,y1,x2,y2])
                continue
            remaining.extend(b for b in ([x1,y1,x2,top],[x1,bottom,x2,y2],
                [x1,top,left,bottom],[right,top,x2,bottom]) if b[2]>b[0] and b[3]>b[1])
        pieces = remaining
    return pieces


class FaceBlurrer:
    def __init__(self, model, score_threshold=0.3, max_width=960, hold_frames=3, coverage='soft'):
        if not Path(model).is_file():
            raise FileNotFoundError(f"Local face model required: {model}")
        if not 0 < score_threshold <= 1 or max_width < 32 or hold_frames < 0:
            raise ValueError("Invalid face detector threshold, width or hold frames")

        self.detector = cv2.FaceDetectorYN.create(
            str(model), "", (320, 320), score_threshold, 0.3, 5000
        )
        self.max_width = max_width
        self.history = deque(maxlen=hold_frames + 1)
        self.shape = None
        if coverage not in {'soft', 'opaque'}:
            raise ValueError('Unknown face coverage')
        self.coverage = coverage

    def apply(self, frame, *, faces=None, animal_boxes=(), person_boxes=()):
        height, width = frame.shape[:2]
        if self.shape != (height, width):
            self.history.clear()
            self.shape = (height, width)

        processing = frame
        if faces is None and width > self.max_width:
            processing = cv2.resize(
                frame,
                (self.max_width, max(1, round(height * self.max_width / width))),
            )

        ph, pw = processing.shape[:2]
        if faces is None:
            self.detector.setInputSize((pw, ph))
            _, faces = self.detector.detect(processing)

        boxes = []
        if faces is not None:
            for face in faces:
                x, y, w, h = map(float, face[:4])
                raw_box = [
                        x * width / pw,
                        y * height / ph,
                        (x + w) * width / pw,
                        (y + h) * height / ph,
                    ]
                rect = (face_privacy_box(raw_box,width,height) if self.coverage=='opaque'
                        else padded_box(raw_box,width,height,padding=.1))
                if rect is not None:
                    if not _animal_only(raw_box, animal_boxes, person_boxes):
                        boxes.append(list(rect))

        # Replace overlapping historical positions instead of leaving a mask trail.
        # Unmatched faces are still held briefly when detection misses them.
        for previous in self.history:
            previous[:] = [
                old
                for old in previous
                if not any(_same_face(old, new) for new in boxes)
                and not _animal_only(old, animal_boxes, person_boxes)
            ]

        self.history.append(boxes)
        masked = [box for previous in self.history for box in previous]

        cover = cover_boxes if self.coverage == 'opaque' else blur_boxes
        return cover(frame, masked), {
            "detected_faces": len(boxes),
            "masked_boxes": masked,
        }


def person_privacy_fallbacks(detections, face_boxes, width, height):
    """Conservative upper-body regions when a person has no matched face.

    These are upper-person proxies, not face detections; extra clothing/background
    may be covered. They must be computed before outside-person filtering.
    """
    result=[]
    for d in detections:
        if d.get('class')!='person':
            continue
        box=d.get('bbox')
        if not isinstance(box,(list,tuple)) or len(box)!=4 or not all(math.isfinite(v) for v in box):
            continue
        x1,y1,x2,y2=box
        if x2<=x1 or y2<=y1:
            continue
        bh=y2-y1
        upper=[x1,y1,x2,y1+.5*bh]
        covered=any(upper[0]<=(f[0]+f[2])/2<=upper[2] and upper[1]<=(f[1]+f[3])/2<=upper[3] for f in face_boxes)
        if covered:
            continue
        proposal=box if d.get('detector_source')=='yunet_face' else [x1,y1,x2,y1+.5*bh]
        rect=padded_box(proposal,width,height,padding=0)
        if rect is not None:
            result.append(list(rect))
    return result


def _overlap(a, b):
    return min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1])


def _animal_only(face, animals, people):
    x,y = (face[0]+face[2])/2, (face[1]+face[3])/2
    # An animal's large body box overlapping a person's face is insufficient to
    # cancel privacy. Retain a face with supporting human upper-body evidence.
    if any(p[0] <= x <= p[2] and p[1] <= y <= p[1]+.3*(p[3]-p[1]) for p in people):
        return False
    area = (face[2]-face[0])*(face[3]-face[1])
    return any(max(0,min(face[2],a[2])-max(face[0],a[0])) *
               max(0,min(face[3],a[3])-max(face[1],a[1])) >= .8*area for a in animals)


def _same_face(old, new):
    intersection = (
        max(0, min(old[2], new[2]) - max(old[0], new[0]))
        * max(0, min(old[3], new[3]) - max(old[1], new[1]))
    )
    smaller_area = min(
        (old[2] - old[0]) * (old[3] - old[1]),
        (new[2] - new[0]) * (new[3] - new[1]),
    )
    return intersection >= smaller_area * 0.3
