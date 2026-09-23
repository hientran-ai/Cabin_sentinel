import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.routes import router
from src.cabinsentinel.api import get_cabin_service
from src.cabinsentinel.api import router as cabin_router
from src.cabinsentinel.mqtt import SensorSubscriber
from src.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    print(f"Starting {settings.app_name} in {settings.app_env} mode")
    subscriber = None
    if settings.app_env != "test" and os.getenv("CABINSENTINEL_MQTT_ENABLED", "true").lower() == "true":
        subscriber = SensorSubscriber(
            get_cabin_service(),
            host=os.getenv("MQTT_BROKER_HOST", "localhost"),
            port=int(os.getenv("MQTT_BROKER_PORT", "1883")),
        )
        subscriber.start()
    app.state.sensor_subscriber = subscriber
    yield
    if subscriber is not None:
        subscriber.stop()
    app.state.sensor_subscriber = None
    print("Shutting down...")


app = FastAPI(
    title="CabinSentinel",
    description="Offline in-cabin sensor fusion and deterministic safety agent",
    version="1.0.0",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")
app.include_router(cabin_router)


@app.get("/health")
async def health():
    subscriber = getattr(app.state, "sensor_subscriber", None)
    if subscriber is not None and not subscriber.connected:
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "env": settings.app_env, "mqtt": "disconnected"},
        )
    return {"status": "ok", "env": settings.app_env, "mqtt": "connected" if subscriber else "disabled"}
