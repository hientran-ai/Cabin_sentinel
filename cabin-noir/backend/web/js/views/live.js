// Live view for someone handling an incident. It draws what the in-car sensor reports (labelled boxes) and refreshes every 2 seconds.
// The picture itself never leaves the in-car device: the server only has positions, labels and confidences.
import { get } from "../api.js";
import { h, icon, fmt } from "../ui.js";

const POLL_MS = 2000;
const STALE_AFTER_S = 8;
const COLOR = { person: "#ff5a4d", pet: "#ff9f0a", item: "#f5c518" };
const KIND = { person: "Người", pet: "Thú cưng" };

let node = null, vid = null, timer = null, running = false, gen = 0, errored = null;
const refs = {};

function build() {
  refs.canvas = h("canvas", { role: "img", "aria-label": "Hình vẽ từ kết quả nhận diện của camera trong xe", style: "width:100%;aspect-ratio:16/9;border-radius:14px;background:#0d0d10;display:block" });
  refs.pill = h("span", { class: "pill grey" }, "Đang tải");
  refs.msg = h("div", { class: "banner", hidden: true, role: "status" });
  refs.list = h("div", { class: "small muted" });
  refs.note = h("p", { class: "small muted", style: "margin:0" });
  node = h("section", { class: "card gap", id: "live" },
    h("div", { class: "row between" }, h("h3", { style: "margin:0;display:flex;align-items:center;gap:8px" }, icon("cam"), "Xem trực tiếp"), refs.pill),
    refs.msg, refs.canvas, refs.list, refs.note);
}

function draw(data, stale) {
  const c = refs.canvas, dpr = window.devicePixelRatio || 1, w = c.clientWidth || 640, hh = Math.round(w * 9 / 16);
  c.width = w * dpr; c.height = hh * dpr;
  const g = c.getContext("2d"); g.scale(dpr, dpr);
  g.fillStyle = "#0d0d10"; g.fillRect(0, 0, w, hh);
  g.strokeStyle = "rgba(255,255,255,.06)"; g.lineWidth = 1;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, hh); g.stroke(); g.beginPath(); g.moveTo(0, i * hh / 4); g.lineTo(w, i * hh / 4); g.stroke(); }
  if (!data_ok(data)) {
    g.fillStyle = "rgba(255,255,255,.55)"; g.font = "600 15px -apple-system, sans-serif"; g.textAlign = "center";
    g.fillText(data && data.reason === "blocked" ? "Camera đang bị che" : "Không có hình mới", w / 2, hh / 2); return;
  }
  g.globalAlpha = stale ? 0.35 : 1;
  const boxes = [...(data.detections || []).map((d) => ({ ...d, type: d.kind, text: `${d.label} · ${KIND[d.kind] || d.kind} ${Math.round(d.conf * 100)}%${d.age === "child" ? " · có thể là trẻ em" : ""}` })),
    ...(data.items || []).map((i) => ({ ...i, type: "item", kind: "item", text: `${i.name} ${Math.round(i.conf * 100)}%` }))];
  let drawn = 0;
  for (const b of boxes) {
    if (!b.box) continue;
    drawn++;
    const [x, y, bw, bh] = b.box, col = COLOR[b.type];
    g.strokeStyle = col; g.lineWidth = 2.5; g.strokeRect(x * w, y * hh, bw * w, bh * hh);
    g.font = "600 12px -apple-system, sans-serif";
    // Keep the label inside the picture: shift it left at the right edge, put it inside the box at the top edge.
    const tw = Math.min(g.measureText(b.text).width + 10, w), tx = Math.max(0, Math.min(x * w, w - tw));
    const ty = y * hh >= 20 ? y * hh - 20 : Math.min(hh - 20, y * hh + 2);
    g.fillStyle = col; g.fillRect(tx, ty, tw, 20); g.fillStyle = "#111"; g.textAlign = "left"; g.fillText(b.text, tx + 5, ty + 14, tw - 10);
  }
  g.globalAlpha = 1;
  if (!drawn) {
    g.fillStyle = "rgba(255,255,255,.55)"; g.font = "600 14px -apple-system, sans-serif"; g.textAlign = "center";
    const has = (data.detections || []).length || (data.items || []).length;
    g.fillText(has ? "Thiết bị không gửi vị trí, xem danh sách bên dưới" : "Không phát hiện gì. Điều này không có nghĩa là xe trống", w / 2, hh / 2);
  }
}
let data = null;
const data_ok = (d) => d && d.available;

function paint() {
  if (!node) return;
  const stale = !data || !data.available || (data.age_s != null && data.age_s > STALE_AFTER_S);
  const ago = data && data.updated_at ? fmt.ago(data.updated_at) : "chưa có";
  refs.pill.className = `pill ${errored ? "red" : stale ? "orange" : "green"}`;
  refs.pill.textContent = errored ? "Mất kết nối" : data && data.available ? (stale ? `Hình cũ · ${ago}` : `Trực tiếp · ${ago}`) : "Không có hình";
  const msg = errored || (data && !data.available && data.message) || (stale ? `Hình này đã cũ (${ago}). Không dùng nó để kết luận xe trống.` : "");
  refs.msg.hidden = !msg; refs.msg.textContent = msg; refs.msg.className = `banner ${errored || (data && !data.available) ? "red" : ""}`;
  draw(data, stale);
  const lines = data && data.available ? [...(data.detections || []).map((d) => `${d.label}: ${KIND[d.kind] || d.kind} ${Math.round(d.conf * 100)}%${d.age === "child" ? " (có thể là trẻ em)" : ""}`),
    ...(data.items || []).map((i) => `Đồ vật: ${i.name} ${Math.round(i.conf * 100)}%`)] : [];
  refs.list.replaceChildren(...(lines.length ? lines.map((t) => h("div", {}, t)) : [h("div", {}, data && data.available ? "Chưa thấy người, thú cưng hay đồ vật." : "")]));
  refs.note.textContent = data ? `${data.note} Nguồn: ${data.basis === "measured" ? "thiết bị thật" : "mô phỏng"}.` : "";
}

async function tick(my) {
  if (my !== gen || !vid) return;
  if (!document.hidden || data === null) {      // a hidden tab pauses the refresh, but the first picture is always fetched
    try { const d = await get(`/v1/vehicles/${vid}/live`); if (my !== gen) return; data = d; errored = null; }
    catch (e) { if (my !== gen) return; errored = e.message || "Không tải được hình trực tiếp."; }
    paint();
  }
  timer = setTimeout(() => tick(my), POLL_MS);
}

document.addEventListener("visibilitychange", () => { if (!document.hidden && running) { clearTimeout(timer); tick(gen); } });

export function livePanel(vehicleId) {
  if (!node) build();
  if (vid !== vehicleId) { vid = vehicleId; data = null; errored = null; }
  if (!running) { running = true; tick(gen); }
  return node;
}

export function stopLive() { gen++; clearTimeout(timer); timer = null; running = false; vid = null; data = null; }
