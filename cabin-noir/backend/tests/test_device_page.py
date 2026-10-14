"""The in-car device page (third role), the web files that make it up, and what a device may claim."""
import pathlib
import re

from tests.test_api import env  # noqa: F401
from tests.test_production import frame, login, prod, setup_car  # noqa: F401

WEB = pathlib.Path(__file__).resolve().parents[1] / "web"


def test_every_web_module_import_resolves():
    """A deleted or renamed module only fails in the browser, when that screen is opened. Catch it here."""
    pat = re.compile(r"""(?:from\s+|import\s*\(\s*)["'](\.[^"']+)["']""")
    seen = 0
    for js in (WEB / "js").rglob("*.js"):
        for rel in pat.findall(js.read_text()):
            seen += 1
            assert (js.parent / rel).resolve().is_file(), f"{js.relative_to(WEB)} imports missing {rel}"
    assert seen > 30


def test_device_page_is_served_and_is_not_inside_the_phone_frame(env):  # noqa: F811
    c, _ = env
    r = c.get("/app/device/")
    assert r.status_code == 200 and "device-page.js" in r.text
    assert "data-phone-frame" not in r.text                        # the device is a full page, not an iPhone
    assert "data-phone-frame" in c.get("/app/").text               # the owner's app is
    assert "script-src" in r.headers["content-security-policy"]
    assert c.get("/app/js/device-page.js").status_code == 200


def test_device_page_sends_pixels_only_as_a_blurred_opt_in_alert_photo():
    src = (WEB / "js" / "device-page.js").read_text()
    assert "toBlob" not in (WEB / "js" / "detect.js").read_text()
    for banned in ("toDataURL", "canvas.captureStream", "MediaRecorder", "FormData"):
        assert banned not in src, banned
    # Exactly one place encodes a frame, and it pixelates people before encoding.
    assert src.count("toBlob") == 1
    blurred = src[src.index("export function blurredFrame"):src.index("async function maybeSendPhoto")]
    assert "toBlob" in blurred and "imageSmoothingEnabled = false" in blurred and 'd.kind !== "pet"' in blurred
    assert blurred.index("imageSmoothingEnabled = false") < blurred.index("toBlob")
    # It is uploaded only to the alert-photo endpoint, only when the owner turned it on, saying it was blurred.
    sender = src[src.index("async function maybeSendPhoto"):src.index("/** A one-minute test drive")]
    assert "!run.alertPhoto" in sender and '"/v1/device/alert-photo"' in sender and '"X-Cabin-Blurred": "people"' in sender
    assert src.count("/v1/device/alert-photo") == 1



def test_sample_video_source_keeps_the_clip_on_the_device(env):  # noqa: F811
    """The "Video mẫu" source plays a sample or the user's own file and analyses it here, like the webcam."""
    c, _ = env
    for name in ("child-rear.mp4", "empty-cabin.mp4", "ai-child.mp4", "empty-cabin-ref.jpg"):
        assert c.get(f"/app/samples/{name}").status_code == 200, name
    for mod in ("device-video.js", "cabinref.js"):
        src = (WEB / "js" / mod).read_text()
        for banned in ("fetch(", "api(", "post(", "XMLHttpRequest", "toBlob", "toDataURL", "FormData", "sendBeacon", "WebSocket"):
            assert banned not in src, f"{mod}: {banned}"
    page = (WEB / "js" / "device-page.js").read_text()
    assert "URL.createObjectURL(f)" in page                          # an own file is played from a local blob: URL
    assert "clip.blocked || video.paused" in page                    # a frozen clip is a camera problem, never "empty"
    ref = (WEB / "js" / "cabinref.js").read_text()
    assert "MATCH = 0.55" in ref and "LOW_FRAMES = 3" in ref         # same thresholds as v3 / COMPLIANCE_BASELINE 5.3

def test_blocked_camera_on_a_device_does_not_claim_door_or_temperature_monitoring(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    c.post("/v1/device/telemetry", json=frame(camera_ok=False), headers=dh)
    s = c.get(f"/v1/vehicles/{vid}/status", headers=h).json()
    assert s["verdict"]["level"] == "notice"
    assert "Cửa và nhiệt độ" not in s["verdict"]["sub"] and "Không coi là xe trống" in s["verdict"]["sub"]


def test_viewer_cannot_pair_devices_and_a_user_token_is_not_a_device_token(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    c.post(f"/v1/vehicles/{vid}/members", json={"name": "Bố", "phone": "0987000111", "role": "view"}, headers=h)
    h2, _ = login(c, sent, phone="0987000111", name="Bố")
    assert c.post(f"/v1/vehicles/{vid}/devices/pairing", headers=h2).status_code == 403
    assert c.post("/v1/device/telemetry", json=frame(), headers=h2).status_code == 401
    assert c.get("/v1/me", headers=dh).status_code == 401           # and a device token is not a user token
