// Self-check: the person standing at the car points this device's camera into the cabin and sees what the detector finds.
// Everything runs on this device. Nothing is sent unless the person chooses to keep a photo (preview first, 30 days, deletable).
import { api } from "../api.js";
import { h, icon, toast, busy, sheet } from "../ui.js";
import { loadModel, ITEM, PET, norm } from "../detect.js";

const COLOR = { person: "#ff5a4d", pet: "#ff9f0a", item: "#f5c518" };
const st = { stream: null, model: null, timer: null, found: [], dark: false, running: false, loading: false };

export function destroy() { stop(); }
function stop() {
  clearInterval(st.timer); st.timer = null;
  if (st.stream) st.stream.getTracks().forEach((t) => t.stop());
  st.stream = null; st.running = false; st.found = [];
}

function summary() {
  if (!st.running) return "Chưa bật camera.";
  if (st.dark) return "Camera bị che hoặc quá tối. Chưa thể kiểm tra: dùng đèn pin hoặc kiểm tra bằng mắt.";
  const people = st.found.filter((f) => f.type !== "item" && f.kind === "person"), pets = st.found.filter((f) => f.kind === "pet"), items = st.found.filter((f) => f.type === "item");
  if (!st.found.length) return "Không thấy người, thú cưng hay đồ vật trong khung này. Điều đó chưa chắc xe trống: xoay camera qua từng ghế, sàn xe và cốp rồi tự nhìn lại.";
  return [people.length && `${people.length} người`, pets.length && `${pets.length} thú cưng`, items.length && `đồ vật: ${items.map((i) => i.name).join(", ")}`].filter(Boolean).join(" · ");
}

export async function render({ S }) {
  const vid = S.vid;
  const video = h("video", { autoplay: true, muted: true, playsInline: true, "aria-label": "Hình từ camera của máy này, không gửi đi", style: "width:100%;border-radius:14px;background:#000;display:block" });
  const overlay = h("canvas", { style: "position:absolute;inset:0;width:100%;height:100%;pointer-events:none" });
  const result = h("p", { role: "status", "aria-live": "polite", style: "margin:0;font-weight:600" }, summary());
  const wrap = h("div", { style: "position:relative" }, video, overlay);

  const paint = () => {
    const w = video.clientWidth, hh = video.clientHeight;
    overlay.width = w; overlay.height = hh;
    const g = overlay.getContext("2d");
    g.clearRect(0, 0, w, hh);
    for (const f of st.found) {
      const [x, y, bw, bh] = f.box, col = COLOR[f.type === "item" ? "item" : f.kind];
      g.strokeStyle = col; g.lineWidth = 2.5; g.strokeRect(x * w, y * hh, bw * w, bh * hh);
      const t = f.type === "item" ? `${f.name} ${Math.round(f.conf * 100)}%` : `${f.kind === "person" ? "Người" : "Thú cưng"} ${Math.round(f.conf * 100)}%`;
      g.font = "600 12px -apple-system, sans-serif";
      const tw = g.measureText(t).width + 10, ty = Math.max(0, y * hh - 20);
      g.fillStyle = col; g.fillRect(x * w, ty, tw, 20); g.fillStyle = "#111"; g.fillText(t, x * w + 5, ty + 14);
    }
    result.textContent = summary();
  };

  const probe = document.createElement("canvas"); probe.width = 32; probe.height = 24;
  const detect = async () => {
    if (!st.model || video.readyState < 2) return;
    const c = probe.getContext("2d", { willReadFrequently: true });
    c.drawImage(video, 0, 0, 32, 24);
    const px = c.getImageData(0, 0, 32, 24).data; let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += (px[i] + px[i + 1] + px[i + 2]) / 3;
    st.dark = sum / (px.length / 4) < 12;
    let preds = [];
    try { preds = st.dark ? [] : await st.model.detect(video, 12, 0.35); } catch { /* skip */ }
    const vw = video.videoWidth || 640, vh = video.videoHeight || 480, found = [];
    for (const p of preds) {
      const box = norm(p.bbox, vw, vh, false), conf = +p.score.toFixed(2);
      if (p.class === "person") found.push({ type: "person", kind: "person", conf, box });
      else if (PET.has(p.class)) found.push({ type: "pet", kind: "pet", conf, box });
      else if (ITEM[p.class]) found.push({ type: "item", name: ITEM[p.class], conf, box });
    }
    st.found = found; paint();
  };

  const start = (e) => busy(e.target, async () => {
    try {
      result.textContent = "Đang bật camera…";
      st.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 960 } }, audio: false });
      video.srcObject = st.stream; await video.play(); st.running = true;
      if (!st.model) {
        result.textContent = "Đang tải mô hình nhận diện (lần đầu mất vài giây)…";
        st.model = await loadModel();
      }
      st.timer = setInterval(detect, 500); result.textContent = summary();
      document.getElementById("check-actions").replaceWith(actions());
    } catch (er) {
      stop(); result.textContent = "Chưa bật được camera.";
      toast(er && er.name === "NotAllowedError" ? "Bạn chưa cho phép dùng camera. Cấp quyền trong trình duyệt rồi thử lại." : (er.message || "Không bật được camera."), "err");
    }
  });

  const keep = () => {
    const c = document.createElement("canvas"); c.width = video.videoWidth || 640; c.height = video.videoHeight || 480;
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    c.toBlob(async (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const ok = await sheet((close) => h("div", { class: "gap" }, h("img", { src: url, alt: "Xem trước", style: "width:100%;border-radius:12px" }),
        h("p", { class: "small muted", style: "margin:0" }, "Ảnh chỉ được gửi sau khi bạn xác nhận. Ảnh tự xóa sau 30 ngày và bạn xóa được bất kỳ lúc nào."),
        h("div", { class: "row" }, h("button", { class: "btn grow", on: { click: () => close(false) } }, "Không gửi"), h("button", { class: "btn primary grow", on: { click: () => close(true) } }, "Gửi vào nhật ký xe"))), { title: "Giữ ảnh này?" });
      URL.revokeObjectURL(url);
      if (ok) { try { await api("POST", `/v1/media/photo?vehicle_id=${vid}`, blob); toast("Đã gửi ảnh vào nhật ký xe.", "ok"); } catch (e) { toast(e.message, "err"); } }
    }, "image/jpeg", 0.85);
  };

  const actions = () => h("div", { class: "row wrap", id: "check-actions" },
    st.running ? [h("button", { class: "btn grow", on: { click: () => { stop(); document.getElementById("check-actions").replaceWith(actions()); paint(); } } }, "Dừng camera"),
      vid && h("button", { class: "btn grow", on: { click: keep } }, icon("cam"), "Giữ ảnh vào nhật ký")]
      : h("button", { class: "btn primary grow", on: { click: start } }, icon("cam"), "Bật camera và kiểm tra"));

  if (st.running && st.stream) { video.srcObject = st.stream; video.play().catch(() => {}); }
  return h("div", { class: "gap" }, h("a", { href: "#/history", on: { click: (e) => { if (history.length > 1) { e.preventDefault(); history.back(); } } } }, "← Quay lại"), h("h1", {}, "Tự kiểm tra cabin"),
    h("p", { class: "muted", style: "margin:0" }, "Đứng cạnh xe, hướng camera của máy này vào các ghế, sàn xe và cốp. Việc nhận diện chạy ngay trên máy, không gửi ảnh đi đâu."),
    wrap, result, actions(),
    h("div", { class: "banner" }, "Hệ thống không thấy gì không có nghĩa là xe trống. Luôn tự nhìn lại bằng mắt trước khi xác nhận đã kiểm tra xe."));
}
