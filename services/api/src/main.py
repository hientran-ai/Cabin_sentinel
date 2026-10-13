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
from src.cabinsentinel.bootstrap_accounts import ensure_bootstrap_accounts
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
    if getattr(settings, "app_env", "development") == "production" and not getattr(
        settings, "platform_signing_key", ""
    ):
        logger.error(
            "PLATFORM_SIGNING_KEY is unset; signed evidence URLs will become invalid after a restart",
        )
    app.state.vision_provider = None
    if settings.model_path:
        age_path = getattr(settings, "age_classifier_path", "")
        age_options = {}
        if age_path:
            try:
                from src.vision.age import AgeClassifier

                age_options["age_classifier"] = AgeClassifier(
                    age_path, settings.age_child_threshold, settings.age_adult_threshold,
                )
            except Exception as exc:
                # Occupancy detection must keep working; people are reported age_group=unknown.
                age_options["age_load_error"] = f"{type(exc).__name__}: {exc}"[:200]
                logger.exception("Age classifier initialization failed; age_group will be unknown")
        try:
            app.state.vision_provider = TamVisionProvider(
                settings.model_path, confidence=settings.model_confidence,
                **age_options,
            )
        except Exception:
            logger.exception("Vision model initialization failed; demo endpoint unavailable")
    else:
        logger.warning("MODEL_PATH is unset; Vision demo endpoint unavailable")
    if any(getattr(settings, name, "") for name in ("bootstrap_admin_email", "bootstrap_owner_email")):
        ensure_bootstrap_accounts(get_store(), settings)
    # Same source /health uses, so /admin/system/vision cannot report a different classifier state.
    capabilities.bind_age_status(
        lambda: getattr(getattr(app.state, "vision_provider", None), "age_status", "disabled"))
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
            capabilities.bind_age_status(None)
            timer.stop()
            app.state.sensor_subscriber = None
            app.state.safety_timer = None
            app.state.vision_provider = None


app = FastAPI(
    title="CabinSentinel",
    description="Offline in-cabin sensor fusion and deterministic safety agent",
    version="1.0.0",
    lifespan=lifespan,
    # The API reference is for developers; a production deployment does not publish its own attack surface.
    docs_url="/docs" if get_settings().api_docs_enabled else None,
    redoc_url="/redoc" if get_settings().api_docs_enabled else None,
    openapi_url="/openapi.json" if get_settings().api_docs_enabled else None,
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

if settings.agent_enabled:
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
    age_status = getattr(getattr(app.state, "vision_provider", None), "age_status", "disabled")
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
            "vision": vision, "age_classifier": age_status, "database": database, "mqtt": mqtt, "safety_timer": timer_status,
            # Additive and informational: privacy/age never gate readiness, and the
            # preview is withheld (never raw) when privacy is unavailable.
            "vision_device": getattr(getattr(app.state, "vision_provider", None), "device", None),
            "vision_resources": (
                app.state.vision_provider.resources.snapshot()
                if getattr(getattr(app.state, "vision_provider", None), "resources", None) is not None
                else None
            ),
            "storage": capabilities.storage(settings.cabinsentinel_db_path),
            "capabilities": {
                "vision_model": capabilities.vision_model(),
                "privacy_model": capabilities.privacy_model(),
                "age_classifier": capabilities.age_classifier(age_status),
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
