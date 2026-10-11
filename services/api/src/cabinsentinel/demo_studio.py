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
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from src.cabinsentinel import notify
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

    # -- feeding -------------------------------------------------------------------------
    def publish(self, vehicle_id: str, now: datetime | None = None) -> None:
        spec = SCENARIOS[self.scenario[vehicle_id]]
        if spec["temperature"] is None:
            return
        now = now or self.fleet.clock()
        # Monotonic across restarts (milliseconds) and within one clock reading (counter), so no snapshot is ever "stale".
        self._seq = max(self._seq + 1, int(now.timestamp() * 1000))
        seq = self._seq
        temperature = spec["temperature"]
        if spec.get("ramp"):
            temperature = min(spec["max"], temperature + spec["ramp"] * self._ticks[vehicle_id])
            self._ticks[vehicle_id] += 1
        sensor = SensorPayload(
            vehicle_id=vehicle_id, timestamp=now, sequence=seq, temperature=round(temperature, 1), engine_status="OFF",
            doors_locked=True, radar_presence=spec["radar"], driver_present=False, gear="P", vehicle_speed_kph=0.0,
            hvac_status="INACTIVE", window_status="CLOSED", powertrain_type="EV", operation_mode="NONE")
        vision = VisionPayload(vehicle_id=vehicle_id, timestamp=now, frame_id=f"studio-{seq}", camera_status="OK",
                               detected_objects=spec["objects"])
        service = self.fleet.service
        service.ingest_sensor(sensor)
        service.ingest_vision(vision)
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
        with self._lock:
            self.scenario[vehicle_id] = scenario
            self._ticks[vehicle_id] = 0
            self.publish(vehicle_id)
        return self.vehicle_status(vehicle_id)

    def reset(self) -> list[str]:
        """Back to a clean slate: no history, no operator work, default scenarios."""
        with self._lock:
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
                "active_incident": summary["active_incident"], "data_source": summary["data_source"]}

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
