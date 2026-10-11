"""The bell: alerts, new device, camera/connection problems, update notice; only your own vehicles."""
from app import alerts, config, main, notifications
from tests.test_api import env  # noqa: F401
from tests.test_cabinlog import PERSON, tick  # noqa: F401
from tests.test_production import frame, login, prod, setup_car  # noqa: F401


def bell(c, h, **q):
    return c.get("/v1/me/notifications", params=q, headers=h).json()


def test_bell_lists_new_device_alert_camera_and_closed_incident(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    tick(c, clock, dh, frame())
    tick(c, clock, dh, frame(camera_ok=False), 5)
    tick(c, clock, dh, frame(camera_ok=False), 30)
    tick(c, clock, dh, frame(), 5)
    tick(c, clock, dh, PERSON, 5)
    kinds = [i["kind"] for i in bell(c, h)["items"]]
    assert {"alert", "device", "camera"} <= set(kinds)
    first = bell(c, h)["items"][0]
    assert first["kind"] == "alert" and first["level"] == "critical" and first["incident_id"] and first["vehicle_name"] == "Xe nhà"   # newest first
    assert any(i["title"].startswith("Thiết bị trong xe đã kết nối") or i["title"].startswith("Đã ghép") for i in bell(c, h)["items"] if i["kind"] == "device")
    cam = next(i for i in bell(c, h)["items"] if i["kind"] == "camera")
    assert "Không coi là xe an toàn" in cam["detail"]
    inc = first["incident_id"]
    tick(c, clock, dh, frame(), 10)
    rev = c.get(f"/v1/incidents/{inc}", headers=h).json()["revision"]
    assert c.post(f"/v1/incidents/{inc}/confirm", json={"revision": rev, "checks": ["seats", "floor", "trunk"]}, headers=h).json()["result"] == "resolved"
    items = bell(c, h)["items"]
    assert any(i["kind"] == "resolved" and i["incident_id"] == inc for i in items) and not any(i["kind"] == "alert" for i in items)
    assert len(bell(c, h, limit=2)["items"]) == 2


def test_bell_shows_only_your_own_vehicles_and_needs_login(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    tick(c, clock, dh, PERSON)
    h2, _ = login(c, sent, phone="0912000333", name="Người lạ")
    assert bell(c, h2)["items"] == []
    assert c.get("/v1/me/notifications").status_code == 401


def test_update_notice_only_for_older_apps_and_web_build_is_exposed(prod, monkeypatch):
    c, clock, sent, _ = prod
    h, uid = login(c, sent)
    assert bell(c, h, app="2.0")["update"] is False                                   # nothing announced until a newer build is configured
    monkeypatch.setattr(config, "APP_LATEST_IOS", "2.1")
    monkeypatch.setattr(config, "APP_UPDATE_URL", "https://testflight.apple.com/join/x")
    b = bell(c, h, app="2.0")
    assert b["update"] is True and b["items"][0]["kind"] == "update" and b["items"][0]["url"].startswith("https://")
    assert bell(c, h, app="2.1")["update"] is False and bell(c, h, app="2.10")["update"] is False and bell(c, h)["update"] is False
    assert notifications._ver("2.10") > notifications._ver("2.9")
    assert b["server_build"] == config.WEB_BUILD and c.get("/health").json()["web_build"] == config.WEB_BUILD
