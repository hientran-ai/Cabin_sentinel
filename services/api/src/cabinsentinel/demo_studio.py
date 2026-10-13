"""Demo studio: lets a visitor drive the demo fleet from the web and watch the whole chain react.

Everything here is SIMULATED and says so. A background feeder publishes sensor and camera snapshots for the demo
vehicles through the same ingest path a real device uses (the rules in rules.py still decide every risk level), so the
fleet stays online, incidents open on their own, and the operator can walk through assign -> act -> resolve. It is
off unless DEMO_STUDIO=true and only an administrator can change a scenario.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime
from time import perf_counter
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from src.cabinsentinel import notify, video_sim
from src.cabinsentinel.fleet import DEFAULT_VEHICLES, Fleet, Grant
from src.cabinsentinel.fleet_api import current_grant
from src.cabinsentinel.models import SensorPayload, VisionPayload
from src.cabinsentinel.platform_api import audit, get_platform
from src.cabinsentinel.platform_store import PlatformStore

logger = logging.getLogger(__name__)
LABEL = "SIMULATED"
TICK_S = 2.0  # vision data goes stale after 3 s, so publish faster than that
PERSON = [{"class_name": "person", "confidence": 0.91}]

SCENARIOS: dict[str, dict] = {
    "SAFE": {"label": "An toàn", "description": "Xe tắt máy, 24 °C, không có người: SAFE / EMPTY_CABIN.", "temperature": 24.0,
             "radar": False, "objects": []},
    "WARNING": {"label": "Cảnh báo", "description": "Có người trong xe, 28 °C: WARNING, mở sự cố.", "temperature": 28.0,
                "radar": True, "objects": PERSON},
    "CRITICAL": {"label": "Nguy hiểm", "description": "Người trong xe đóng cửa, 39,2 °C: CRITICAL, thông báo ngay, leo thang sau 90 giây.",
                 "temperature": 39.2, "radar": True, "objects": PERSON},
    "RAMP": {"label": "Nóng dần", "description": "Bắt đầu 28 °C, tăng 0,5 °C mỗi 2 giây tới 41 °C: WARNING rồi CRITICAL.",
             "temperature": 28.0, "radar": True, "objects": PERSON, "ramp": 0.25, "max": 41.0},
    "VIDEO": {"label": "Camera mô phỏng", "description": "Hình từ video (mẫu hoặc tải lên) thay camera trong xe; rules quyết định như xe thật.",
              "temperature": None, "radar": False, "objects": [], "video": True},
    "OFFLINE": {"label": "Mất kết nối", "description": "Không gửi gì: dữ liệu cũ dần, quyết định về UNKNOWN/ERROR, không bao giờ là 'trống'.",
                "temperature": None, "radar": False, "objects": []},
}
DEFAULTS = {"VF8-DEMO-01": "SAFE", "VF9-DEMO-02": "WARNING", "VF5-DEMO-03": "SAFE", "VF3-DEMO-04": "SAFE"}


class DemoStudio:
    def __init__(self, fleet: Fleet, store: PlatformStore | None):
        self.fleet = fleet
        self.store = store
        self.vehicles = [v["vehicle_id"] for v in DEFAULT_VEHICLES if v["vehicle_id"] in fleet.vehicles]
        self.scenario = {vid: DEFAULTS.get(vid, "SAFE") for vid in self.vehicles}
        self._ticks = dict.fromkeys(self.vehicles, 0)
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.last_error: str | None = None
        self._seq = 0
        self.video: dict[str, video_sim.VideoRun] = {}

    def _next_seq(self, now: datetime) -> int:
        # Monotonic across restarts (milliseconds) and within one clock reading (counter), so no snapshot is ever "stale".
        self._seq = max(self._seq + 1, int(now.timestamp() * 1000))
        return self._seq

    # -- feeding -------------------------------------------------------------------------
    def publish(self, vehicle_id: str, now: datetime | None = None) -> None:
        spec = SCENARIOS[self.scenario[vehicle_id]]
        run = self.video.get(vehicle_id) if spec.get("video") else None
        if spec["temperature"] is None and run is None:
            return
        now = now or self.fleet.clock()
        seq = self._next_seq(now)
        temperature = run.temperature if run is not None else spec["temperature"]
        if spec.get("ramp"):
            temperature = min(spec["max"], temperature + spec["ramp"] * self._ticks[vehicle_id])
            self._ticks[vehicle_id] += 1
        sensor = SensorPayload(
            vehicle_id=vehicle_id, timestamp=now, sequence=seq, temperature=round(temperature, 1), engine_status="OFF",
            doors_locked=True, radar_presence=spec["radar"], driver_present=False, gear="P", vehicle_speed_kph=0.0,
            hvac_status="INACTIVE", window_status="CLOSED", powertrain_type="EV", operation_mode="NONE")
        service = self.fleet.service
        service.ingest_sensor(sensor)
        if run is None:  # with a video the camera picture comes from video_frame, frame by frame
            service.ingest_vision(VisionPayload(vehicle_id=vehicle_id, timestamp=now, frame_id=f"studio-{seq}",
                                                camera_status="OK", detected_objects=spec["objects"]))
        self.fleet.note_source(vehicle_id, LABEL)
        if self.store is not None:
            self.store.record_sample(vehicle_id, service.get_state_with_freshness(vehicle_id))

    def tick(self) -> None:
        with self._lock:
            for vid in self.vehicles:
                try:
                    self.publish(vid)
                except Exception as exc:  # one bad vehicle must not stop the others
                    self.last_error = f"{vid}: {type(exc).__name__}"
                    logger.warning("Demo studio could not publish for %s (%s)", vid, type(exc).__name__)

    def _loop(self) -> None:
        while not self._stop.wait(TICK_S):
            self.tick()

    def start(self) -> None:
        if self._thread is None:
            self.tick()
            self._thread = threading.Thread(target=self._loop, daemon=True, name="demo-studio")
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=3)
            self._thread = None

    # -- control -------------------------------------------------------------------------
    def run(self, vehicle_id: str, scenario: str) -> dict:
        if vehicle_id not in self.scenario:
            raise KeyError(vehicle_id)
        if SCENARIOS[scenario].get("video"):
            raise ValueError("Start a video with /video/start")
        with self._lock:
            self.scenario[vehicle_id] = scenario
            self.video.pop(vehicle_id, None)
            self._ticks[vehicle_id] = 0
            self.publish(vehicle_id)
        return self.vehicle_status(vehicle_id)

    # -- camera simulator ------------------------------------------------------------------
    def start_video(self, vehicle_id: str, temperature: float, zones: list[video_sim.Zone], sample: str | None) -> dict:
        """Clean slate for this vehicle, then its camera is the video. Time to the first alert is measured from here."""
        if vehicle_id not in self.scenario:
            raise KeyError(vehicle_id)
        with self._lock:
            self.fleet.service.reset_vehicle(vehicle_id)
            if self.store is not None:
                self.store.reset_vehicle_ops(vehicle_id)
            self.scenario[vehicle_id] = "VIDEO"
            self.video[vehicle_id] = video_sim.VideoRun(vehicle_id, temperature, zones, sample)
            self.publish(vehicle_id)
        return self.vehicle_status(vehicle_id)

    def stop_video(self, vehicle_id: str) -> dict:
        if vehicle_id not in self.scenario:
            raise KeyError(vehicle_id)
        with self._lock:
            self.video.pop(vehicle_id, None)
            if self.scenario[vehicle_id] == "VIDEO":
                self.scenario[vehicle_id] = DEFAULTS.get(vehicle_id, "SAFE")
                self.publish(vehicle_id)
        return self.vehicle_status(vehicle_id)

    def set_zones(self, vehicle_id: str, zones: list[video_sim.Zone]) -> None:
        with self._lock:
            if vehicle_id in self.video:
                self.video[vehicle_id].set_zones(zones)

    def set_reference(self, vehicle_id: str, gray, meta: dict) -> dict:
        """The cabin is confirmed empty by a person: compare every seat with this picture from now on (SR-09)."""
        with self._lock:
            run = self.video.get(vehicle_id)
            if run is None or self.scenario.get(vehicle_id) != "VIDEO":
                raise LookupError(vehicle_id)
            run.reference = video_sim.EmptyReference(gray, run.seats)
            run.reference_meta = meta
            return {"seats": len(run.seats), **meta}

    def video_frame(self, vehicle_id: str, sequence: int, detections: list[dict], latency_ms: float | None,
                    frame: video_sim.Frame, now: datetime | None = None) -> dict:
        """One picture from the simulated camera, through the device ingest path. Nothing of the image is kept."""
        with self._lock:
            run = self.video.get(vehicle_id)
            if run is None or self.scenario.get(vehicle_id) != "VIDEO":
                raise LookupError(vehicle_id)
            if sequence <= run.last_sequence:
                raise ValueError("Frame arrived after a newer one")
            run.last_sequence, run.frames = sequence, run.frames + 1
            now = now or self.fleet.clock()
            t = now.timestamp()
            status = run.gate.check(frame.luma, frame.digest)
            healthy = status == "OK"
            placed = video_sim.place(detections, run.zones, *frame.size)
            sims = run.similarities(frame.gray) if healthy else {}
            seats = run.smoother.update(t, placed, healthy, sims, run.seats)
            objects = run.smoother.occupants(run.seats) + run.items(t, placed, healthy) if healthy else []
            size = frame.size
            seq = self._next_seq(now)
            started = perf_counter()
            service = self.fleet.service
            service.ingest_vision(VisionPayload(vehicle_id=vehicle_id, timestamp=now, frame_id=f"video-{seq}",
                                                camera_status=status, detected_objects=objects,
                                                vision_latency_ms=latency_ms))
            self.fleet.note_source(vehicle_id, LABEL)
            state = service.get_state_with_freshness(vehicle_id) or {}
            rules_ms = (perf_counter() - started) * 1000
            summary = self.fleet.summary(vehicle_id)
        return {
            "label": LABEL, "vehicle_id": vehicle_id, "sequence": sequence, "camera_status": status,
            "frame": {"width": size[0], "height": size[1]},
            "detections": [{"class": d.get("class"), "confidence": round(float(d.get("confidence") or 0), 3),
                            "bbox": [round(float(v), 1) for v in d["bbox"]] if d.get("bbox") else None,
                            "zone": d["zone"], "counted": d["counted"], "detail": bool(d.get("detail"))} for d in placed],
            "seats": seats, "evidence": objects, "reference": run.reference_meta,
            "risk_level": state.get("risk_level"), "rule_id": state.get("rule_id"), "reason": state.get("reason"),
            "occupancy_state": state.get("occupancy_state"), "active_incident": summary["active_incident"],
            "timing": {"inference_ms": round(latency_ms, 1) if latency_ms is not None else None,
                       "rules_ms": round(rules_ms, 1)},
        }

    def reset(self) -> list[str]:
        """Back to a clean slate: no history, no operator work, default scenarios."""
        with self._lock:
            self.video.clear()
            for vid in self.vehicles:
                self.fleet.service.reset_vehicle(vid)
                if self.store is not None:
                    self.store.reset_vehicle_ops(vid)
                self.scenario[vid] = DEFAULTS.get(vid, "SAFE")
                self._ticks[vid] = 0
                self.publish(vid)
        return list(self.vehicles)

    def vehicle_status(self, vehicle_id: str) -> dict:
        summary = self.fleet.summary(vehicle_id)
        return {"vehicle_id": vehicle_id, "name": summary["vehicle_name"], "scenario": self.scenario[vehicle_id],
                "risk_level": summary["risk_level"], "online": summary["online"], "temperature_c": summary["temperature_c"],
                "active_incident": summary["active_incident"], "data_source": summary["data_source"],
                "video": ({"sample": self.video[vehicle_id].sample, "frames": self.video[vehicle_id].frames}
                          if vehicle_id in self.video else None)}

    def status(self) -> dict:
        return {"enabled": True, "label": LABEL,
                "scenarios": [{"id": k, "label": v["label"], "description": v["description"]} for k, v in SCENARIOS.items()],
                "vehicles": [self.vehicle_status(v) for v in self.vehicles],
                "notifications": {**notify.channels(), "recent": notify.recent()[:8]},
                "last_error": self.last_error}


_studio: DemoStudio | None = None


def get_studio() -> DemoStudio | None:
    return _studio


def start_studio(fleet: Fleet, store: PlatformStore | None) -> DemoStudio:
    global _studio
    _studio = DemoStudio(fleet, store)
    _studio.start()
    return _studio


def stop_studio() -> None:
    global _studio
    if _studio is not None:
        _studio.stop()
        _studio = None


router = APIRouter(prefix="/api/v1/admin/demo", tags=["Demo studio (simulated)"])


def studio_admin(grant: Grant = Depends(current_grant)) -> Grant:
    if grant.role != "admin" or grant.tenant_id is not None:
        raise HTTPException(status_code=403, detail="Platform administrator required")
    return grant


def require_studio() -> DemoStudio:
    if get_studio() is None:
        raise HTTPException(status_code=404, detail="Demo studio is disabled")
    return get_studio()


class RunInput(BaseModel):
    vehicle_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")
    scenario: Literal["SAFE", "WARNING", "CRITICAL", "RAMP", "OFFLINE"]


@router.get("/status")
def demo_status(grant: Grant = Depends(studio_admin)) -> dict:
    return require_studio().status()


@router.post("/run")
def demo_run(payload: RunInput, request: Request, grant: Grant = Depends(studio_admin),
             store: PlatformStore = Depends(get_platform)) -> dict:
    try:
        out = require_studio().run(payload.vehicle_id, payload.scenario)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Not a demo vehicle") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    audit(request, store, grant, "demo.run", payload.vehicle_id, actor=grant.subject, scenario=payload.scenario, label=LABEL)
    return {"label": LABEL, **out}


@router.post("/reset")
def demo_reset(request: Request, grant: Grant = Depends(studio_admin), store: PlatformStore = Depends(get_platform)) -> dict:
    vehicles = require_studio().reset()
    audit(request, store, grant, "demo.reset", None, actor=grant.subject, vehicles=len(vehicles), label=LABEL)
    return {"label": LABEL, "reset": vehicles}


@router.post("/notify-test")
def demo_notify_test(request: Request, grant: Grant = Depends(studio_admin), store: PlatformStore = Depends(get_platform)) -> dict:
    """Send one harmless test message through the configured channels so a visitor can see it arrive."""
    if not notify.configured():
        raise HTTPException(status_code=409, detail="No notification channel is configured")
    results = notify.deliver("CabinSentinel: thử kênh thông báo", "Tin thử từ Demo studio. Không có sự cố nào.", urgent=False)
    audit(request, store, grant, "demo.notify_test", None, actor=grant.subject, channels=[r["channel"] for r in results])
    return {"label": LABEL, "results": results}


# -- camera simulator and cabin calibration --------------------------------------------------------------------------
VIDEO_IMAGE_TYPES = {"image/jpeg", "image/png"}
MAX_VIDEO_FRAME_BYTES = 2 * 1024 * 1024


class ZoneInput(BaseModel):
    name: str = Field(min_length=1, max_length=32)
    kind: Literal["seat", "exclude"]
    box: list[float] = Field(min_length=4, max_length=4)
    child_seat: Literal["rear_facing", "forward_facing"] | None = None
    detail: bool = False


class CalibrationInput(BaseModel):
    zones: list[ZoneInput] = Field(max_length=video_sim.MAX_ZONES)


class VideoStartInput(BaseModel):
    vehicle_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")
    temperature: float = Field(default=30.0, ge=10.0, le=60.0)
    sample: str | None = Field(default=None, pattern=r"^[a-z0-9-]{1,40}$")
    # Zones for this run only (a sample video ships its own); omitted means the vehicle's saved calibration.
    zones: list[ZoneInput] | None = Field(default=None, max_length=video_sim.MAX_ZONES)


class VideoStopInput(BaseModel):
    vehicle_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")


def _zones(raw: list[ZoneInput]) -> list[video_sim.Zone]:
    try:
        return video_sim.parse_zones([z.model_dump() for z in raw])
    except video_sim.CalibrationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _saved_zones(store: PlatformStore, vehicle_id: str) -> list[video_sim.Zone]:
    saved = store.calibration(vehicle_id)
    return video_sim.parse_zones(saved["zones"]) if saved else []


@router.get("/calibration/{vehicle_id}")
def get_calibration(vehicle_id: str, grant: Grant = Depends(studio_admin), store: PlatformStore = Depends(get_platform)) -> dict:
    if vehicle_id not in require_studio().scenario:
        raise HTTPException(status_code=404, detail="Not a demo vehicle")
    return {"vehicle_id": vehicle_id, "calibration": store.calibration(vehicle_id)}


@router.put("/calibration/{vehicle_id}")
def put_calibration(vehicle_id: str, payload: CalibrationInput, request: Request, grant: Grant = Depends(studio_admin),
                    store: PlatformStore = Depends(get_platform)) -> dict:
    """Installation step: mark the seats and the windows for this vehicle's camera. Audited with who and when."""
    studio = require_studio()
    if vehicle_id not in studio.scenario:
        raise HTTPException(status_code=404, detail="Not a demo vehicle")
    zones = _zones(payload.zones)
    saved = store.save_calibration(vehicle_id, [z.as_dict() for z in zones],
                                   grant.subject)
    studio.set_zones(vehicle_id, zones)
    audit(request, store, grant, "vehicle.calibration", vehicle_id, actor=grant.subject, version=saved["version"],
          seats=sum(z.kind == "seat" for z in zones), excluded=sum(z.kind == "exclude" for z in zones))
    return {"vehicle_id": vehicle_id, "calibration": saved}


@router.post("/video/start")
def video_start(payload: VideoStartInput, request: Request, grant: Grant = Depends(studio_admin),
                store: PlatformStore = Depends(get_platform)) -> dict:
    studio = require_studio()
    if payload.vehicle_id not in studio.scenario:
        raise HTTPException(status_code=404, detail="Not a demo vehicle")
    zones = _zones(payload.zones) if payload.zones is not None else _saved_zones(store, payload.vehicle_id)
    out = studio.start_video(payload.vehicle_id, payload.temperature, zones, payload.sample)
    audit(request, store, grant, "demo.video_start", payload.vehicle_id, actor=grant.subject, sample=payload.sample,
          temperature=payload.temperature, zones=len(zones), label=LABEL)
    return {"label": LABEL, **out, "zones": [z.as_dict() for z in zones]}


@router.post("/video/stop")
def video_stop(payload: VideoStopInput, request: Request, grant: Grant = Depends(studio_admin),
               store: PlatformStore = Depends(get_platform)) -> dict:
    try:
        out = require_studio().stop_video(payload.vehicle_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Not a demo vehicle") from exc
    audit(request, store, grant, "demo.video_stop", payload.vehicle_id, actor=grant.subject, label=LABEL)
    return {"label": LABEL, **out}


@router.post("/video/frame")
async def video_frame(request: Request, vehicle_id: str = Form(..., pattern=r"^[A-Za-z0-9_-]{1,64}$"),
                      sequence: int = Form(..., ge=1), image: UploadFile = File(...),
                      grant: Grant = Depends(studio_admin)) -> dict:
    """One frame of the simulated camera: detect, place in cabin zones, smooth per seat, ingest like a device."""
    studio = require_studio()
    received = perf_counter()
    if image.content_type not in VIDEO_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Only JPEG and PNG frames are supported")
    data = await image.read(MAX_VIDEO_FRAME_BYTES + 1)
    if not data or len(data) > MAX_VIDEO_FRAME_BYTES:
        raise HTTPException(status_code=413, detail="Frame is empty or too large")
    provider = getattr(request.app.state, "vision_provider", None)
    if provider is None:
        raise HTTPException(status_code=503, detail="Vision model unavailable")
    run = studio.video.get(vehicle_id)
    try:
        decoded, bgr = video_sim.decode(data)
        result = await run_in_threadpool(provider.infer, data)
        detections = list(result.get("detections") or [])
        latency = result.get("latency_ms")
        # Detail scan: the seats marked at calibration again, enlarged, so a small or half-hidden occupant has more pixels.
        crop = video_sim.detail_crop(bgr, run.zones) if run is not None else None
        if crop is not None:
            extra = await run_in_threadpool(provider.infer, crop[0])
            ox, oy = crop[1]
            for d in extra.get("detections") or []:
                if d.get("bbox"):
                    b = d["bbox"]
                    detections.append({**d, "bbox": [b[0] + ox, b[1] + oy, b[2] + ox, b[3] + oy], "detail": True})
            if latency is not None and extra.get("latency_ms") is not None:
                latency += extra["latency_ms"]
    except Exception as exc:
        logger.warning("Video frame could not be processed (%s)", type(exc).__name__)
        raise HTTPException(status_code=422, detail="Frame cannot be decoded") from exc
    try:
        out = studio.video_frame(vehicle_id, sequence, detections, latency, decoded)
    except LookupError as exc:
        raise HTTPException(status_code=409, detail="No video is running for this vehicle") from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    out["timing"]["server_ms"] = round((perf_counter() - received) * 1000, 1)
    return out


@router.post("/video/reference")
async def video_reference(request: Request, vehicle_id: str = Form(..., pattern=r"^[A-Za-z0-9_-]{1,64}$"),
                          confirm_empty: bool = Form(...), source: Literal["sample", "frame"] = Form(...),
                          image: UploadFile = File(...), grant: Grant = Depends(studio_admin),
                          store: PlatformStore = Depends(get_platform)) -> dict:
    """Take the verified-empty reference for this run. A person must confirm the cabin is empty (SR-09): an occupant
    captured in the reference would make that seat read as empty. Kept in memory for the run only."""
    if confirm_empty is not True:
        raise HTTPException(status_code=422, detail="Confirm that the cabin is empty before taking the reference")
    if image.content_type not in VIDEO_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Only JPEG and PNG frames are supported")
    data = await image.read(MAX_VIDEO_FRAME_BYTES + 1)
    if not data or len(data) > MAX_VIDEO_FRAME_BYTES:
        raise HTTPException(status_code=413, detail="Frame is empty or too large")
    try:
        decoded, _ = video_sim.decode(data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Frame cannot be decoded") from exc
    if decoded.luma < video_sim.DARK_LUMA:
        raise HTTPException(status_code=422, detail="The picture is too dark to serve as the empty-cabin reference")
    meta = {"confirmed_by": grant.subject, "confirmed_at": require_studio().fleet.clock().isoformat(), "source": source}
    try:
        out = require_studio().set_reference(vehicle_id, decoded.gray, meta)
    except LookupError as exc:
        raise HTTPException(status_code=409, detail="No video is running for this vehicle") from exc
    audit(request, store, grant, "demo.empty_reference", vehicle_id, actor=grant.subject, source=source, label=LABEL)
    return {"label": LABEL, "vehicle_id": vehicle_id, "reference": out}
