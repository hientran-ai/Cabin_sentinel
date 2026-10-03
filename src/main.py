import logging
import sqlite3
import time
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.routes import router
from src.cabinsentinel import capabilities, fleet_api
from src.cabinsentinel.admin_api import router as admin_router
from src.cabinsentinel.api import get_cabin_service
from src.cabinsentinel.api import router as cabin_router
from src.cabinsentinel.demo_api import router as demo_router
from src.cabinsentinel.fleet_api import router as fleet_router
from src.cabinsentinel.monitoring import metrics
from src.cabinsentinel.mqtt import SensorSubscriber
from src.cabinsentinel.platform_api import router as platform_router
from src.cabinsentinel.platform_store import get_store
from src.cabinsentinel.service import CabinService
from src.cabinsentinel.timer import SafetyTimer
from src.cabinsentinel.upload_limit import DemoUploadLimitMiddleware
from src.config import get_settings
from src.vision.provider import TamVisionProvider

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.vision_provider = None
    if settings.model_path:
        try:
            app.state.vision_provider = TamVisionProvider(
                settings.model_path, confidence=settings.model_confidence,
            )
        except Exception:
            logger.exception("Vision model initialization failed; demo endpoint unavailable")
    else:
        logger.warning("MODEL_PATH is unset; Vision demo endpoint unavailable")
    admin_email = getattr(settings, "bootstrap_admin_email", "")
    admin_password = getattr(settings, "bootstrap_admin_password", "")
    if admin_email and admin_password:
        store = get_store()
        try:
            store.create_user(admin_email, admin_password, role="admin",
                              full_name="Bootstrap admin")
            logger.info("Bootstrap admin created")
        except ValueError:
            pass  # already exists
    timer = SafetyTimer(get_cabin_service())
    timer.start()
    app.state.safety_timer = timer
    subscriber = None
    if settings.cabinsentinel_mqtt_enabled:
        subscriber = SensorSubscriber(
            get_cabin_service(),
            host=settings.mqtt_broker_host,
            port=settings.mqtt_broker_port,
        )
        subscriber.start()
    app.state.sensor_subscriber = subscriber
    try:
        yield
    finally:
        try:
            if subscriber is not None:
                subscriber.stop()
        finally:
            timer.stop()
            app.state.sensor_subscriber = None
            app.state.safety_timer = None
            app.state.vision_provider = None


app = FastAPI(
    title="CabinSentinel",
    description="Offline in-cabin sensor fusion and deterministic safety agent",
    version="1.0.0",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(DemoUploadLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,  # origins are explicit (production rejects '*'); needed for the HttpOnly refresh cookie
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Correlation-ID"],
)

app.include_router(router, prefix="/api/v1")
app.include_router(cabin_router)
app.include_router(demo_router)
app.include_router(fleet_router)
app.include_router(platform_router)
app.include_router(admin_router)


@app.middleware("http")
async def private_api_responses(request, call_next):
    request.state.correlation_id = request.headers.get("X-Correlation-ID", "")[:64] or uuid4().hex
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        metrics.record(request.url.path, 500, (time.perf_counter() - started) * 1000)
        raise
    metrics.record(request.url.path, response.status_code, (time.perf_counter() - started) * 1000)
    response.headers["X-Correlation-ID"] = request.state.correlation_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(sqlite3.Error)
async def storage_unavailable(request, exc):
    logger.error("CabinService SQLite unavailable: %s", type(exc).__name__)
    return JSONResponse(status_code=503, content={"detail": "CabinService unavailable"})


@app.get("/health")
@app.get("/ready")
async def health(service: CabinService = Depends(get_cabin_service)):
    subscriber = getattr(app.state, "sensor_subscriber", None)
    mqtt = "connected" if subscriber and subscriber.connected else "disconnected" if subscriber else "disabled"
    vision = "ready" if getattr(app.state, "vision_provider", None) is not None else "unavailable"
    database = "ready" if service.database_ready() else "unavailable"
    timer = getattr(app.state, "safety_timer", None)
    timer_ready = bool(timer and timer.running and timer.last_error is None and timer.last_tick_at
                       and 0 <= (datetime.now(UTC) - datetime.fromisoformat(timer.last_tick_at)).total_seconds() <= 3)
    timer_status = "ready" if timer_ready else "degraded"
    ready = vision == "ready" and database == "ready" and mqtt != "disconnected" and timer_ready
    return JSONResponse(
        status_code=200 if ready else 503,
        content={
            "status": "ok" if ready else "degraded", "env": settings.app_env,
            "backend": "ready" if database == "ready" else "unavailable",
            "vision": vision, "database": database, "mqtt": mqtt, "safety_timer": timer_status,
            # Additive and informational: privacy/age never gate readiness, and the
            # preview is withheld (never raw) when privacy is unavailable.
            "capabilities": {
                "vision_model": capabilities.vision_model(),
                "privacy_model": capabilities.privacy_model(),
                "age_classifier": capabilities.age_classifier(),
                "camera_api": bool(getattr(app.state, "camera_api", False)),
                "mqtt": mqtt,
                "fleet": {
                    "vehicles": len(fleet_api.get_fleet().vehicles),
                    "device_ingest": fleet_api.get_fleet().device_ingest_enabled,
                    "demo_login": fleet_api.demo_login_enabled(),
                },
            },
        },
    )
