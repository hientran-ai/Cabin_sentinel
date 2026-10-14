"""Cabin log: episodes with durations, hash chain, incident report, overview, CSV."""
import pytest

from app import alerts, cabinlog, db, main
from tests.test_api import env  # noqa: F401
from tests.test_production import frame, login, prod, setup_car  # noqa: F401

PERSON = frame(detections=[{"seat": "rear_right", "kind": "person", "conf": 0.9, "age": "child"}])


def tick(c, clock, dh, body, dt=0):
    clock.t += dt
    assert c.post("/v1/device/telemetry", json=body, headers=dh).status_code == 200
    alerts.run_once(main.refresh)


def rows(c, h, vid, **q):
    return c.get(f"/v1/vehicles/{vid}/log", params=q, headers=h).json()


def test_left_behind_episode_from_open_to_confirmed(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    tick(c, clock, dh, PERSON)
    r = rows(c, h, vid)
    assert [i["kind"] for i in r["items"]] == ["left_behind"] and r["items"][0]["ongoing"] and r["items"][0]["basis"] == "measured"
    assert r["items"][0]["level"] == "critical" and r["items"][0]["seat"] == "cabin"
    inc = c.get(f"/v1/vehicles/{vid}/history", headers=h).json()["incidents"][0]
    c.post(f"/v1/incidents/{inc['id']}/view", headers=h)
    tick(c, clock, dh, PERSON, 40)
    tick(c, clock, dh, frame(), 20)                                       # the person is gone
    cur = c.get(f"/v1/incidents/{inc['id']}", headers=h).json()
    res = c.post(f"/v1/incidents/{inc['id']}/confirm", json={"revision": cur["revision"], "checks": ["seats", "floor", "trunk"]}, headers=h).json()
    assert res["result"] == "resolved"
    alerts.run_once(main.refresh)
    item = rows(c, h, vid)["items"][0]
    assert not item["ongoing"] and item["outcome"] == "confirmed" and item["sealed"] and item["duration_s"] >= 60
    assert item["ack_s"] is not None and item["ack_s"] >= 0
    assert rows(c, h, vid)["chain"]["ok"] is True
    rep = c.get(f"/v1/incidents/{inc['id']}/report", headers=h).json()
    assert rep["log"]["outcome"] == "confirmed" and rep["incident"]["events"] and rep["notes"]
    assert any(d["kind"] == "level" and d["status"] == "ok" for d in rep["deliveries"])
    csv = c.get(f"/v1/vehicles/{vid}/log.csv", headers=h)
    assert csv.headers["content-type"].startswith("text/csv") and "left_behind" in csv.text and "measured" in csv.text


def test_manual_close_is_labelled(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    tick(c, clock, dh, PERSON)
    inc = c.get(f"/v1/vehicles/{vid}/history", headers=h).json()["incidents"][0]
    cur = c.get(f"/v1/incidents/{inc['id']}", headers=h).json()
    res = c.post(f"/v1/incidents/{inc['id']}/confirm", json={"revision": cur["revision"], "checks": ["seats", "floor", "trunk"], "override": True}, headers=h).json()
    assert res["result"] == "resolved"
    alerts.run_once(main.refresh)
    items = rows(c, h, vid)["items"]
    closed = next(i for i in items if i["incident_id"] == inc["id"])
    assert closed["outcome"] == "manual_close" and closed["sealed"]
    assert any(i["ongoing"] and i["incident_id"] != inc["id"] for i in items)       # the camera still sees someone: a new episode opened
    assert rows(c, h, vid)["stats"]["manual_close"] == 1


def test_camera_blocked_needs_a_real_duration(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    tick(c, clock, dh, frame())
    tick(c, clock, dh, frame(camera_ok=False))
    tick(c, clock, dh, frame(), 5)                                        # 5 s: noise, dropped
    assert rows(c, h, vid)["items"] == []
    tick(c, clock, dh, frame(camera_ok=False), 5)
    tick(c, clock, dh, frame(camera_ok=False), 30)
    assert rows(c, h, vid)["items"][0]["kind"] == "camera_blocked" and rows(c, h, vid)["items"][0]["ongoing"]
    tick(c, clock, dh, frame(), 10)
    it = rows(c, h, vid)["items"][0]
    assert it["kind"] == "camera_blocked" and not it["ongoing"] and it["duration_s"] >= 40 and it["level"] is None
    assert rows(c, h, vid, kind="left_behind")["items"] == []


def test_device_offline_is_logged_only_after_real_data(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    clock.t += 3000
    alerts.run_once(main.refresh)
    assert rows(c, h, vid)["items"] == []                                 # never reported: not "offline"
    tick(c, clock, dh, frame())
    clock.t += 400
    alerts.run_once(main.refresh)
    assert rows(c, h, vid)["items"][0]["kind"] == "device_offline"
    tick(c, clock, dh, frame(), 10)
    it = rows(c, h, vid)["items"][0]
    assert not it["ongoing"] and it["duration_s"] >= 300


def test_chain_detects_edits_and_retention_anchor(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    for _ in range(2):
        tick(c, clock, dh, frame(camera_ok=False), 0)
        tick(c, clock, dh, frame(camera_ok=False), 30)
        tick(c, clock, dh, frame(), 5)
        clock.t += 30
    assert rows(c, h, vid)["chain"] == {"ok": True, "checked": 2, "broken_at": None}
    with db.tx() as conn:
        conn.execute("UPDATE cabin_log SET seat='rear_left' WHERE rowid=(SELECT MIN(rowid) FROM cabin_log)")
    v = c.get(f"/v1/vehicles/{vid}/log/verify", headers=h).json()
    assert v["ok"] is False and v["broken_at"]


def test_overview_and_access(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    tick(c, clock, dh, PERSON)
    tick(c, clock, dh, frame(camera_ok=False), 30)
    tick(c, clock, dh, frame(camera_ok=False), 30)
    o = c.get("/v1/me/overview?days=7", headers=h).json()
    assert o["total"]["vehicles"] == 1 and o["total"]["left_behind"] == 1 and o["total"]["open"] == 1 and o["basis"] == ["measured"]
    assert o["vehicles"][0]["device"]["online"] is True and o["vehicles"][0]["plate"] == "30A-123.45"
    # a school-only member sees nothing of the cabin log
    h2, _ = login(c, sent, phone="0911000111", name="Cô giáo")
    c.post(f"/v1/vehicles/{vid}/members", json={"name": "Cô giáo", "phone": "0911000111", "role": "school"}, headers=h)
    h2, _ = login(c, sent, phone="0911000111", name="Cô giáo")
    assert c.get(f"/v1/vehicles/{vid}/log", headers=h2).status_code == 403
    assert c.get("/v1/me/overview", headers=h2).json()["total"]["vehicles"] == 0
    assert c.get(f"/v1/vehicles/{vid}/log", headers={"Authorization": "Bearer x"}).status_code == 401


def test_deleting_the_vehicle_deletes_its_log(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    tick(c, clock, dh, PERSON)
    assert db.one("SELECT COUNT(*) AS n FROM cabin_log")["n"] == 1
    assert c.request("DELETE", "/v1/me", json={"confirm": "XOA TAI KHOAN"}, headers=h).status_code == 200
    assert db.one("SELECT COUNT(*) AS n FROM cabin_log")["n"] == 0


CLIPS = {"model": "yolov8n.pt", "sample_fps": 2.0, "clips": [
    {"clip": "a.mp4", "duration_s": 10.0, "sampled": 20, "dark_samples": 0, "episodes": [
        {"kind": "person", "seat": "rear_left", "name": None, "start_t": 0.0, "duration_s": 10.0, "frames": 20, "conf_mean": 0.92, "conf_max": 0.93}]},
    {"clip": "b.mp4", "duration_s": 8.3, "sampled": 17, "dark_samples": 0, "episodes": [
        {"kind": "person", "seat": "rear_mid", "name": None, "start_t": 2.5, "duration_s": 2.0, "frames": 4, "conf_mean": 0.17, "conf_max": 0.28}]},
    {"clip": "c.mp4", "duration_s": 12.5, "sampled": 25, "dark_samples": 0, "episodes": []}]}


def test_test_videos_are_logged_as_simulated_and_never_as_real_history(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    t = clock.t - 100
    with db.tx() as conn:
        assert [cabinlog.import_replay(conn, vid, k, CLIPS["model"], CLIPS["sample_fps"], t + i * 20) for i, k in enumerate(CLIPS["clips"])] == [True, True, True]
        assert cabinlog.import_replay(conn, vid, CLIPS["clips"][0], CLIPS["model"], 2.0, t) is False                 # same clip twice: no duplicate
    r = rows(c, h, vid)
    byclip = {i["clip"]: i for i in r["items"]}
    assert set(byclip) == {"a.mp4", "b.mp4", "c.mp4"} and all(i["kind"] == "replay" and i["basis"] == "simulated" and i["sealed"] for i in r["items"])
    assert byclip["a.mp4"]["outcome"] == "detected" and byclip["a.mp4"]["duration_s"] == 10 and byclip["a.mp4"]["seat"] == "rear_left"
    assert byclip["b.mp4"]["outcome"] == "below_threshold" and byclip["b.mp4"]["conf_max"] == 0.28                    # a miss is recorded as a miss
    assert byclip["c.mp4"]["outcome"] == "none" and "không có nghĩa là xe trống" in byclip["c.mp4"]["outcome_label"]
    assert "chưa xác minh nguồn" in byclip["a.mp4"]["note"]
    assert r["stats"]["left_behind"] == 0 and r["stats"]["basis"] == ["simulated"]                                  # never counted as a real left-behind
    assert r["chain"]["ok"] is True and rows(c, h, vid, kind="replay")["items"] and not rows(c, h, vid, kind="left_behind")["items"]
    o = c.get("/v1/me/overview?days=7", headers=h).json()
    assert o["total"]["left_behind"] == 0 and o["basis"] == ["simulated"]
    assert "replay" in c.get(f"/v1/vehicles/{vid}/log.csv", headers=h).text


def test_activity_filter_is_everything_except_left_behind(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    tick(c, clock, dh, PERSON)
    tick(c, clock, dh, frame(camera_ok=False), 30)
    tick(c, clock, dh, frame(camera_ok=False), 30)
    tick(c, clock, dh, frame(), 5)
    with db.tx() as conn:
        cabinlog.import_replay(conn, vid, CLIPS["clips"][0], "yolov8n.pt", 2.0, clock.t - 60)
    assert {i["kind"] for i in rows(c, h, vid, kind="activity")["items"]} == {"camera_blocked", "replay"}
    assert {i["kind"] for i in rows(c, h, vid, kind="left_behind")["items"]} == {"left_behind"}
    assert {i["kind"] for i in rows(c, h, vid)["items"]} == {"left_behind", "camera_blocked", "replay"}
    assert rows(c, h, vid, kind="activity")["stats"]["left_behind"] == 1                  # the numbers always cover both halves


def test_summary_strip_and_watched_time(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    clock.t += 3600                                                        # the device has been paired for an hour
    tick(c, clock, dh, frame())
    tick(c, clock, dh, frame(camera_ok=False), 5)
    tick(c, clock, dh, frame(camera_ok=False), 120)                       # 2 minutes of covered camera
    tick(c, clock, dh, frame(), 5)
    tick(c, clock, dh, PERSON, 5)
    r = c.get(f"/v1/vehicles/{vid}/log/summary?days=7&tz=420", headers=h).json()
    assert len(r["days"]) == 7 and r["days"][-1]["today"] and r["days"][-1]["worst"] == "critical" and r["days"][-1]["open"] == 1
    assert all(d["worst"] == "none" for d in r["days"][:-1]) and r["days"][-1]["camera_s"] >= 100
    cov = r["coverage"]
    assert cov["basis"] == "measured" and 90 < cov["pct"] < 100 and cov["lost_s"] >= 100                              # less than 100%: it was blind for a while
    assert cov["segments"] and cov["segments"][0]["kind"] == "camera_blocked" and 0 <= cov["segments"][0]["from"] < cov["segments"][0]["to"] <= 1
    assert c.get(f"/v1/vehicles/{vid}/log/summary", headers={"Authorization": "Bearer x"}).status_code == 401


def test_summary_gives_no_percentage_without_a_device(prod):
    c, clock, sent, _ = prod
    h, uid = login(c, sent)
    vid = c.post("/v1/vehicles", json={"name": "Xe", "model": "VinFast VF 8", "plate": "30A-1", "color": "white"}, headers=h).json()["vehicle"]["id"]
    r = c.get(f"/v1/vehicles/{vid}/log/summary", headers=h).json()
    assert r["coverage"] is None and all(d["worst"] == "none" for d in r["days"])
