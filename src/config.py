from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_name: str = "CabinSentinel"
    app_env: Literal["development", "production", "test"] = "development"
    app_port: int = Field(default=8000, ge=1, le=65535)
    app_host: str = "0.0.0.0"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    cors_origins: str = "http://localhost:3000"
    max_upload_size_bytes: int = Field(default=5 * 1024 * 1024, ge=1)
    max_image_pixels: int = Field(default=20_000_000, ge=1)
    model_path: str = ""
    model_confidence: float = Field(default=0.25, gt=0, le=1)
    cabinsentinel_mqtt_enabled: bool = False
    mqtt_broker_host: str = "localhost"
    mqtt_broker_port: int = Field(default=1883, ge=1, le=65535)
    cabinsentinel_db_path: str = "data/cabinsentinel.db"

    # LLM
    openai_api_key: str = ""
    model_name: str = "gpt-4o-mini"
    llm_temperature: float = Field(default=0.7, ge=0.0, le=2.0)

    # Database
    database_url: str = "sqlite:///./data/app.db"

    # Vector Store
    chroma_persist_dir: str = "./data/chroma"

    @model_validator(mode="after")
    def restrict_production_cors(self):
        origins = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        if self.app_env == "production" and (not origins or "*" in origins):
            raise ValueError("CORS_ORIGINS must list explicit origins in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
