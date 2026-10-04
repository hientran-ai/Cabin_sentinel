"""Accounts provisioned from configuration survive hosts that lose their database on every restart."""

import logging
from types import SimpleNamespace

import pytest

from src.cabinsentinel.bootstrap_accounts import ensure_bootstrap_accounts
from src.cabinsentinel.fleet import Fleet
from src.cabinsentinel.platform_store import AccessDeniedError, PlatformStore
from src.cabinsentinel.service import CabinService

# Throwaway test values, not real credentials.
OWNER = ("owner@bootstrap.test", "owner-test-secret-1")
ADMIN = ("admin@bootstrap.test", "admin-test-secret-1")


def configured(**overrides):
    values = {
        "bootstrap_admin_email": "", "bootstrap_admin_password": "",
        "bootstrap_owner_email": "", "bootstrap_owner_password": "", "bootstrap_owner_user_id": "demo-owner",
    }
    return SimpleNamespace(**{**values, **overrides})


@pytest.fixture
def store(tmp_path):
    return PlatformStore(tmp_path / "platform.db")


def test_creates_the_configured_admin_and_owner(store):
    created = ensure_bootstrap_accounts(store, configured(
        bootstrap_admin_email=ADMIN[0], bootstrap_admin_password=ADMIN[1],
        bootstrap_owner_email=OWNER[0], bootstrap_owner_password=OWNER[1],
    ))
    assert created == ["admin", "owner"]
    assert store.login(*ADMIN)[0]["role"] == "admin"
    assert store.login(*OWNER)[0]["role"] == "owner"


def test_owner_gets_the_fixed_demo_owner_id_and_sees_the_demo_vehicles(store, tmp_path):
    ensure_bootstrap_accounts(store, configured(bootstrap_owner_email=OWNER[0], bootstrap_owner_password=OWNER[1]))
    user, session = store.login(*OWNER)
    assert user["user_id"] == "demo-owner"
    fleet = Fleet(CabinService(tmp_path / "state.db"))
    store.attach(fleet)
    assert fleet.visible(fleet.resolve(session["access_token"])) == ["VF8-DEMO-01", "VF9-DEMO-02"]


def test_existing_accounts_are_never_overwritten(store):
    settings = configured(bootstrap_owner_email=OWNER[0], bootstrap_owner_password=OWNER[1])
    assert ensure_bootstrap_accounts(store, settings) == ["owner"]
    rotated = configured(bootstrap_owner_email=OWNER[0], bootstrap_owner_password="a-different-secret-2")
    assert ensure_bootstrap_accounts(store, rotated) == []
    assert store.login(*OWNER)[0]["role"] == "owner"  # the original password still works
    with pytest.raises(AccessDeniedError):
        store.login(OWNER[0], "a-different-secret-2")


@pytest.mark.parametrize("settings", [
    configured(),
    configured(bootstrap_owner_email=OWNER[0]),
    configured(bootstrap_owner_password=OWNER[1]),
    configured(bootstrap_owner_email=OWNER[0], bootstrap_owner_password="tiny-pw1"),
])
def test_incomplete_or_weak_configuration_creates_nothing(store, settings, caplog):
    with caplog.at_level(logging.WARNING):
        assert ensure_bootstrap_accounts(store, settings) == []
    with pytest.raises(AccessDeniedError):
        store.login(OWNER[0], OWNER[1])
    assert "tiny-pw1" not in caplog.text


def test_failures_never_block_startup_and_never_log_the_password(caplog):
    class Broken:
        def create_user(self, *args, **kwargs):
            raise RuntimeError("database is locked")

    with caplog.at_level(logging.INFO):
        created = ensure_bootstrap_accounts(Broken(), configured(
            bootstrap_owner_email=OWNER[0], bootstrap_owner_password=OWNER[1]))
    assert created == []
    assert OWNER[1] not in caplog.text


def test_successful_creation_does_not_log_the_password(store, caplog):
    with caplog.at_level(logging.INFO):
        ensure_bootstrap_accounts(store, configured(
            bootstrap_owner_email=OWNER[0], bootstrap_owner_password=OWNER[1]))
    assert "Bootstrap owner created" in caplog.text
    assert OWNER[1] not in caplog.text


@pytest.mark.asyncio
async def test_lifespan_provisions_accounts_on_startup(monkeypatch, tmp_path, store):
    import src.main as main

    monkeypatch.setattr(main, "get_settings", lambda: configured(
        model_path="", model_confidence=0.25, cabinsentinel_mqtt_enabled=False,
        bootstrap_owner_email=OWNER[0], bootstrap_owner_password=OWNER[1],
    ))
    service = CabinService(tmp_path / "state.db")
    monkeypatch.setattr(main, "get_cabin_service", lambda: service)
    monkeypatch.setattr(main, "get_store", lambda: store)
    async with main.lifespan(main.app):
        assert store.login(*OWNER)[0]["role"] == "owner"
