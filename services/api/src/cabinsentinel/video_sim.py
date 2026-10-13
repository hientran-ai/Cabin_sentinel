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

Verified-empty reference (v3 ``EmptyReference``, SR-09): a picture of the cabin taken while a person confirms it is
empty. Each seat is compared with it (luma and gradient template match, small search margin). A seat that stops looking
like its empty self for 3 frames in a row is SEAT_CHANGED and treated as a possible occupant even when the detector
sees nobody: this is what catches a child hidden by a headrest. With a reference, weak detections only count on a seat
that currently differs from it, and an occupant is released only once the seat matches again. The reference lives in
memory for the run; it is never stored.

Child seats are declared per seat at installation. A rear-facing child seat hides the infant from a camera in front
of it, so the camera can never verify that seat: it is always reported as a baby seat (rules.py BABY_SEAT_UNVERIFIED,
WARNING) until someone checks the cabin. Only another sensor (radar) could clear it, and the simulator has none.
"""

from __future__ import annotations

import hashlib
from collections import deque
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from src.vision.labels import GENERIC_OBJECT

if TYPE_CHECKING:
    import numpy as np

LIVING = {"person", "dog", "cat"}
HIT_CONF = 0.40
CAND_CONF = 0.15
K_OF_N = (3, 5)
CLEAR_S = 20.0           # v3 t_clear_s: healthy no-hit time before a seat is released
ITEM_CONF = 0.40         # rules.MIN_CONFIDENCE: weaker item boxes are shown, not sent
# The detector names car seats and their parts "chair", "couch", "bed"...: part of the cabin, never a forgotten item.
CABIN_FIXTURES = {"chair", "couch", "bed", "dining table", "toilet", "bench"}
ITEM_HOLD_S = 4.0        # an item seen in the last few seconds is still reported, so NOTICE does not flicker
DARK_LUMA = 12.0         # mean luma below this: lens covered or no light (SR-02, never "empty")
FROZEN_FRAMES = 8        # identical consecutive frames: picture is stuck
MAX_ZONES = 12
MIN_ZONE = 0.03          # a zone narrower or shorter than 3 % of the frame is a slip of the mouse
MAX_EXCLUDE_AREA = 0.5   # windows, not half the cabin
MAX_SEAT_COVER = 0.5     # an exclude zone may not hide more than half of any seat
CHILD_SEATS = ("rear_facing", "forward_facing")
REF_SIZE = (320, 180)    # v3 compares seats on a 320x180 luma plane
REF_MATCH = 0.55         # v3 ref_match_thr (COMPLIANCE_BASELINE 5.3)
REF_LOW_FRAMES = 3       # v3: three frames in a row before a seat counts as changed
REF_MARGIN = 8           # px at 320x180: tolerated residual camera shake
REF_INSET = 0.10         # template = seat shrunk by this fraction per side
VERIFY_S = 5.0           # v3 t_verify_s: healthy matching time before a seat reads EMPTY_VERIFIED


class CalibrationError(ValueError):
    pass


@dataclass(frozen=True)
class Zone:
    name: str
    kind: str                                  # "seat" | "exclude"
    box: tuple[float, float, float, float]     # normalised x1, y1, x2, y2
    child_seat: str | None = None              # seats only: "rear_facing" | "forward_facing"
    detail: bool = False                       # seats only: also detect on an enlarged crop of this seat

    def as_dict(self) -> dict:
        out = {"name": self.name, "kind": self.kind, "box": list(self.box)}
        if self.child_seat:
            out["child_seat"] = self.child_seat
        if self.detail:
            out["detail"] = True
        return out

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
        child_seat, detail = item.get("child_seat"), bool(item.get("detail", False))
        if child_seat is not None and child_seat not in CHILD_SEATS:
            raise CalibrationError(f"{name}: child seat must be rear_facing or forward_facing")
        if kind != "seat" and (child_seat or detail):
            raise CalibrationError(f"{name}: only seats carry a child seat or a detail scan")
        zones.append(Zone(name, kind, (round(x1, 4), round(y1, 4), round(x2, 4), round(y2, 4)), child_seat, detail))
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
    source: str = "detector"     # what holds the seat: "detector" or "reference"
    label: str = "person"
    conf: float = 0.0
    last_hit: float | None = None
    clear_since: float | None = None
    low: int = 0                 # consecutive frames the seat did not match its empty reference
    empty_since: float | None = None
    sim: float | None = None


class SeatSmoother:
    """Per-seat occupancy over time. ``update`` is called once per processed frame."""

    def __init__(self):
        self._seats: dict[str, _Seat] = {}

    def update(self, t: float, placed: list[dict], healthy: bool, sims: dict[str, float | None] | None = None,
               seats: list[Zone] | None = None) -> dict[str, dict]:
        """``sims``: per seat similarity to the verified-empty reference (absent without a reference)."""
        sims = sims or {}
        zones = {z.name: z for z in seats or []}
        # The full-frame pass and the detail scan are kept apart: an enlarged crop also enlarges headrests and seat
        # folds, so a detail hit is only ever a candidate (3 of 5), never an instant occupant.
        best: dict[str, dict] = {}
        best_detail: dict[str, dict] = {}
        for det in placed:
            if det["counted"] and det.get("class") in LIVING:
                key = det["zone"] or "cabin"
                pool = best_detail if det.get("detail") else best
                if key not in pool or det["confidence"] > pool[key]["confidence"]:
                    pool[key] = det
        for key in [*zones, *best, *best_detail]:
            self._seats.setdefault(key, _Seat())
        out = {}
        for key, seat in self._seats.items():
            det = best.get(key)
            conf = det["confidence"] if det else 0.0
            detail = best_detail.get(key)
            detail_conf = detail["confidence"] if detail else 0.0
            sim = sims.get(key)
            has_ref = sim is not None
            if healthy:  # a degraded frame neither confirms nor releases anyone
                seat.sim = sim
                if has_ref:
                    seat.low = seat.low + 1 if sim < REF_MATCH else 0
                changed = has_ref and seat.low >= REF_LOW_FRAMES
                # With a reference, a weak detection counts only where the seat no longer looks empty.
                differs = not has_ref or seat.low >= 1
                weak_ok = CAND_CONF <= max(conf, detail_conf) and differs
                seat.cand.append(conf >= HIT_CONF or weak_ok)
                k_of_n = len(seat.cand) >= K_OF_N[1] and sum(seat.cand) >= K_OF_N[0]
                hit = conf >= HIT_CONF or k_of_n
                if hit:
                    seat.occupied, seat.source, seat.last_hit, seat.clear_since = True, "detector", t, None
                    strongest = det if conf >= detail_conf else detail
                    if strongest:
                        seat.label, seat.conf = strongest["class"], strongest["confidence"]
                elif changed:
                    if not seat.occupied:
                        seat.source, seat.label, seat.conf = "reference", "possible_occupant", 0.0
                    seat.occupied, seat.clear_since = True, None
                elif seat.occupied:
                    if has_ref and seat.low:
                        seat.clear_since = None      # still differs from empty: not releasable yet
                    else:
                        seat.clear_since = t if seat.clear_since is None else seat.clear_since
                        if t - seat.clear_since >= CLEAR_S:
                            seat.occupied, seat.clear_since = False, None
                            seat.cand.clear()
                matches_empty = has_ref and seat.low == 0 and max(conf, detail_conf) < CAND_CONF
                if matches_empty and not seat.occupied:
                    seat.empty_since = t if seat.empty_since is None else seat.empty_since
                else:
                    seat.empty_since = None
            zone = zones.get(key)
            if zone is not None and zone.child_seat == "rear_facing":
                state = "REAR_FACING_UNVERIFIABLE"
            elif seat.occupied:
                state = "OCCUPIED" if seat.source == "detector" else "SEAT_CHANGED"
            elif seat.empty_since is not None and t - seat.empty_since >= VERIFY_S:
                state = "EMPTY_VERIFIED"
            elif any(seat.cand):
                state = "CANDIDATE"
            else:
                state = "PENDING_EMPTY" if has_ref else "NO_HIT"
            out[key] = {"state": state, "label": seat.label if seat.occupied else None,
                        "confidence": round(seat.conf, 3) if seat.occupied and seat.source == "detector" else None,
                        "reference_similarity": None if seat.sim is None else round(seat.sim, 2),
                        "child_seat": zone.child_seat if zone else None,
                        "releases_in_s": (round(CLEAR_S - (t - seat.clear_since), 1)
                                          if seat.occupied and seat.clear_since is not None else None)}
        return out

    def occupants(self, seats: list[Zone] | None = None) -> list[dict]:
        """Evidence for rules.py. A detector-held seat carries its last hit (a 3-of-5 candidate stays below 0.40, so
        rules read it as SUSPECTED). A seat held by the reference is a ``possible_occupant`` (an unrecognised class:
        SUSPECTED, WARNING). A rear-facing child seat is always a ``baby seat`` (BABY_SEAT_UNVERIFIED, WARNING)."""
        out = []
        for k, s in self._seats.items():
            if not s.occupied:
                continue
            if s.source == "detector":
                out.append({"detection_id": f"seat-{k}", "class_name": s.label, "confidence": s.conf})
            else:
                out.append({"detection_id": f"seat-{k}-changed", "class_name": "possible_occupant", "confidence": 0.5})
        for z in seats or []:
            if z.child_seat == "rear_facing":
                out.append({"detection_id": f"seat-{z.name}-rear-facing", "class_name": "baby seat", "confidence": 1.0})
        return out


class EmptyReference:
    """Per-seat luma and gradient templates of the verified-empty cabin (port of v3 seats.EmptyReference).

    Garbage in, garbage out: an occupant who is in the reference makes that seat read as empty, so a reference is
    only taken when a person confirms the cabin is empty (SR-09), and who confirmed it is audited.
    """

    def __init__(self, gray: np.ndarray, seats: list[Zone]):
        self.gray = gray
        self._ref = {}
        for seat in seats:
            r = self._rect(seat)
            if r is not None:
                patch = gray[r[1]:r[3], r[0]:r[2]]
                self._ref[seat.name] = (patch.copy(), _grad(patch)[1:-1, 1:-1].copy())

    @staticmethod
    def _rect(seat: Zone):
        w, h = REF_SIZE
        x1, y1, x2, y2 = seat.box
        dx, dy = (x2 - x1) * REF_INSET, (y2 - y1) * REF_INSET
        r = (round((x1 + dx) * w), round((y1 + dy) * h), round((x2 - dx) * w), round((y2 - dy) * h))
        return r if r[2] - r[0] >= 4 and r[3] - r[1] >= 4 else None

    def similarity(self, seat: Zone, gray: np.ndarray) -> float | None:
        import cv2

        ref, r = self._ref.get(seat.name), self._rect(seat)
        if ref is None or r is None:
            return None
        tl, tg = ref
        h, w = gray.shape[:2]
        x1, y1 = max(0, r[0] - REF_MARGIN), max(0, r[1] - REF_MARGIN)
        x2, y2 = min(w, r[0] + tl.shape[1] + REF_MARGIN), min(h, r[1] + tl.shape[0] + REF_MARGIN)
        win = gray[y1:y2, x1:x2]
        if win.shape[0] < tl.shape[0] or win.shape[1] < tl.shape[1]:
            return None
        sl = float(cv2.matchTemplate(win, tl, cv2.TM_CCOEFF_NORMED).max())
        sg = float(cv2.matchTemplate(_grad(win)[1:-1, 1:-1], tg, cv2.TM_CCOEFF_NORMED).max())
        return min(sl, sg)


def _grad(y: np.ndarray) -> np.ndarray:
    import cv2

    f = y.astype("float32")
    return cv2.magnitude(cv2.Sobel(f, cv2.CV_32F, 1, 0), cv2.Sobel(f, cv2.CV_32F, 0, 1))


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


@dataclass
class Frame:
    """What the simulator keeps of one picture while it is processed: no pixels beyond a 320x180 luma plane."""

    luma: float
    digest: str
    size: tuple[int, int]
    gray: np.ndarray


def decode(image_bytes: bytes) -> tuple[Frame, np.ndarray]:
    """Decode once: the stats the gate needs, the 320x180 luma plane for the reference, and the BGR frame."""
    import cv2
    import numpy as np

    bgr = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError("Frame cannot be decoded")
    gray_full = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    thumb = cv2.resize(gray_full, (32, 24), interpolation=cv2.INTER_AREA)
    gray = cv2.resize(gray_full, REF_SIZE, interpolation=cv2.INTER_AREA)
    return Frame(float(thumb.mean()), hashlib.sha1(thumb.tobytes()).hexdigest(), (bgr.shape[1], bgr.shape[0]), gray), bgr


def detail_crop(bgr: np.ndarray, zones: list[Zone]) -> tuple[bytes, tuple[int, int]] | None:
    """JPEG of the area covering every seat marked for a detail scan, and its top-left offset in the frame."""
    import cv2

    marked = [z for z in zones if z.kind == "seat" and z.detail]
    if not marked:
        return None
    h, w = bgr.shape[:2]
    x1, y1 = int(min(z.box[0] for z in marked) * w), int(min(z.box[1] for z in marked) * h)
    x2, y2 = int(max(z.box[2] for z in marked) * w), int(max(z.box[3] for z in marked) * h)
    if x2 - x1 < 32 or y2 - y1 < 32:
        return None
    ok, buf = cv2.imencode(".jpg", bgr[y1:y2, x1:x2], [cv2.IMWRITE_JPEG_QUALITY, 90])
    return (buf.tobytes(), (x1, y1)) if ok else None


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
    reference: EmptyReference | None = None
    reference_meta: dict | None = None               # who confirmed the cabin was empty, when, from what

    @property
    def seats(self) -> list[Zone]:
        return [z for z in self.zones if z.kind == "seat"]

    def set_zones(self, zones: list[Zone]) -> None:
        self.zones = zones
        if self.reference is not None:  # same picture, new seat outlines
            self.reference = EmptyReference(self.reference.gray, self.seats)

    def similarities(self, gray: np.ndarray) -> dict[str, float | None]:
        if self.reference is None:
            return {}
        return {z.name: self.reference.similarity(z, gray) for z in self.seats}

    def items(self, t: float, placed: list[dict], healthy: bool) -> list[dict]:
        if healthy:
            for det in placed:
                # "object" is an item the detector could not name (score < 0.5). In a cabin that is mostly headrests and
                # seat parts: shown on screen, but not reported as a forgotten item.
                if (det["counted"] and det.get("class") not in LIVING | CABIN_FIXTURES | {GENERIC_OBJECT}
                        and det["confidence"] >= ITEM_CONF):
                    prev = self.items_seen.get(det["class"])
                    if prev is None or t - prev[1] > 0.5 or det["confidence"] > prev[0]:
                        self.items_seen[det["class"]] = (det["confidence"], t)
        self.items_seen = {k: v for k, v in self.items_seen.items() if t - v[1] <= ITEM_HOLD_S}
        return [{"detection_id": f"item-{k}", "class_name": k, "confidence": round(c, 3)}
                for k, (c, _) in sorted(self.items_seen.items())]
