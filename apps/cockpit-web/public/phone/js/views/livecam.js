// "Xem trực tiếp (mô phỏng)": the face-masked frame the car analysed last, refreshed every second. It is the same picture the car screen shows;
// the original frame never reaches the phone and this is not a real camera stream.
import { h } from "../ui.js";

const img = h("img", { class: "alert-photo", alt: "Khung hình mới nhất từ xe, đã che mặt", style: "width:100%;border-radius:14px;display:none" });
const note = h("p", { class: "small muted", style: "margin:0" }, "Chưa có hình. Chọn một clip ở màn hình xe để xem.");
const stamp = h("span", { class: "small muted" }, "");
let last = null, timer = null;

function tick() {
  let lf = null;
  try { lf = window.parent.__phoneBridge && window.parent.__phoneBridge.latestFrame && window.parent.__phoneBridge.latestFrame(); } catch (e) { lf = null; }
  if (!lf) { img.style.display = "none"; note.hidden = false; stamp.textContent = ""; last = null; return; }
  if (lf.url !== last) { last = lf.url; img.src = lf.url; }
  img.style.display = "block"; note.hidden = true;
  stamp.textContent = "Cập nhật " + new Date(lf.at).toLocaleTimeString("vi-VN", { hour12: false });
}

export function liveCard() {
  if (!timer) { timer = setInterval(tick, 1000); }
  tick();
  return h("section", { class: "card gap", id: "live-cam" },
    h("div", { class: "row between" }, h("h3", { style: "margin:0" }, "Xem trực tiếp"), h("span", { class: "pill" }, "MÔ PHỎNG")),
    img, note, stamp,
    h("p", { class: "small muted", style: "margin:0" }, "Khung hình xe vừa phân tích, đã che mặt, làm mới mỗi giây. Không phải luồng camera thật; ảnh gốc không rời xe."));
}
