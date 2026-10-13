"""Live view: boxes only (no pixels), freshness, access, no event spam."""
from app import alerts, db, main
from tests.test_api import env  # noqa: F401
from tests.test_production import frame, login, prod, setup_car  # noqa: F401


def person(box=None, **kw):
    d = {"seat": "rear_right", "kind": "person", "conf": 0.9, "age": "child"}
    if box is not None:
        d["box"] = box
    return frame(detections=[d], **kw)


def test_live_view_returns_boxes_and_marks_stale_data(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    assert c.post("/v1/device/telemetry", json=person([0.2, 0.3, 0.25, 0.4], items=[{"name": "Cặp sách", "seat": "rear_left", "conf": 0.8, "box": [0.1, 0.5, 0.2, 0.2]}]), headers=dh).status_code == 200
    r = c.get(f"/v1/vehicles/{vid}/live", headers=h).json()
    assert r["available"] and r["basis"] == "measured" and r["age_s"] < 5 and "không phải video camera" in r["note"]
    assert r["detections"][0]["box"] == [0.2, 0.3, 0.25, 0.4] and r["detections"][0]["age"] == "child" and r["items"][0]["box"] == [0.1, 0.5, 0.2, 0.2]
    clock.t += 300                                                           # the device went quiet
    r = c.get(f"/v1/vehicles/{vid}/live", headers=h).json()
    assert r["available"] is False and r["reason"] == "offline" and "Không coi là xe an toàn" in r["message"] and "detections" not in r
    assert r["age_s"] >= 300                                                  # the age is when the device last spoke, not when we looked


def test_live_view_rejects_bad_boxes_and_other_roles(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    assert c.post("/v1/device/telemetry", json=person([0.667, 0.1, 0.334, 0.2]), headers=dh).status_code == 200   # rounding overshoot is clipped
    assert c.get(f"/v1/vehicles/{vid}/live", headers=h).json()["detections"][0]["box"] == [0.667, 0.1, 0.333, 0.2]
    for bad in ([0.5, 0.5, 0.7, 0.2], [1.2, 0, 0.1, 0.1], [0.1, 0.1, 0.1], [-0.1, 0.1, 0.1, 0.1]):
        assert c.post("/v1/device/telemetry", json=person(bad), headers=dh).status_code == 422
    assert c.post("/v1/device/telemetry", json=person(), headers=dh).status_code == 200                 # box is optional
    assert c.get(f"/v1/vehicles/{vid}/live", headers=h).json()["detections"][0]["box"] is None
    c.post(f"/v1/vehicles/{vid}/members", json={"name": "Bạn", "phone": "0911000222", "role": "view"}, headers=h)
    h2, _ = login(c, sent, phone="0911000222", name="Bạn")
    assert c.get(f"/v1/vehicles/{vid}/live", headers=h2).status_code == 403                             # view-only cannot watch
    assert c.get(f"/v1/vehicles/{vid}/live").status_code == 401


def test_polling_the_live_view_does_not_spam_the_timeline(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    c.post("/v1/device/telemetry", json=person(), headers=dh)
    for _ in range(6):
        clock.t += 2
        c.post("/v1/device/telemetry", json=person(), headers=dh)
        assert c.get(f"/v1/vehicles/{vid}/live", headers=h).json()["available"]
    n = db.one("SELECT COUNT(*) AS n FROM events WHERE vehicle_id=? AND kind='camera'", vid)["n"]
    assert n == 1
    clock.t += 400
    c.post("/v1/device/telemetry", json=person(), headers=dh)
    c.get(f"/v1/vehicles/{vid}/live", headers=h)
    assert db.one("SELECT COUNT(*) AS n FROM events WHERE vehicle_id=? AND kind='camera'", vid)["n"] == 2
