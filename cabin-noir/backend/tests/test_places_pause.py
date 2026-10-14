"""Fixed pickup places (per person) and pausing monitoring until the owner turns it back on."""
from app import alerts, db, logic, main
from tests.test_api import env  # noqa: F401
from tests.test_production import frame, login, prod, setup_car  # noqa: F401

HOME = {"name": "Nhà", "address": "12 Nguyễn Huệ, Quận 1", "lat": 10.7745, "lon": 106.7035, "radius_m": 120}


def test_places_are_saved_edited_deleted_and_private_to_their_owner(prod):
    c, clock, sent, _ = prod
    h, uid = login(c, sent)
    h2, uid2 = login(c, sent, phone="0903000222", name="Lan")
    assert c.get("/v1/places", headers=h).json() == []
    p = c.post("/v1/places", json=HOME, headers=h)
    assert p.status_code == 201
    pid = p.json()["id"]
    c.post("/v1/places", json={**HOME, "name": "Trường học", "address": "x" * 160}, headers=h)
    assert [x["name"] for x in c.get("/v1/places", headers=h).json()] == ["Nhà", "Trường học"]       # kept in the order added
    assert c.get("/v1/places", headers=h2).json() == []                                              # not shared
    assert c.put(f"/v1/places/{pid}", json={**HOME, "name": "Nhà ông bà"}, headers=h2).status_code == 404
    assert c.delete(f"/v1/places/{pid}", headers=h2).status_code == 404
    assert c.put(f"/v1/places/{pid}", json={**HOME, "name": "Nhà ông bà", "radius_m": 200}, headers=h).json()["name"] == "Nhà ông bà"
    assert c.post("/v1/places", json={**HOME, "name": "   "}, headers=h).status_code == 422
    assert c.post("/v1/places", json={**HOME, "lat": 200}, headers=h).status_code == 422
    assert c.post("/v1/places", json={**HOME, "name": "y" * 41}, headers=h).status_code == 422
    assert c.get("/v1/places").status_code == 401
    assert c.delete(f"/v1/places/{pid}", headers=h).status_code == 200
    assert len(c.get("/v1/places", headers=h).json()) == 1


def test_places_have_a_cap_and_go_with_the_account(prod):
    c, clock, sent, _ = prod
    h, uid = login(c, sent)
    for i in range(main.MAX_PLACES):
        assert c.post("/v1/places", json={**HOME, "name": f"Điểm {i}"}, headers=h).status_code == 201
    assert c.post("/v1/places", json=HOME, headers=h).status_code == 409
    c.request("DELETE", "/v1/me", json={"confirm": "XOA TAI KHOAN"}, headers=h)
    assert db.one("SELECT COUNT(*) AS n FROM places WHERE user_id=?", uid)["n"] == 0


def test_pause_until_resumed_survives_reloads_never_ends_alone_and_is_reminded(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    person = frame(detections=[{"seat": "rear_mid", "kind": "person", "conf": 0.9}])
    c.post("/v1/device/telemetry", json=frame(), headers=dh)
    assert c.post(f"/v1/vehicles/{vid}/pause", json={}, headers=h).status_code == 422                       # a choice is required
    assert c.post(f"/v1/vehicles/{vid}/pause", json={"minutes": 10, "until_resumed": True}, headers=h).status_code == 422
    assert c.post(f"/v1/vehicles/{vid}/pause", json={"minutes": 61}, headers=h).status_code == 422
    r = c.post(f"/v1/vehicles/{vid}/pause", json={"until_resumed": True}, headers=h).json()
    assert r["paused_indefinite"] and r["verdict"]["level"] == "paused" and "không tự bật lại" in r["verdict"]["sub"]
    clock.t += 3 * 86400                                                                                     # days later, still paused
    c.post("/v1/device/telemetry", json=person, headers=dh)
    s = c.get(f"/v1/vehicles/{vid}/status", headers=h).json()
    assert s["verdict"]["level"] == "paused" and s["paused_indefinite"] and s["incident"] is None
    sent.clear()
    alerts.run_once(main.refresh)
    assert [m for m in sent if m["title"] == "Giám sát xe đang tắt"]
    n = len(sent)
    alerts.run_once(main.refresh)
    assert len(sent) == n                                                                                    # once per window, not per tick
    r = c.delete(f"/v1/vehicles/{vid}/pause", headers=h).json()
    assert not r["paused_indefinite"] and r["verdict"]["level"] in ("warning", "critical")                    # watching again, sees the person
    log = " ".join(e["title"] for e in c.get(f"/v1/vehicles/{vid}/events", headers=h).json()) if c.get(f"/v1/vehicles/{vid}/events", headers=h).status_code == 200 else ""
    assert "bật lại" in log or log == ""


def test_timed_pause_still_ends_by_itself_and_is_not_marked_indefinite(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    c.post("/v1/device/telemetry", json=frame(), headers=dh)
    r = c.post(f"/v1/vehicles/{vid}/pause", json={"minutes": 10}, headers=h).json()
    assert r["verdict"]["level"] == "paused" and not r["paused_indefinite"]
    clock.t += 601
    c.post("/v1/device/telemetry", json=frame(), headers=dh)
    assert c.get(f"/v1/vehicles/{vid}/status", headers=h).json()["verdict"]["level"] != "paused"
    assert logic.PAUSE_FOREVER > clock.t
