"""Standalone video-model heuristics for passenger belongings, not API rules."""

import math

import cv2
import numpy as np

# Deliberately limited MVP; furniture and unknown COCO classes are excluded.
BELONGING_IDS = {
    24: "backpack", 25: "umbrella", 26: "handbag", 28: "suitcase",
    39: "bottle", 41: "cup", 63: "laptop", 67: "cell phone",
    73: "book", 77: "teddy bear",
}


def select_detections(detections, item_confidence=0.5):
    """Keep living detections, and only confident whitelisted personal items."""
    if not 0 < item_confidence <= 1:
        raise ValueError("item_confidence must be in (0,1]")
    return [d for d in detections if d["class"] in {"person", "cat", "dog"}
            or (d["class"] in BELONGING_IDS.values()
                and d.get("confidence", 0) >= item_confidence)]


def iou(a, b):
    width = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    height = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    intersection = width * height
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - intersection
    return intersection / union if union > 0 else 0


def appearance(frame, bbox):
    height, width = frame.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in bbox]
    crop = frame[max(0, y1):min(height, y2), max(0, x1):min(width, x2)]
    if not crop.size:
        raise ValueError("Empty object crop")
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    histogram = cv2.calcHist([hsv], [0, 1], None, [16, 16], [0, 180, 0, 256])
    return cv2.normalize(histogram, histogram).astype(np.float32)


class CabinBaseline:
    """Reference must be manually verified free of passenger belongings.

    Only suitable for the same fixed camera and cabin arrangement. Matching is
    a heuristic, not proof of ownership; replacement by a similar object can fail.
    """

    def __init__(self, frame, detections):
        self.shape = frame.shape
        self.entries = [
            (d["class"], d["bbox"], appearance(frame, d["bbox"]))
            for d in detections if d["class"] in BELONGING_IDS.values()
        ]

    def matches(self, frame, detection):
        if frame.shape != self.shape:
            raise ValueError("Baseline and video must have identical resolution")
        for label, bbox, histogram in self.entries:
            if label == detection["class"] and iou(bbox, detection["bbox"]) >= 0.7:
                distance = cv2.compareHist(
                    histogram, appearance(frame, detection["bbox"]), cv2.HISTCMP_BHATTACHARYYA,
                )
                if distance <= 0.2:
                    return True
        return False


class BelongingsTracker:
    """Greedy same-class IoU + appearance matching for a fixed camera.

    No re-identification after long occlusion; IDs are experimental, not identity.
    """

    def __init__(self, max_gap=0.5):
        self.max_gap = max_gap
        self.tracks = {}
        self.next_id = 1

    def update(self, frame, detections, video_time):
        self.tracks = {key: value for key, value in self.tracks.items()
                       if video_time - value["last_seen"] <= self.max_gap}
        items = [d for d in detections if d["class"] in BELONGING_IDS.values()]
        features = [appearance(frame, d["bbox"]) for d in items]
        pairs = []
        for index, detection in enumerate(items):
            for track_id, previous in self.tracks.items():
                overlap = iou(detection["bbox"], previous["bbox"])
                distance = cv2.compareHist(features[index], previous["appearance"],
                                          cv2.HISTCMP_BHATTACHARYYA)
                if detection["class"] == previous["class"] and overlap >= 0.3 and distance <= 0.4:
                    pairs.append((overlap * (1 - distance), index, track_id))
        matched = {}
        used_ids = set()
        for _, index, track_id in sorted(pairs, reverse=True):
            if index not in matched and track_id not in used_ids:
                matched[index] = track_id
                used_ids.add(track_id)
        for index, detection in enumerate(items):
            track_id = matched.get(index)
            if track_id is None:
                track_id = self.next_id
                self.next_id += 1
            detection["track_id"] = track_id
            self.tracks[track_id] = {"class": detection["class"], "bbox": detection["bbox"],
                                     "appearance": features[index], "last_seen": video_time}
        return detections


class BelongingsMonitor:
    """Track persistence after explicit trip end; absence alone never ends a trip."""

    def __init__(self, *, baseline_verified=False, trip_end=None, hold_seconds=3.0, max_gap=0.5):
        if not math.isfinite(hold_seconds) or hold_seconds <= 0:
            raise ValueError("hold_seconds must be positive and finite")
        if not math.isfinite(max_gap) or max_gap < 0:
            raise ValueError("max_gap must be nonnegative and finite")
        if trip_end is not None and (not math.isfinite(trip_end) or trip_end < 0):
            raise ValueError("trip_end must be nonnegative and finite")
        self.baseline_verified = baseline_verified
        self.trip_end = trip_end
        self.hold_seconds = hold_seconds
        self.max_gap = max_gap
        self.tracks = {}
        self.candidate_ids = set()

    def update(self, detections, video_time, *, person_present):
        # Do not carry temporal evidence across a visible person in the cabin.
        if person_present:
            for state in self.tracks.values():
                state["since"] = None
        for detection in detections:
            if detection["class"] not in BELONGING_IDS.values():
                continue
            detection["belonging_status"] = "present"
            if detection.get("baseline_match"):
                detection["belonging_status"] = "baseline_fixture"
                self.tracks.pop(detection.get("track_id"), None)
                continue
            track_id = detection.get("track_id")
            if track_id is None:
                detection["belonging_status"] = "untracked"
                continue
            state = self.tracks.get(track_id)
            if state is None or video_time - state["last_seen"] > self.max_gap:
                state = {"since": None, "last_seen": video_time}
                self.tracks[track_id] = state
            state["last_seen"] = video_time
            if not self.baseline_verified:
                detection["belonging_status"] = "baseline_required"
                continue
            if self.trip_end is None or video_time < self.trip_end or person_present:
                state["since"] = None
                continue
            if state["since"] is None:
                state["since"] = video_time
            duration = video_time - state["since"]
            detection["unattended_seconds"] = duration
            detection["belonging_status"] = "pending"
            if duration >= self.hold_seconds:
                detection["belonging_status"] = "left_behind_candidate"
                self.candidate_ids.add(track_id)
        # Bound memory for long videos. Missing tracks do not generate alerts.
        self.tracks = {
            key: state for key, state in self.tracks.items()
            if video_time - state["last_seen"] <= self.max_gap
        }
        return detections
