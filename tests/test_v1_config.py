import pytest

from src.config import Settings


def test_development_cors_includes_both_local_web_apps():
    origins = Settings(_env_file=None).cors_origins.split(",")

    assert "http://localhost:4173" in origins
    assert "http://localhost:4174" in origins
    assert "http://127.0.0.1:4173" in origins
    assert "http://127.0.0.1:4174" in origins


def test_production_requires_explicit_cors_origins():
    with pytest.raises(ValueError, match="CORS_ORIGINS"):
        Settings(_env_file=None, app_env="production", cors_origins="*")
    with pytest.raises(ValueError, match="CORS_ORIGINS"):
        Settings(_env_file=None, app_env="production", cors_origins="  ")


def test_production_accepts_vercel_and_local_origins():
    settings = Settings(
        _env_file=None, app_env="production",
        cors_origins="https://demo.vercel.app,http://localhost:3000",
    )
    assert settings.model_confidence == 0.25
    assert settings.cabinsentinel_mqtt_enabled is False


def test_agent_template_api_is_disabled_by_default_in_production():
    production = Settings(
        _env_file=None,
        app_env="production",
        cors_origins="https://demo.vercel.app",
    )
    development = Settings(_env_file=None, app_env="development")

    assert production.agent_enabled is False
    assert development.agent_enabled is True
    assert production.model_copy(update={"agent_api_enabled": True}).agent_enabled is True
