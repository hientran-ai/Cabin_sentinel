"""Camera simulator: a recorded video stands in for the in-cabin camera. Everything it produces is SIMULATED.

Only the source of the pictures differs from a real device. Each frame is detected by the same model the demo backend
serves, placed in the vehicle's calibrated cabin zones, smoothed per seat, and published through the same
``ingest_vision`` path a device uplink uses, so rules.py decides every risk level, incidents open and notifications go
out exactly as for a real vehicle. Frames are processed in memory and never stored.

Cabin zones (calibrated per vehicle at installation, because every model's rear cabin is a different size and the
camera sits in a different place):
  - ``seat`` zones: where an occupant can sit. A detection whose centre is in a seat zone counts for that seat.
  - ``exclude`` zones: windows and glass. A detection whose centre is in an exclude zone and in no seat zone is a
    passer-by outside the car; it is shown but does not count. This is the only thing a zone can remove.
  - A detection in neither kind of zone still counts (as "cabin"): an uncalibrated corner is never treated as outside.
With no calibration every detection counts. Zones never turn "nothing seen" into "empty" (SR-01): they only decide
which detections are evidence.

Per-seat smoothing mirrors embedded/cabin_edge/v3/seats.py (SeatConfig): a hit at >= 0.40 counts at once, weaker
candidates (0.15-0.40) need 3 of the last 5 frames, and a seat is released only after ``CLEAR_S`` of healthy frames
without a hit. That stops one missed frame from closing an incident and the next frame from opening a second one.
"""

from __future__ import annotations

import hashlib
from collections import deque
from dataclasses import dataclass, field

from src.vision.labels import GENERIC_OBJECT

LIVING = {"person", "dog", "cat"}
HIT_CONF = 0.40
CAND_CONF = 0.15
K_OF_N = (3, 5)
CLEAR_S = 20.0           # v3 t_clear_s: healthy no-hit time before a seat is released
ITEM_CONF = 0.40         # rules.MIN_CONFIDENCE: weaker item boxes are shown, not sent
ITEM_HOLD_S = 4.0        # an item seen in the last few seconds is still reported, so NOTICE does not flicker
DARK_LUMA = 12.0         # mean luma below this: lens covered or no light (SR-02, never "empty")
FROZEN_FRAMES = 8        # identical consecutive frames: picture is stuck
MAX_ZONES = 12
MIN_ZONE = 0.03          # a zone narrower or shorter than 3 % of the frame is a slip of the mouse
MAX_EXCLUDE_AREA = 0.5   # windows, not half the cabin
MAX_SEAT_COVER = 0.5     # an exclude zone may not hide more than half of any seat


class CalibrationError(ValueError):
    pass


@dataclass(frozen=True)
class Zone:
    name: str
    kind: str                                  # "seat" | "exclude"
    box: tuple[float, float, float, float]     # normalised x1, y1, x2, y2

    @property
    def area(self) -> float:
        return (self.box[2] - self.box[0]) * (self.box[3] - self.box[1])

    def contains(self, x: float, y: float) -> bool:
        return self.box[0] <= x <= self.box[2] and self.box[1] <= y <= self.box[3]


def _overlap(a: tuple, b: tuple) -> float:
    w = min(a[2], b[2]) - max(a[0], b[0])
    h = min(a[3], b[3]) - max(a[1], b[1])
    return w * h if w > 0 and h > 0 else 0.0


def parse_zones(raw: list[dict]) -> list[Zone]:
    """Validate a calibration. Raises CalibrationError with a message a fitter can act on."""
    if not isinstance(raw, list) or len(raw) > MAX_ZONES:
        raise CalibrationError(f"At most {MAX_ZONES} zones")
    zones: list[Zone] = []
    for item in raw:
        name, kind, box = item.get("name"), item.get("kind"), item.get("box")
        if kind not in ("seat", "exclude"):
            raise CalibrationError("Zone kind must be seat or exclude")
        if not isinstance(name, str) or not 1 <= len(name) <= 32:
            raise CalibrationError("Each zone needs a short name")
        if not isinstance(box, (list, tuple)) or len(box) != 4 or not all(isinstance(v, (int, float)) for v in box):
            raise CalibrationError(f"{name}: box must be four numbers")
        x1, y1, x2, y2 = (float(v) for v in box)
        if not (0 <= x1 < x2 <= 1 and 0 <= y1 < y2 <= 1):
            raise CalibrationError(f"{name}: box must lie inside the frame")
        if x2 - x1 < MIN_ZONE or y2 - y1 < MIN_ZONE:
            raise CalibrationError(f"{name}: zone is too small")
        zones.append(Zone(name, kind, (round(x1, 4), round(y1, 4), round(x2, 4), round(y2, 4))))
    names = [z.name for z in zones]
    if len(set(names)) != len(names):
        raise CalibrationError("Zone names must be unique")
    seats = [z for z in zones if z.kind == "seat"]
    excludes = [z for z in zones if z.kind == "exclude"]
    if excludes and not seats:
        raise CalibrationError("Mark the seats before excluding windows")
    if sum(z.area for z in excludes) > MAX_EXCLUDE_AREA:
        raise CalibrationError("Excluded zones cover too much of the picture; exclude windows only")
    for seat in seats:
        hidden = sum(_overlap(seat.box, ex.box) for ex in excludes)
        if hidden > MAX_SEAT_COVER * seat.area:
            raise CalibrationError(f"An excluded zone hides most of seat {seat.name}")
    return zones


def place(detections: list[dict], zones: list[Zone], width: int, height: int) -> list[dict]:
    """Tag each detection with the zone it belongs to and whether it counts as cabin evidence."""
    seats = [z for z in zones if z.kind == "seat"]
    excludes = [z for z in zones if z.kind == "exclude"]
    out = []
    for det in detections:
        bbox = det.get("bbox")
        zone, counted = None, True
        if bbox and width and height and zones:
            cx, cy = (bbox[0] + bbox[2]) / 2 / width, (bbox[1] + bbox[3]) / 2 / height
            seat = next((s for s in seats if s.contains(cx, cy)), None)
            if seat is not None:
                zone = seat.name
            elif any(e.contains(cx, cy) for e in excludes):
                zone, counted = "outside", False
            else:
                zone = "cabin"
        out.append({**det, "zone": zone, "counted": counted})
    return out


@dataclass
class _Seat:
    cand: deque = field(default_factory=lambda: deque(maxlen=K_OF_N[1]))
    occupied: bool = False
    label: str = "person"
    conf: float = 0.0
    last_hit: float | None = None
    clear_since: float | None = None


class SeatSmoother:
    """Per-seat occupancy over time. ``update`` is called once per processed frame."""

    def __init__(self):
        self._seats: dict[str, _Seat] = {}

    def update(self, t: float, placed: list[dict], healthy: bool) -> dict[str, dict]:
        best: dict[str, dict] = {}
        for det in placed:
            if det["counted"] and det.get("class") in LIVING:
                key = det["zone"] or "cabin"
                if key not in best or det["confidence"] > best[key]["confidence"]:
                    best[key] = det
        for key in best:
            self._seats.setdefault(key, _Seat())
        out = {}
        for key, seat in self._seats.items():
            det = best.get(key)
            conf = det["confidence"] if det else 0.0
            if healthy:  # a degraded frame neither confirms nor releases anyone
                seat.cand.append(conf >= CAND_CONF)
                hit = conf >= HIT_CONF or (len(seat.cand) >= K_OF_N[1] and sum(seat.cand) >= K_OF_N[0])
                if hit:
                    seat.occupied, seat.last_hit, seat.clear_since = True, t, None
                    if det:
                        seat.label, seat.conf = det["class"], conf
                elif seat.occupied:
                    seat.clear_since = t if seat.clear_since is None else seat.clear_since
                    if t - seat.clear_since >= CLEAR_S:
                        seat.occupied, seat.clear_since = False, None
                        seat.cand.clear()
            state = "OCCUPIED" if seat.occupied else ("CANDIDATE" if any(seat.cand) else "NO_HIT")
            out[key] = {"state": state, "label": seat.label if seat.occupied else None,
                        "confidence": round(seat.conf, 3) if seat.occupied else None,
                        "releases_in_s": (round(CLEAR_S - (t - seat.clear_since), 1)
                                          if seat.occupied and seat.clear_since is not None else None)}
        return out

    def occupants(self) -> list[dict]:
        """Held seats with the confidence of their last hit. A 3-of-5 candidate stays below 0.40, so rules.py reads
        it as SUSPECTED (WARNING), not as a confirmed occupant."""
        return [{"detection_id": f"seat-{k}", "class_name": s.label, "confidence": s.conf}
                for k, s in self._seats.items() if s.occupied]


class QualityGate:
    """Dark or frozen pictures are a camera problem, never an empty cabin (SR-01, SR-02)."""

    def __init__(self):
        self._last: str | None = None
        self._same = 0

    def check(self, luma: float, digest: str) -> str:
        self._same = self._same + 1 if digest == self._last else 0
        self._last = digest
        if luma < DARK_LUMA:
            return "BLOCKED"
        if self._same >= FROZEN_FRAMES:
            return "ERROR"
        return "OK"


def frame_stats(image_bytes: bytes) -> tuple[float, str, tuple[int, int]]:
    """Mean luma of a small thumbnail, a digest that changes when the picture does, and the frame size."""
    from io import BytesIO

    from PIL import Image

    with Image.open(BytesIO(image_bytes)) as im:
        size = im.size
        small = im.convert("L").resize((32, 24))
        pixels = small.tobytes()
    return sum(pixels) / len(pixels), hashlib.sha1(pixels).hexdigest(), size


@dataclass
class VideoRun:
    """One simulated camera attached to one demo vehicle."""

    vehicle_id: str
    temperature: float
    zones: list[Zone]
    sample: str | None = None
    smoother: SeatSmoother = field(default_factory=SeatSmoother)
    gate: QualityGate = field(default_factory=QualityGate)
    last_sequence: int = 0
    frames: int = 0
    camera_status: str = "OK"
    items_seen: dict = field(default_factory=dict)   # label -> (confidence, t)

    def items(self, t: float, placed: list[dict], healthy: bool) -> list[dict]:
        if healthy:
            for det in placed:
                # "object" is an item the detector could not name (score < 0.5). In a cabin that is mostly headrests and
                # seat parts: shown on screen, but not reported as a forgotten item.
                if (det["counted"] and det.get("class") not in LIVING | {GENERIC_OBJECT}
                        and det["confidence"] >= ITEM_CONF):
                    prev = self.items_seen.get(det["class"])
                    if prev is None or t - prev[1] > 0.5 or det["confidence"] > prev[0]:
                        self.items_seen[det["class"]] = (det["confidence"], t)
        self.items_seen = {k: v for k, v in self.items_seen.items() if t - v[1] <= ITEM_HOLD_S}
        return [{"detection_id": f"item-{k}", "class_name": k, "confidence": round(c, 3)}
                for k, (c, _) in sorted(self.items_seen.items())]
