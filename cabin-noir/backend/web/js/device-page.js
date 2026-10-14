// The in-car device as its own page: the third role next to the owner's app and the admin console.
// It pairs with a one-time code from the owner, then reports to the server what the camera sees in the cabin (no seats).
// Three sources: a simulator (buttons, for testing without a camera), a recorded clip ("Video mẫu": a sample or the user's
// own file, played and analysed on this device) or the real webcam, both with detection running in this browser.
// Only kinds (person, pet, item), confidences and boxes are sent. Camera frames never leave this page, with one exception
// the owner must turn on (alert photos): when someone is seen, one frame every 30 s at most, with the detections drawn
// on it and every person's face pixelated here on the device before it is uploaded.
import { api, post, del, ApiError } from "./api.js";
import { h, icon, fmt, toast, busy, switchRow, confirmDialog } from "./ui.js";
import { loadModel, detectFrame } from "./detect.js";
import { SAMPLES, OWN, sampleUrl, newRun, setReference, analyse, stats, paint } from "./device-video.js";

const KEY = "cn.device";
const SEND_MS = 2000, DETECT_MS = 600, PHOTO_GAP_MS = 30000;
const WHO = [["adult", "Người lớn"], ["child", "Trẻ em"], ["pet", "Thú cưng"]];
const ITEMS = ["Ba lô", "Túi xách", "Điện thoại", "Chai nước"];

const root = document.getElementById("app");
let dev = null;
try { dev = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { dev = null; }

const sim = { who: { adult: 0, child: 0, pet: 0 }, items: new Set(), blocked: false, engine: false, temp: null,
  battery: 78, charging: false, thermal: "nominal", gps: false, lat: 10.7769, lon: 106.7009, toLat: 10.7800, toLon: 106.7050 };
const clip = { sample: SAMPLES[0], vr: null, url: null, own: null, ownRef: null, blocked: false, busy: false };
const run = { drive: null, mode: "sim", sending: true, mirror: true, timer: null, detectTimer: null, stream: null, wake: null, frame: null, sent: 0, last: null, error: null, paused: null, log: [], alertPhoto: false, lastPhoto: 0 };
const ui = {};

const clock = () => new Date().toLocaleTimeString("vi-VN", { hour12: false });
const say = (text, bad = false) => { run.log.unshift({ at: clock(), text, bad }); run.log.length = Math.min(run.log.length, 8); paintLog(); };

// ---------------------------------------------------------------- what to send
function simFrame() {
  // Simulated occupants side by side across the picture; only what and how many matter, never where.
  const who = Object.entries(sim.who).flatMap(([k, n]) => Array.from({ length: n }, () => k));
  const detections = who.map((k, i) => ({ kind: k === "pet" ? "pet" : "person", conf: 0.9, ...(k === "pet" ? {} : { age: k }),
    box: [+(0.04 + (0.92 / Math.max(1, who.length)) * i).toFixed(3), 0.3, +(0.9 / Math.max(1, who.length)).toFixed(3), 0.6] }));
  const items = [...sim.items].map((name, i) => ({ name, conf: 0.8, box: [+(0.1 + 0.2 * i).toFixed(2), 0.75, 0.15, 0.2] }));
  return { detections, items, ok: !sim.blocked };
}

function currentFrame() { return run.mode !== "sim" ? (run.frame || { detections: [], items: [], ok: false }) : simFrame(); }

function stopCamera() {
  clearInterval(run.detectTimer); run.detectTimer = null; clip.vr = null;
  if (run.stream) run.stream.getTracks().forEach((t) => t.stop());
  run.stream = null; run.frame = null;
  if (run.wake) { run.wake.release().catch(() => {}); run.wake = null; }
}

async function send() {
  if (!dev || !run.sending) return;
  const f = currentFrame();
  const body = { detections: f.detections, items: f.items, camera_ok: f.ok && !(run.mode === "sim" && sim.blocked), locked: true, engine_on: sim.engine,
    model: { cam: "coco-ssd-web", video: "coco-ssd-web+empty-ref" }[run.mode] || "device-sim-web", battery_pct: sim.battery, charging: sim.charging, thermal: sim.thermal };
  if (run.mode !== "cam" && sim.temp != null) body.cabin_temp = sim.temp;
  if (run.drive) stepDrive();
  if (sim.gps) { body.lat = +sim.lat; body.lon = +sim.lon; body.accuracy_m = 12; body.engine_on = sim.engine; }
  try {
    const r = await post("/v1/device/telemetry", body, { deviceToken: dev.token });
    run.sent += 1; run.last = Date.now() / 1000; run.error = null; run.paused = r.paused_until || null; run.alertPhoto = !!r.alert_photo;
    say(`Đã gửi · ${f.detections.length} người/thú · ${f.items.length} đồ vật${body.camera_ok ? "" : " · camera bị che"}${run.paused ? " · chủ xe đang tạm dừng giám sát" : ""}`);
  } catch (e) {
    run.error = e.message;
    say(`Không gửi được: ${e.message}`, true);
    if (e instanceof ApiError && e.status === 401) { forget(); toast("Thiết bị đã bị ngắt khỏi xe. Ghép nối lại bằng mã mới.", "err"); render(); }
  }
  paintStatus();
}

/** One frame for an alert photo, made on this device: every detection (child, person, pet, item) is boxed and labelled,
 *  and every person's face is pixelated so nobody can be recognised; the picture is shrunk to 640 px. The detector gives
 *  a box for the whole person, so the face is taken as the top of it (a little wider, to be safe). */
export function blurredFrame(video, detections, mirror, items = []) {
  const w = video.videoWidth || 640, hgt = video.videoHeight || 480, scale = Math.min(1, 640 / w);
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale); c.height = Math.round(hgt * scale);
  const g = c.getContext("2d");
  g.drawImage(video, 0, 0, c.width, c.height);
  const tiny = document.createElement("canvas"), tg = tiny.getContext("2d");
  const rect = (box) => {
    let [x, y, bw, bh] = box;
    if (mirror) x = Math.max(0, 1 - x - bw);                 // boxes are reported mirrored like the preview; undo it
    return [x * c.width, y * c.height, bw * c.width, bh * c.height];
  };
  const people = detections.filter((d) => d.box && d.kind !== "pet");
  for (const d of people) {                                   // faces first, so no box or label is pixelated with them
    const [x, y, bw, bh] = rect(d.box);
    const fx = Math.max(0, x - bw * 0.1), fy = Math.max(0, y - bh * 0.05);
    const fw = Math.min(c.width - fx, bw * 1.2), fh = Math.min(c.height - fy, bh * 0.45);
    if (fw < 2 || fh < 2) continue;
    const block = Math.max(10, Math.round(fw / 7));
    tiny.width = Math.max(1, Math.round(fw / block)); tiny.height = Math.max(1, Math.round(fh / block));
    tg.drawImage(c, fx, fy, fw, fh, 0, 0, tiny.width, tiny.height);
    g.imageSmoothingEnabled = false;
    g.drawImage(tiny, 0, 0, tiny.width, tiny.height, fx, fy, fw, fh);
    g.imageSmoothingEnabled = true;
  }
  const label = (d) => d.name ? d.name : d.kind === "pet" ? "Thú cưng" : d.age === "child" ? "Trẻ em" : "Người";
  const COLOR = { person: "#ff4d4d", pet: "#ff9f0a", item: "#f5c518" };
  for (const d of [...detections, ...items.map((i) => ({ ...i, kind: "item" }))]) {
    if (!d.box) continue;
    const [x, y, bw, bh] = rect(d.box);
    g.strokeStyle = COLOR[d.kind] || COLOR.person; g.lineWidth = 3; g.strokeRect(x, y, bw, bh);
    const text = `${label(d)} ${Math.round((d.conf || 0) * 100)}%`;
    g.font = "bold 16px sans-serif"; const tw = g.measureText(text).width + 10, ty = y >= 22 ? y - 22 : y;
    g.fillStyle = g.strokeStyle; g.fillRect(x, ty, tw, 22);
    g.fillStyle = "#111"; g.fillText(text, x + 5, ty + 16);
  }
  g.font = "13px sans-serif"; g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(0, c.height - 22, c.width, 22);
  g.fillStyle = "#fff"; g.fillText(`Cabin Noir · ${new Date().toLocaleString("vi-VN")} · đã che mặt trên thiết bị`, 8, c.height - 7);
  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/jpeg", 0.72));
}

async function maybeSendPhoto(video, mirror = run.mirror) {
  const f = run.frame;
  if (!dev || !run.alertPhoto || !f || !f.ok || !f.detections.length || Date.now() - run.lastPhoto < PHOTO_GAP_MS) return;
  run.lastPhoto = Date.now();
  try {
    const blob = await blurredFrame(video, f.detections, mirror, f.items || []);
    if (!blob) return;
    await api("POST", "/v1/device/alert-photo", blob, { deviceToken: dev.token, headers: { "X-Cabin-Blurred": "faces" } });
    say("Đã gửi ảnh cảnh báo (đã che mặt trên máy này)");
  } catch (e) {
    if (!(e instanceof ApiError && (e.status === 403 || e.status === 429))) say(`Không gửi được ảnh cảnh báo: ${e.message}`, true);
  }
}

/** A one-minute test drive: engine on, the position slides from "Vị trí hiện tại" to "Điểm đến", then the engine stops. */
function stepDrive() {
  const d = run.drive, p = Math.min(1, (Date.now() - d.t0) / 60000);
  sim.lat = +(d.a[0] + (d.b[0] - d.a[0]) * p).toFixed(6); sim.lon = +(d.a[1] + (d.b[1] - d.a[1]) * p).toFixed(6);
  sim.engine = p < 1;
  if (ui.lat) { ui.lat.value = sim.lat; ui.lon.value = sim.lon; }
  if (p >= 1) { run.drive = null; say("Chuyến chạy thử kết thúc: xe đã đỗ ở điểm đến."); render(); }
}

// Losing the network is not the same as the camera failing: keep trying, say so, and send straight away when it returns.
addEventListener("offline", () => { if (dev) say("Mất mạng. Dữ liệu chưa gửi được; sau 2 phút ứng dụng của chủ xe sẽ báo ngoại tuyến.", true); });
addEventListener("online", () => { if (dev) { say("Đã có mạng lại. Đang gửi tiếp."); send(); } });

function startLoop() { clearInterval(run.timer); run.timer = setInterval(send, SEND_MS); send(); }
function forget() { clearInterval(run.timer); run.timer = null; stopCamera(); dev = null; try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

// ---------------------------------------------------------------- pairing
function pairing() {
  const fromUrl = /[#&]code=([A-Za-z0-9-]{8,12})/.exec(location.hash);
  if (fromUrl) history.replaceState(null, "", location.pathname + location.search);          // the code is single use; do not keep it in the address bar
  const code = h("input", { type: "text", placeholder: "ABCD-EFGH", maxLength: 12, autocomplete: "off", value: fromUrl ? fromUrl[1].toUpperCase() : "", style: "letter-spacing:.12em;font:600 20px ui-monospace,monospace;text-align:center" });
  const label = h("input", { type: "text", value: "Camera trong xe (trình duyệt)", maxLength: 40 });
  const go = (e) => busy(e.target || e.currentTarget, async () => {
    try {
      const r = await post("/v1/device/pair", { code: code.value.trim(), label: label.value.trim() || "Thiết bị trong xe", platform: "web" }, { anon: true });
      dev = { token: r.device_token, id: r.device_id, label: label.value.trim() || "Thiết bị trong xe", vehicle: `${r.vehicle.name} · ${r.vehicle.plate}` };
      try { localStorage.setItem(KEY, JSON.stringify(dev)); } catch { toast("Trình duyệt chặn lưu trữ: ghép nối sẽ mất khi tải lại trang.", "err"); }
      say("Đã ghép nối với xe."); render(); startLoop();
    } catch (er) { toast(er.message, "err"); }
  });
  code.addEventListener("keydown", (e) => { if (e.key === "Enter") go(e); });
  return h("div", { class: "devcol" },
    h("section", { class: "card gap" }, h("h2", {}, "Ghép thiết bị với xe"),
      h("ol", { class: "steps" },
        h("li", {}, "Trong ứng dụng người dùng: Tài khoản → Thiết bị trong xe → Tạo mã ghép thiết bị."),
        h("li", {}, "Nhập mã 8 ký tự vào ô bên dưới (mã dùng một lần, hết hạn sau 10 phút).")),
      h("div", { class: "field" }, h("label", {}, "Mã ghép"), code), h("div", { class: "field" }, h("label", {}, "Tên thiết bị"), label),
      h("button", { class: "btn primary block", on: { click: go } }, "Ghép nối"),
      h("p", { class: "small muted", style: "margin:0" }, "Mở nút “Tạo mã & mở thiết bị” trong ứng dụng người dùng để mã tự điền sẵn ở trang này.")));
}

// ---------------------------------------------------------------- paired console
const pill = h("span", { class: "pill grey" }, "Chưa gửi");
function paintStatus() {
  if (!ui.state) return;
  let cls = "grey", t = "Tạm ngừng gửi";
  if (run.sending) { if (run.error) { cls = "red"; t = "Mất kết nối máy chủ"; } else if (run.last) { cls = run.paused ? "orange" : "green"; t = run.paused ? "Đang tạm dừng giám sát" : "Đang gửi cho máy chủ"; } else t = "Đang kết nối…"; }
  pill.className = `pill ${cls}`; pill.textContent = t;
  ui.state.textContent = run.last ? `Lần gửi cuối ${fmt.clock(run.last)} · ${run.sent} lần` : "Chưa gửi lần nào";
}
function paintLog() {
  if (!ui.log) return;
  ui.log.replaceChildren(...run.log.map((l) => h("div", { class: l.bad ? "bad" : "" }, h("span", {}, l.at), l.text)));
}

// How many of each are in the car. Where they sit does not matter.
function whoControls() {
  return h("div", { class: "seatsel" }, WHO.map(([k, label]) => {
    const sel = h("select", { "aria-label": label, on: { change: (e) => { sim.who[k] = +e.target.value; send(); } } }, [0, 1, 2, 3].map((n) => h("option", { value: n, selected: sim.who[k] === n }, String(n))));
    sel.dataset.who = k;
    return h("label", { class: "seatcell" }, h("span", { class: "small muted" }, label), sel);
  }));
}

const SCENARIOS = [
  ["Xe trống", () => ({ who: { adult: 0, child: 0, pet: 0 }, blocked: false, engine: false, temp: null })],
  ["Có trẻ trong xe", () => ({ who: { adult: 0, child: 1, pet: 0 }, blocked: false, engine: false, temp: null })],
  ["Thú cưng trong xe", () => ({ who: { adult: 0, child: 0, pet: 1 }, blocked: false, engine: false, temp: null })],
  ["Trẻ + trời nóng 41°C", () => ({ who: { adult: 0, child: 1, pet: 0 }, blocked: false, engine: false, temp: 41 })],
  ["Che camera", () => ({ who: { adult: 0, child: 0, pet: 0 }, blocked: true, engine: false, temp: null })],
  ["Tài xế đang lái", () => ({ who: { adult: 1, child: 0, pet: 0 }, blocked: false, engine: true, temp: null })],
];
function applyScenario(fn) {
  const s = fn();
  sim.who = { ...s.who };
  sim.blocked = s.blocked; sim.engine = s.engine; sim.temp = s.temp;
  render(); send();
}

function simCard() {
  const items = h("div", { class: "row wrap" }, ITEMS.map((name) => {
    const b = h("button", { type: "button", class: "tog", "aria-pressed": sim.items.has(name), on: { click: () => { sim.items.has(name) ? sim.items.delete(name) : sim.items.add(name); b.setAttribute("aria-pressed", String(sim.items.has(name))); send(); } } }, name);
    return b;
  }));
  const temp = h("input", { type: "range", min: 15, max: 55, value: sim.temp ?? 30, disabled: sim.temp == null, "aria-label": "Nhiệt độ cabin mô phỏng",
    on: { input: (e) => { sim.temp = +e.target.value; tv.textContent = `${sim.temp}°C`; } } });
  const tv = h("span", { class: "small" }, sim.temp == null ? "không có cảm biến" : `${sim.temp}°C`);
  const bat = h("input", { type: "range", min: 1, max: 100, value: sim.battery, "aria-label": "Pin mô phỏng", on: { input: (e) => { sim.battery = +e.target.value; bv.textContent = `${sim.battery}%`; } } });
  const bv = h("span", { class: "small" }, `${sim.battery}%`);
  return h("section", { class: "card gap" }, h("div", { class: "row between" }, h("h3", {}, "Giả lập cảm biến"), h("span", { class: "pill orange" }, "MÔ PHỎNG")),
    h("p", { class: "small muted", style: "margin:0" }, "Chọn số người lớn, trẻ em, thú cưng và đồ vật trong xe. Dữ liệu gửi lên máy chủ y như thiết bị thật, nhưng là số liệu mô phỏng."),
    h("div", { class: "row wrap" }, SCENARIOS.map(([t, fn]) => h("button", { class: "btn small", on: { click: () => applyScenario(fn) } }, t))),
    whoControls(), h("div", {}, h("div", { class: "small muted", style: "margin-bottom:6px" }, "Đồ vật"), items),
    h("div", { class: "card pad0 list" },
      switchRow("Che camera", "Máy chủ sẽ báo “Chưa nhìn được trong xe”, không coi là xe trống", sim.blocked, (v) => { sim.blocked = v; send(); }),
      switchRow("Xe đang chạy (máy nổ)", "Tạm dừng giám sát cabin khi có tài xế", sim.engine, (v) => { sim.engine = v; send(); }),
      switchRow("Có cảm biến nhiệt cabin", "Thiết bị thật thường không có. Không bật thì app hiện “chưa có cảm biến”", sim.temp != null, (v) => { sim.temp = v ? 30 : null; temp.disabled = !v; temp.value = sim.temp ?? 30; tv.textContent = v ? "30°C" : "không có cảm biến"; send(); }),
      h("div", { class: "switch" }, h("div", {}, "Nhiệt độ cabin"), h("div", { class: "row" }, temp, tv)),
      h("div", { class: "switch" }, h("div", {}, "Pin thiết bị"), h("div", { class: "row" }, bat, bv)),
      switchRow("Đang sạc", null, sim.charging, (v) => { sim.charging = v; }),
      h("label", { class: "switch" }, h("div", {}, h("div", {}, "Nhiệt độ thiết bị"), h("div", { class: "small muted" }, "“Nóng” khiến máy chủ báo chưa thể đánh giá cabin")),
        h("select", { "aria-label": "Nhiệt độ thiết bị", style: "width:auto", on: { change: (e) => { sim.thermal = e.target.value; send(); } } }, [["nominal", "Bình thường"], ["fair", "Ấm"], ["serious", "Nóng"], ["critical", "Rất nóng"]].map(([k, t]) => h("option", { value: k, selected: sim.thermal === k }, t))))));
}

function gpsCard() {
  const num = (key, label) => { const i = h("input", { type: "number", step: "any", value: sim[key], "aria-label": label, on: { change: (e) => { sim[key] = +e.target.value; } } }); return h("label", { class: "field" }, h("span", { class: "small muted" }, label), i); };
  ui.lat = num("lat", "Vĩ độ hiện tại").querySelector("input"); ui.lon = num("lon", "Kinh độ hiện tại").querySelector("input");
  return h("section", { class: "card gap" }, h("div", { class: "row between" }, h("h3", {}, "Vị trí và chuyến đi"), h("span", { class: "pill orange" }, "MÔ PHỎNG")),
    h("p", { class: "small muted", style: "margin:0" }, "Để thử Đưa đón và bản đồ: bật gửi vị trí, đặt điểm đến trong app, đặt 1 trẻ em (hoặc 2 người lớn: tài xế và bé) rồi chạy thử."),
    h("div", { class: "card pad0 list" }, switchRow("Gửi vị trí giả lập", "Hiện xe trên bản đồ trong app", sim.gps, (v) => { sim.gps = v; send(); })),
    h("div", { class: "row" }, h("div", { class: "grow" }, h("label", { class: "field" }, h("span", { class: "small muted" }, "Vĩ độ hiện tại"), ui.lat)), h("div", { class: "grow" }, h("label", { class: "field" }, h("span", { class: "small muted" }, "Kinh độ hiện tại"), ui.lon))),
    h("div", { class: "row" }, ["toLat", "toLon"].map((k, i) => h("div", { class: "grow" }, h("label", { class: "field" }, h("span", { class: "small muted" }, i ? "Kinh độ điểm đến" : "Vĩ độ điểm đến"),
      h("input", { type: "number", step: "any", value: sim[k], on: { change: (e) => { sim[k] = +e.target.value; } } }))))),
    h("button", { class: "btn block", on: { click: () => { sim.gps = true; run.drive = { t0: Date.now(), a: [+sim.lat, +sim.lon], b: [+sim.toLat, +sim.toLon] }; say("Bắt đầu chạy thử 60 giây."); render(); send(); } } }, run.drive ? "Đang chạy thử…" : "Chạy thử 60 giây tới điểm đến"));
}

function camCard() {
  const video = h("video", { class: "video", autoplay: true, muted: true, playsInline: true, "aria-label": "Xem trước webcam, chỉ hiển thị trên máy này" });
  const scratch = h("canvas", { hidden: true, width: 32, height: 24 });
  const msg = h("div", { class: "small muted", role: "status", "aria-live": "polite" }, run.stream ? "Đang giám sát bằng webcam." : "Chưa bật webcam.");
  const mirror = switchRow("Lật ảnh trái/phải", "Bật nếu bản xem trước bị ngược trái/phải", run.mirror, (v) => { run.mirror = v; });
  const start = (e) => busy(e.target, async () => {
    try {
      msg.textContent = "Đang bật webcam…";
      run.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 640 } }, audio: false });
      video.srcObject = run.stream; await video.play();
      // A camera that is unplugged, revoked or taken by another app must be reported at once, never read as "nobody there".
      run.stream.getVideoTracks().forEach((t) => t.addEventListener("ended", () => {
        run.frame = { detections: [], items: [], ok: false };
        msg.textContent = "Camera đã ngắt kết nối. Máy chủ được báo camera không nhìn được (không coi là xe trống). Bật lại webcam để tiếp tục.";
        toast("Camera đã ngắt kết nối.", "err"); send();
      }));
      if ("wakeLock" in navigator) { try { run.wake = await navigator.wakeLock.request("screen"); } catch { /* optional */ } }
      msg.textContent = "Đang tải mô hình nhận diện (lần đầu mất vài giây)…";
      await loadModel();
      run.detectTimer = setInterval(async () => {
        const track = run.stream && run.stream.getVideoTracks()[0];
        if (!track || track.readyState !== "live") { run.frame = { detections: [], items: [], ok: false }; return; }
        if (video.readyState < 2) return;
        run.frame = await detectFrame(video, scratch, run.mirror);
        maybeSendPhoto(video);
        msg.textContent = `${run.frame.ok ? "Camera bình thường" : "Camera bị che hoặc quá tối"} · ${run.frame.detections.length} người/thú · ${run.frame.items.length} đồ vật`;
      }, DETECT_MS);
      render();
    } catch (er) { stopCamera(); const t = er.name === "NotAllowedError" ? "Bạn chưa cho phép dùng webcam." : er.name === "NotFoundError" ? "Không thấy webcam trên máy này. Dùng chế độ Giả lập." : er.message; msg.textContent = t; toast(t, "err"); }
  });
  return h("section", { class: "card gap" }, h("div", { class: "row between" }, h("h3", {}, "Webcam thật"), h("span", { class: "pill green" }, "ĐO THẬT")),
    h("p", { class: "small muted", style: "margin:0" }, "Nhận diện chạy ngay trên máy này (TensorFlow.js). Không phân biệt trẻ em. Không phát hiện được gì không có nghĩa là xe trống."),
    h("p", { class: "small", style: "margin:0" }, run.alertPhoto
      ? "Ảnh kèm cảnh báo: BẬT (chủ xe đã đồng ý). Khi thấy người, tối đa 1 ảnh mỗi 30 giây được gửi, có khung nhận diện và mặt người đã được che ngay trên máy này."
      : "Ảnh kèm cảnh báo: TẮT. Không có ảnh nào rời máy này."),
    video, scratch, msg, mirror,
    !run.stream ? h("button", { class: "btn primary block", on: { click: start } }, icon("cam"), "Bật webcam và nhận diện") : h("button", { class: "btn block", on: { click: () => { stopCamera(); render(); } } }, "Tắt webcam"));
}

function videoCard() {
  const s = clip.sample;
  // One video element for the whole page: render() rebuilds the card, and a media element taken out of the page pauses.
  clip.el ||= { video: h("video", { class: "video", muted: true, playsInline: true, loop: true, "aria-label": "Video đang phát thay camera, chỉ hiển thị trên máy này" }),
    overlay: h("canvas", { class: "video-overlay", "aria-hidden": "true" }), scratch: h("canvas", { hidden: true }),
    msg: h("div", { class: "small muted", role: "status", "aria-live": "polite" }), seenBox: h("div", { class: "card pad0 list" }) };
  const { video, overlay, scratch, msg, seenBox } = clip.el;
  if (!clip.vr) msg.textContent = "Chọn một video rồi bấm Bắt đầu.";
  // What the camera sees right now, anywhere in the cabin. Nothing seen is never "empty".
  const paintSeats = () => {
    const vr = clip.vr, seen = vr ? vr.seen : [];
    seenBox.replaceChildren(...(seen.length ? seen.map((t) => h("div", { class: "item" }, t))
      : [h("div", { class: "item muted" }, vr ? "Chưa thấy ai. Điều đó không có nghĩa là xe trống." : "—")]));
  };
  const pick = (sample) => { stopCamera(); clip.sample = sample; render(); };
  const sampleBtns = h("div", { class: "row wrap" }, [...SAMPLES, ...(clip.own ? [OWN] : [])].map((x) =>
    h("button", { type: "button", class: `tog ${s.id === x.id ? "on" : ""}`, "aria-pressed": s.id === x.id, on: { click: () => pick(x) } }, x.title)));
  const fileIn = h("input", { type: "file", accept: "video/*", "aria-label": "Chọn video của bạn", on: { change: (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (clip.own) URL.revokeObjectURL(clip.own);
    clip.own = URL.createObjectURL(f); clip.ownRef = null; pick(OWN);
  } } });
  const refIn = h("input", { type: "file", accept: "image/*", "aria-label": "Ảnh xe trống cùng góc máy", on: { change: (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (clip.ownRef) URL.revokeObjectURL(clip.ownRef);
    clip.ownRef = URL.createObjectURL(f); render();
  } } });
  const start = (e) => busy(e.target, async () => {
    try {
      msg.textContent = "Đang tải video…";
      video.src = s.id === "own" ? clip.own : sampleUrl(s);
      await video.play().catch(() => {});            // a hidden tab may refuse to play: the loop reports it and retries
      msg.textContent = "Đang tải mô hình nhận diện (lần đầu mất vài giây)…";
      await loadModel();
      const vr = newRun(s);
      const refUrl = s.id === "own" ? clip.ownRef : s.ref ? new URL(`../samples/${s.ref}`, import.meta.url).href : null;
      if (refUrl) {
        const img = new Image(); img.src = refUrl; await img.decode();
        await setReference(vr, img, scratch);
      }
      clip.vr = vr; clip.blocked = false;
      run.detectTimer = setInterval(async () => {
        if (clip.busy || clip.vr !== vr || video.readyState < 2) return;
        clip.busy = true;
        try {
          // A paused clip (the browser stops background video) is a frozen camera: report it, never "nobody there".
          if (video.paused) video.play().catch(() => {});
          const f = await analyse(vr, video, scratch, clip.blocked || video.paused);
          run.frame = f;
          paint(overlay, video, vr, f.boxes);
          maybeSendPhoto(video, false);                 // f.items are drawn on the photo too
          paintSeats();
          const st = stats(vr);
          msg.textContent = `${f.ok ? "Camera bình thường" : "Camera bị che hoặc quá tối"} · ${f.detections.length} người/thú · ${st.frames} khung · ${st.p50 != null ? Math.round(st.p50) : "–"} ms/khung${st.firstAlert != null ? ` · báo sau ${st.firstAlert.toFixed(1)} s` : ""}`;
        } finally { clip.busy = false; }
      }, DETECT_MS);
      render();
    } catch (er) { stopCamera(); msg.textContent = er.message || "Không phát được video."; toast(msg.textContent, "err"); }
  });
  const running = !!clip.vr;
  if (running) setTimeout(() => { video.play().catch(() => {}); paintSeats(); }, 0);
  else { video.pause(); video.removeAttribute("src"); overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height); paintSeats(); }
  const hasRef = s.id === "own" ? !!clip.ownRef : !!s.ref;
  return h("section", { class: "card gap" }, h("div", { class: "row between" }, h("h3", {}, "Video mẫu"), h("span", { class: "pill orange" }, "MÔ PHỎNG")),
    h("p", { class: "small muted", style: "margin:0" }, "Video phát và được nhận diện ngay trên máy này, thay cho camera trong xe. Máy chủ chỉ nhận loại (người, thú, đồ vật), độ tin cậy và khung; video không rời máy."),
    sampleBtns,
    h("p", { class: "small", style: "margin:0" }, h("strong", {}, s.title), ` · ${s.note}`, s.truth ? h("span", { class: "muted" }, ` Thực tế: ${s.truth}.`) : null),
    h("div", { class: "row wrap" }, h("label", { class: "field grow" }, h("span", { class: "small muted" }, "Hoặc dùng video của bạn"), fileIn),
      s.id === "own" ? h("label", { class: "field grow" }, h("span", { class: "small muted" }, "Ảnh xe trống cùng góc máy (tùy chọn)"), refIn) : null),
    h("p", { class: "small muted", style: "margin:0" }, hasRef ? "Có ảnh xe trống: chỗ nào khác lúc xe trống 3 khung liền được báo là có thể có người, kể cả khi mô hình không thấy ai." : "Không có ảnh xe trống: chỉ dựa vào mô hình. Không phát hiện được gì không có nghĩa là xe trống."),
    h("div", { class: "video-wrap" }, video, overlay), scratch, msg,
    running ? h("div", { class: "row wrap" },
      h("button", { class: "btn grow", on: { click: () => { clip.blocked = !clip.blocked; render(); } } }, clip.blocked ? "Bỏ che camera" : "Che camera"),
      h("button", { class: "btn grow", on: { click: () => { stopCamera(); run.frame = null; render(); send(); } } }, "Dừng"))
      : h("button", { class: "btn primary block", disabled: s.id === "own" && !clip.own, on: { click: start } }, icon("cam"), "Bắt đầu"),
    h("div", {}, h("div", { class: "small muted", style: "margin-bottom:6px" }, "Đang thấy (trên máy này)"), seenBox),
    h("p", { class: "small", style: "margin:0" }, run.alertPhoto
      ? "Ảnh kèm cảnh báo: BẬT. Khi thấy người, tối đa 1 ảnh mỗi 30 giây, có khung nhận diện, mặt người được che ngay trên máy này."
      : "Ảnh kèm cảnh báo: TẮT. Không có ảnh nào rời máy này."));
}

function consoleView() {
  ui.state = h("span", { class: "small muted" });
  ui.log = h("div", { class: "devlog", role: "log", "aria-label": "Nhật ký gửi dữ liệu" });
  const modeBtn = (m, text) => h("button", { type: "button", class: `tog ${run.mode === m ? "on" : ""}`, "aria-pressed": run.mode === m, on: { click: () => { if (run.mode === m) return; stopCamera(); run.frame = null; run.mode = m; render(); send(); } } }, text);
  const out = h("div", { class: "devcols" },
    h("div", { class: "devcol" },
      h("section", { class: "card gap" }, h("h3", {}, "Kết nối"),
        h("div", {}, h("div", {}, `Đã ghép: ${dev.label}`), h("div", { class: "small muted" }, `Xe: ${dev.vehicle}`), ui.state),
        h("div", { class: "card pad0 list" }, switchRow("Gửi dữ liệu cho máy chủ", "Tắt để giả lập thiết bị mất kết nối (sau 2 phút app báo ngoại tuyến)", run.sending, (v) => { run.sending = v; if (v) send(); else { paintStatus(); say("Đã tạm ngừng gửi."); } })),
        h("div", { class: "row wrap" },
          h("a", { class: "btn grow", href: "../", target: "cn-user" }, "Mở app người dùng ↗"),
          h("button", { class: "btn danger grow", on: { click: async () => { if (await confirmDialog({ title: "Ngắt ghép nối?", message: "Xe sẽ không được bảo vệ bởi thiết bị này nữa.", ok: "Ngắt", danger: true })) { try { await del("/v1/device", undefined, { deviceToken: dev.token }); } catch { /* may be revoked already */ } forget(); render(); } } } }, "Ngắt ghép nối"))),
      h("section", { class: "card gap" }, h("h3", {}, "Nhật ký"), ui.log)),
    h("div", { class: "devcol" },
      h("section", { class: "card gap" }, h("h3", {}, "Nguồn dữ liệu"), h("div", { class: "row" }, modeBtn("sim", "Giả lập"), modeBtn("video", "Video mẫu"), modeBtn("cam", "Webcam thật"))),
      run.mode === "cam" ? camCard() : run.mode === "video" ? videoCard() : [simCard(), gpsCard()]));
  setTimeout(() => { paintStatus(); paintLog(); }, 0);
  return out;
}

function render() {
  root.replaceChildren(h("div", { class: "devwrap" },
    h("header", { class: "devhead" }, h("img", { src: "../logo.png", alt: "", width: 32, height: 32 }), h("div", {}, h("h1", { style: "margin:0;font-size:20px" }, "Cabin Noir"), h("div", { class: "small muted" }, "Thiết bị camera trong xe")), h("div", { class: "grow" }), dev && pill),
    dev ? consoleView() : pairing(),
    h("p", { class: "small muted center" }, "Máy chủ chỉ nhận nhãn, độ tin cậy và vị trí khung. Ảnh camera chỉ rời máy khi chủ xe bật ảnh kèm cảnh báo, và mặt người trong ảnh được che ngay trên máy này. Chỉ giám sát, không điều khiển xe.")));
}

render();
if (dev) startLoop();
addEventListener("beforeunload", stopCamera);
