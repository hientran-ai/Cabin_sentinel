import { post, del, ApiError } from "../api.js";
import { h, icon, fmt, toast, busy, switchRow, confirmDialog } from "../ui.js";

// This browser acts as the in-car device: it watches the rear seats with the webcam, detects people, pets and bags ON THIS MACHINE
// (TensorFlow.js COCO-SSD) and sends only seat labels and confidences to the server. Camera frames never leave the browser.
export const live = false;
const KEY = "cn.device";
export const ITEM = { backpack: "Ba lô", handbag: "Túi xách", suitcase: "Vali", "teddy bear": "Gấu bông", "cell phone": "Điện thoại", bottle: "Chai nước" };
export const PET = new Set(["cat", "dog"]);
const SEND_MS = 2000, DETECT_MS = 600, CONF = 0.35;

const run = { stream: null, model: null, timers: [], wake: null, loading: false, last: null, sent: null, error: null, people: 0, items: 0, ok: true };
let dev = null;
try { dev = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { dev = null; }

export function script(src) {
  return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Không tải được thư viện nhận diện.")); document.head.append(s); });
}

export function destroy() { stop(); }
function stop() {
  run.timers.forEach(clearInterval); run.timers = [];
  if (run.stream) run.stream.getTracks().forEach((t) => t.stop());
  run.stream = null;
  if (run.wake) { run.wake.release().catch(() => {}); run.wake = null; }
}

export async function render(ctx) {
  const { rerender } = ctx;
  if (!dev) return pairing(ctx);
  const st = h("div", { class: "small muted", id: "dev-status", role: "status", "aria-live": "polite" }, run.stream ? "Đang giám sát…" : "Chưa bật camera.");
  const video = h("video", { class: "video", autoplay: true, muted: true, playsInline: true, "aria-label": "Xem trước webcam, chỉ hiển thị trên máy này" });
  const canvas = h("canvas", { hidden: true, width: 32, height: 24 });
  const opts = { parked: true, mirror: true, gps: false };

  const start = async (e) => busy(e.target, async () => {
    run.error = null;
    try {
      st.textContent = "Đang bật camera…";
      run.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 640 } }, audio: false });
      video.srcObject = run.stream; await video.play();
      if ("wakeLock" in navigator) { try { run.wake = await navigator.wakeLock.request("screen"); } catch { /* optional */ } }
      st.textContent = "Đang tải mô hình nhận diện (lần đầu mất vài giây)…";
      if (!run.model) {
        await script("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js");
        await script("https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js");
        run.model = await window.cocoSsd.load({ base: "lite_mobilenet_v2" });
      }
      loop(video, canvas, opts, st);
      rerender();
    } catch (er) { stop(); run.error = er.name === "NotAllowedError" ? "Bạn chưa cho phép dùng camera." : er.message; st.textContent = run.error; toast(run.error, "err"); }
  });

  return h("div", { class: "gap" }, h("a", { href: "#/account" }, "← Tài khoản"), h("h1", {}, "Thiết bị trong xe (trình duyệt)"),
    h("div", { class: "banner" }, "Đặt máy sao cho webcam nhìn ra hàng ghế sau. Giữ trang này mở và máy không ngủ. Không phát hiện được gì không có nghĩa là xe trống, và nhận diện này không phân biệt trẻ em."),
    h("div", { class: "card gap" }, video, canvas, st,
      h("div", { class: "row wrap" }, !run.stream ? h("button", { class: "btn primary grow", on: { click: start } }, icon("cam"), "Bật camera và giám sát") : h("button", { class: "btn grow", on: { click: () => { stop(); rerender(); } } }, "Dừng")),
      h("div", { class: "card pad0 list" },
        switchRow("Xe đang đỗ, tắt máy", "Tắt khi xe đang chạy để tạm dừng giám sát cabin", opts.parked, (v) => { opts.parked = v; }),
        switchRow("Lật ảnh trái/phải", "Bật nếu ghế sau trái hiện bên phải trong bản xem trước", opts.mirror, (v) => { opts.mirror = v; }),
        switchRow("Gửi vị trí", "Để theo dõi xe trên bản đồ", opts.gps, (v) => { opts.gps = v; }))),
    h("div", { class: "card gap" }, h("div", { class: "row between" }, h("div", {}, h("div", {}, `Đã ghép: ${dev.label}`), h("div", { class: "small muted" }, `Xe: ${dev.vehicle}`)),
      h("button", { class: "btn danger small", on: { click: async () => { if (await confirmDialog({ title: "Ngắt ghép nối?", message: "Xe sẽ không được bảo vệ bởi trình duyệt này nữa.", ok: "Ngắt", danger: true })) { stop(); try { await del("/v1/device", undefined, { deviceToken: dev.token }); } catch { /* may be revoked already */ } dev = null; try { localStorage.removeItem(KEY); } catch { /* ignore */ } rerender(); } } } }, "Ngắt"))));
}

function pairing(ctx) {
  const code = h("input", { type: "text", placeholder: "ABCD-EFGH", maxLength: 12, autocomplete: "off" });
  const label = h("input", { type: "text", value: "Trình duyệt web", maxLength: 40 });
  return h("div", { class: "gap" }, h("a", { href: "#/account" }, "← Tài khoản"), h("h1", {}, "Ghép trình duyệt này làm thiết bị trong xe"),
    h("p", { class: "muted", style: "margin:0" }, "Trong Tài khoản → Thiết bị trong xe, chủ xe bấm “Tạo mã ghép thiết bị”, rồi nhập mã vào đây."),
    h("div", { class: "card gap" }, h("div", { class: "field" }, h("label", {}, "Mã ghép"), code), h("div", { class: "field" }, h("label", {}, "Tên thiết bị"), label),
      h("button", { class: "btn primary block", on: { click: (e) => busy(e.target, async () => { try {
        const r = await post("/v1/device/pair", { code: code.value.trim(), label: label.value.trim() || "Trình duyệt web", platform: "web" }, { anon: true });
        dev = { token: r.device_token, id: r.device_id, label: label.value.trim() || "Trình duyệt web", vehicle: `${r.vehicle.name} · ${r.vehicle.plate}` };
        try { localStorage.setItem(KEY, JSON.stringify(dev)); } catch { toast("Trình duyệt chặn lưu trữ. Ghép nối sẽ mất khi tải lại trang.", "err"); }
        ctx.rerender(); } catch (er) { toast(er.message, "err"); } }) } }, "Ghép nối")));
}

export function seatOf(cx, w, mirror) {
  let i = cx < w / 3 ? 0 : cx < (2 * w) / 3 ? 1 : 2;
  if (mirror) i = 2 - i;
  return ["rear_left", "rear_mid", "rear_right"][i];
}

/** Pixel box to [x, y, w, h] in 0..1, flipped when the picture is mirrored so it matches the seat names. Position only, no pixels. */
export function norm(b, vw, vh, mirror) {
  const cl = (v) => Math.min(1, Math.max(0, v));
  let x = cl(b[0] / vw), y = cl(b[1] / vh), w = cl(b[2] / vw), hh = cl(b[3] / vh);
  w = Math.min(w, 1 - x); hh = Math.min(hh, 1 - y);
  if (mirror) x = Math.max(0, 1 - x - w);
  return [x, y, w, hh].map((v) => +v.toFixed(3));
}

function loop(video, canvas, opts, st) {
  const ctx2 = canvas.getContext("2d", { willReadFrequently: true });
  let frame = { detections: [], items: [], ok: true };
  const detect = async () => {
    if (!run.model || video.readyState < 2) return;
    ctx2.drawImage(video, 0, 0, 32, 24);
    const px = ctx2.getImageData(0, 0, 32, 24).data; let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += (px[i] + px[i + 1] + px[i + 2]) / 3;
    const dark = sum / (px.length / 4) < 12;                 // covered or lens in the dark: say so, never pretend to see
    let preds = [];
    try { preds = dark ? [] : await run.model.detect(video, 12, CONF); } catch { /* skip frame */ }
    const best = {}; const items = [];
    for (const p of preds) {
      const cx = p.bbox[0] + p.bbox[2] / 2;
      const seat = seatOf(cx, video.videoWidth || 640, opts.mirror);
      if (p.class === "person" || PET.has(p.class)) { const k = `${seat}`; if (!best[k] || p.score > best[k].conf) best[k] = { seat, kind: p.class === "person" ? "person" : "pet", conf: +p.score.toFixed(2), box: norm(p.bbox, video.videoWidth || 640, video.videoHeight || 480, opts.mirror) }; }
      else if (ITEM[p.class]) items.push({ name: ITEM[p.class], seat, conf: +p.score.toFixed(2), box: norm(p.bbox, video.videoWidth || 640, video.videoHeight || 480, opts.mirror) });
    }
    frame = { detections: Object.values(best), items: items.slice(0, 12), ok: !dark };
    run.people = frame.detections.length; run.items = frame.items.length; run.ok = frame.ok;
    st.textContent = `${frame.ok ? "Camera bình thường" : "Camera bị che hoặc quá tối"} · ${run.people} người/thú · ${run.items} đồ vật${run.sent ? ` · gửi lúc ${fmt.clock(run.sent)}` : ""}`;
  };
  const send = async () => {
    let extra = {};
    if (navigator.getBattery) { try { const b = await navigator.getBattery(); extra = { battery_pct: Math.round(b.level * 100), charging: b.charging }; } catch { /* optional */ } }
    let pos = {};
    if (opts.gps && "geolocation" in navigator) { pos = await new Promise((r) => navigator.geolocation.getCurrentPosition((p) => r({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy_m: p.coords.accuracy }), () => r({}), { timeout: 3000, maximumAge: 15000 })); }
    try {
      await post("/v1/device/telemetry", { detections: frame.detections, items: frame.items, camera_ok: frame.ok, locked: true, engine_on: !opts.parked, model: "coco-ssd-web", ...extra, ...pos }, { deviceToken: dev.token });
      run.sent = Date.now() / 1000; run.error = null;
    } catch (e) { run.error = e.message; st.textContent = `Không gửi được: ${e.message}`; if (e instanceof ApiError && e.status === 401) { stop(); dev = null; try { localStorage.removeItem(KEY); } catch { /* ignore */ } toast("Thiết bị đã bị ngắt. Ghép nối lại.", "err"); } }
  };
  run.timers.push(setInterval(detect, DETECT_MS), setInterval(send, SEND_MS));
}
