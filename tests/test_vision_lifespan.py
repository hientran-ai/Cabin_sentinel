"""A configured model loads at startup and is reused until shutdown."""

from types import SimpleNamespace

import pytest

import src.main as main


@pytest.mark.asyncio
async def test_lifespan_loads_model_once_and_reuses_provider(monkeypatch, tmp_path):
    model_path = tmp_path / "model.pt"
    model_path.write_bytes(b"fixture")
    loads = []

    class FakeProvider:
        def __init__(self, path, *, confidence):
            loads.append((path, confidence))

    monkeypatch.setattr(main, "get_settings", lambda: SimpleNamespace(
        model_path=str(model_path), model_confidence=0.25,
        cabinsentinel_mqtt_enabled=False,
    ))
    monkeypatch.setattr(main, "TamVisionProvider", FakeProvider)
    async with main.lifespan(main.app):
        assert isinstance(main.app.state.vision_provider, FakeProvider)
        assert main.app.state.sensor_subscriber is None
    assert loads == [(str(model_path), 0.25)]
    assert main.app.state.vision_provider is None


@pytest.mark.asyncio
async def test_lifespan_exposes_unavailable_model_without_crashing(monkeypatch):
    monkeypatch.setattr(main, "get_settings", lambda: SimpleNamespace(
        model_path="missing.pt", model_confidence=0.25,
        cabinsentinel_mqtt_enabled=False,
    ))

    class FailingProvider:
        def __init__(self, path, *, confidence):
            raise FileNotFoundError("missing model")

    monkeypatch.setattr(main, "TamVisionProvider", FailingProvider)
    async with main.lifespan(main.app):
        assert main.app.state.vision_provider is None
