import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.routes import router
from src.cabinsentinel.api import get_cabin_service
from src.cabinsentinel.api import router as cabin_router
from src.cabinsentinel.demo_api import router as demo_router
from src.cabinsentinel.mqtt import SensorSubscriber
from src.cabinsentinel.service import CabinService
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
    subscriber = None
    if settings.cabinsentinel_mqtt_enabled:
        subscriber = SensorSubscriber(
            get_cabin_service(),
            host=settings.mqtt_broker_host,
            port=settings.mqtt_broker_port,
        )
        subscriber.start()
    app.state.sensor_subscriber = subscriber
    yield
    if subscriber is not None:
        subscriber.stop()
    app.state.sensor_subscriber = None
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
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")
app.include_router(cabin_router)
app.include_router(demo_router)


@app.get("/health")
async def health(service: CabinService = Depends(get_cabin_service)):
    subscriber = getattr(app.state, "sensor_subscriber", None)
    mqtt = "connected" if subscriber and subscriber.connected else "disconnected" if subscriber else "disabled"
    vision = "ready" if getattr(app.state, "vision_provider", None) is not None else "unavailable"
    database = "ready" if service.database_ready() else "unavailable"
    ready = vision == "ready" and database == "ready" and mqtt != "disconnected"
    return JSONResponse(
        status_code=200 if ready else 503,
        content={
            "status": "ok" if ready else "degraded", "env": settings.app_env,
            "backend": "ready" if database == "ready" else "unavailable",
            "vision": vision, "database": database, "mqtt": mqtt,
        },
    )
