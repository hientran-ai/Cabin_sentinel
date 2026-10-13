"""Camera simulator: a video stands in for the cabin camera; zones, per-seat smoothing and the device ingest path."""

from datetime import timedelta
from io import BytesIO

import pytest
from PIL import Image

from src.cabinsentinel import demo_studio, video_sim
from src.cabinsentinel.demo_studio import DemoStudio
from src.main import app
from tests.test_platform_api import auth, make_admin, user_token

VEHICLE = "VF8-DEMO-01"
SEATS = [{"name": "rear_left", "kind": "seat", "box": [0.10, 0.40, 0.45, 1.0]},
         {"name": "rear_right", "kind": "seat", "box": [0.55, 0.40, 0.90, 1.0]},
         {"name": "window_left", "kind": "exclude", "box": [0.0, 0.05, 0.25, 0.40]}]


def jpeg(shade=128, seed=0):
    img = Image.new("RGB", (64, 48), (shade, shade, shade))
    img.putpixel((seed % 64, 0), (255 - shade, 0, 0))  # every frame differs, so the picture is not "frozen"
    out = BytesIO()
    img.save(out, "JPEG")
    return out.getvalue()


class FakeProvider:
    """Returns whatever the test queued, in pixels of a 64x48 frame."""

    def __init__(self):
        self.next: list[dict] = []

    def infer(self, image):
        return {"detections": list(self.next), "latency_ms": 12.0}


@pytest.fixture
def studio(env):
    demo_studio._studio = DemoStudio(env.fleet, env.store)
    provider = FakeProvider()
    app.state.vision_provider = provider
    yield demo_studio._studio, provider
    app.state.vision_provider = None
    demo_studio._studio = None


def person(x1, y1, x2, y2, conf=0.9, cls="person"):
    return {"class": cls, "confidence": conf, "bbox": [x1, y1, x2, y2]}


def frame(env, admin, seq, shade=128):
    env.clock[0] += timedelta(milliseconds=400)
    return env.client.post("/api/v1/admin/demo/video/frame", data={"vehicle_id": VEHICLE, "sequence": str(seq)},
                           files={"image": ("f.jpg", jpeg(shade, seq), "image/jpeg")}, headers=auth(admin))


# -- zones -------------------------------------------------------------------------------------------------------
def test_calibration_rejects_zones_that_could_hide_occupants():
    with pytest.raises(video_sim.CalibrationError, match="seats"):
        video_sim.parse_zones([{"name": "w", "kind": "exclude", "box": [0, 0, 0.3, 0.3]}])
    with pytest.raises(video_sim.CalibrationError, match="too much"):
        video_sim.parse_zones([{"name": "s", "kind": "seat", "box": [0, 0.8, 0.1, 1]},
                               {"name": "w", "kind": "exclude", "box": [0, 0, 1, 0.7]}])
    with pytest.raises(video_sim.CalibrationError, match="hides most"):
        video_sim.parse_zones([{"name": "s", "kind": "seat", "box": [0.1, 0.1, 0.4, 0.4]},
                               {"name": "w", "kind": "exclude", "box": [0.1, 0.1, 0.4, 0.35]}])
    with pytest.raises(video_sim.CalibrationError, match="inside"):
        video_sim.parse_zones([{"name": "s", "kind": "seat", "box": [0.5, 0.5, 1.2, 1]}])
    assert len(video_sim.parse_zones(SEATS)) == 3


def test_only_a_detection_in_a_window_and_no_seat_is_left_out():
    zones = video_sim.parse_zones(SEATS)
    placed = video_sim.place([person(2, 4, 12, 16),        # centre in the window: passer-by
                              person(10, 25, 20, 45),      # centre in rear_left
                              person(26, 2, 34, 10)],      # centre in neither: uncalibrated corner still counts
                             zones, 64, 48)
    assert [(p["zone"], p["counted"]) for p in placed] == [("outside", False), ("rear_left", True), ("cabin", True)]
    # No calibration: everything counts.
    assert all(p["counted"] and p["zone"] is None for p in video_sim.place([person(2, 4, 12, 16)], [], 64, 48))


# -- smoothing ---------------------------------------------------------------------------------------------------
def test_one_missed_frame_does_not_release_a_seat_and_weak_hits_need_three_of_five():
    s = video_sim.SeatSmoother()
    hit = [{"class": "person", "confidence": 0.8, "zone": "rear_left", "counted": True}]
    assert s.update(0, hit, True)["rear_left"]["state"] == "OCCUPIED"
    assert s.update(1, [], True)["rear_left"]["state"] == "OCCUPIED"                       # missed frame: held
    assert s.update(1 + video_sim.CLEAR_S - 2, [], True)["rear_left"]["state"] == "OCCUPIED"
    assert s.update(2 + video_sim.CLEAR_S, [], True)["rear_left"]["state"] == "NO_HIT"     # released only after CLEAR_S

    weak = [{"class": "dog", "confidence": 0.2, "zone": "rear_right", "counted": True}]
    s2 = video_sim.SeatSmoother()
    states = [s2.update(t, weak, True)["rear_right"]["state"] for t in range(5)]
    assert states[:4] == ["CANDIDATE"] * 4 and states[4] == "OCCUPIED"
    assert s2.occupants() == [{"detection_id": "seat-rear_right", "class_name": "dog", "confidence": 0.2}]


def test_degraded_frames_never_release_anyone():
    s = video_sim.SeatSmoother()
    s.update(0, [{"class": "person", "confidence": 0.9, "zone": "a", "counted": True}], True)
    assert s.update(100, [], False)["a"]["state"] == "OCCUPIED"


def test_dark_or_frozen_picture_is_a_camera_problem():
    gate = video_sim.QualityGate()
    assert gate.check(5.0, "a") == "BLOCKED"
    states = [gate.check(100.0, "same") for _ in range(video_sim.FROZEN_FRAMES + 1)]
    assert states[0] == "OK" and states[-1] == "ERROR"


# -- end to end through the API ----------------------------------------------------------------------------------
def test_video_frames_go_through_rules_to_an_incident(env, studio):
    _, provider = studio
    admin = make_admin(env)
    owner = user_token(env, "o@example.com")
    body = {"vehicle_id": VEHICLE, "temperature": 30, "sample": "child-rear", "zones": SEATS}
    assert env.client.post("/api/v1/admin/demo/video/start", json=body, headers=auth(owner)).status_code == 403
    started = env.client.post("/api/v1/admin/demo/video/start", json=body, headers=auth(admin))
    assert started.status_code == 200 and started.json()["scenario"] == "VIDEO" and len(started.json()["zones"]) == 3

    provider.next = [person(2, 4, 12, 16)]                       # only a passer-by in the window
    out = frame(env, admin, 1).json()
    assert out["detections"][0]["counted"] is False and out["evidence"] == []
    assert out["risk_level"] != "WARNING" and out["active_incident"] is None

    provider.next = [person(10, 25, 20, 45, conf=0.85)]          # child on the rear-left seat
    out = frame(env, admin, 2).json()
    assert out["seats"]["rear_left"]["state"] == "OCCUPIED"
    assert out["risk_level"] == "WARNING" and out["occupancy_state"] == "PRESENT"
    assert out["timing"]["inference_ms"] == 12.0 and out["timing"]["server_ms"] >= 0
    incident = out["active_incident"]
    assert incident is not None

    provider.next = []                                           # detector misses a few frames
    for seq in (3, 4, 5):
        out = frame(env, admin, seq).json()
        assert out["risk_level"] == "WARNING" and out["active_incident"] == incident  # same incident, no second alert

    assert frame(env, admin, 4).status_code == 409               # a late frame never overwrites a newer one
    queue = env.client.get("/api/v1/ops/incidents?status=OPEN", headers=auth(admin)).json()["items"]
    assert sum(i["vehicle_id"] == VEHICLE for i in queue) == 1


def test_dark_video_reports_camera_error_not_an_empty_cabin(env, studio):
    admin = make_admin(env)
    env.client.post("/api/v1/admin/demo/video/start", json={"vehicle_id": VEHICLE}, headers=auth(admin))
    out = frame(env, admin, 1, shade=2).json()
    assert out["camera_status"] == "BLOCKED" and out["risk_level"] == "ERROR"


def test_calibration_is_saved_per_vehicle_audited_and_used_by_the_next_run(env, studio):
    _, provider = studio
    admin = make_admin(env)
    bad = env.client.put(f"/api/v1/admin/demo/calibration/{VEHICLE}",
                         json={"zones": [{"name": "w", "kind": "exclude", "box": [0, 0, 0.3, 0.3]}]}, headers=auth(admin))
    assert bad.status_code == 422
    saved = env.client.put(f"/api/v1/admin/demo/calibration/{VEHICLE}", json={"zones": SEATS}, headers=auth(admin)).json()
    assert saved["calibration"]["version"] == 1 and saved["calibration"]["updated_by"]
    again = env.client.put(f"/api/v1/admin/demo/calibration/{VEHICLE}", json={"zones": SEATS}, headers=auth(admin)).json()
    assert again["calibration"]["version"] == 2
    got = env.client.get(f"/api/v1/admin/demo/calibration/{VEHICLE}", headers=auth(admin)).json()
    assert got["calibration"]["zones"][2]["kind"] == "exclude"
    assert any(row["action"] == "vehicle.calibration" for row in env.store._all("SELECT action FROM audit_log"))

    started = env.client.post("/api/v1/admin/demo/video/start", json={"vehicle_id": VEHICLE}, headers=auth(admin)).json()
    assert len(started["zones"]) == 3                            # no zones in the request: the saved calibration
    provider.next = [person(2, 4, 12, 16)]
    assert frame(env, admin, 1).json()["detections"][0]["zone"] == "outside"


def test_stop_returns_the_vehicle_to_its_scenario_and_frames_are_refused(env, studio):
    admin = make_admin(env)
    env.client.post("/api/v1/admin/demo/video/start", json={"vehicle_id": VEHICLE}, headers=auth(admin))
    stopped = env.client.post("/api/v1/admin/demo/video/stop", json={"vehicle_id": VEHICLE}, headers=auth(admin)).json()
    assert stopped["scenario"] == "SAFE" and stopped["video"] is None
    assert frame(env, admin, 1).status_code == 409
    assert env.client.post("/api/v1/admin/demo/run", json={"vehicle_id": VEHICLE, "scenario": "VIDEO"},
                           headers=auth(admin)).status_code == 422


def test_unnamed_objects_are_shown_but_not_reported_as_forgotten_items():
    run = video_sim.VideoRun("V", 30.0, [])
    placed = [{"class": "object", "confidence": 0.45, "zone": None, "counted": True},
              {"class": "backpack", "confidence": 0.7, "zone": None, "counted": True}]
    assert [i["class_name"] for i in run.items(0, placed, True)] == ["backpack"]
    assert [i["class_name"] for i in run.items(video_sim.ITEM_HOLD_S - 1, [], True)] == ["backpack"]   # held briefly
    assert run.items(video_sim.ITEM_HOLD_S + 1, [], True) == []
