// Management overview: what happened across all vehicles you can see, in one screen. Not the admin console.
import { get } from "../api.js";
import { h, fmt } from "../ui.js";
import { basisPill, stat } from "./log.js";

const ui = { days: 7 };

// Shown at the top of the History page: all your vehicles at once, then the selected vehicle's log below it.
export async function overviewSection({ S, rerender }) {
  let o;
  try { o = await get(`/v1/me/overview?days=${ui.days}`); } catch (e) { return h("div", { class: "card center muted" }, e.message); }
  const t = o.total;
  if (!o.vehicles.length) return h("div", { class: "card center muted" }, "Thêm xe để xem tổng quan.");
  return h("div", { class: "gap" },
    h("div", { class: "row between wrap" }, h("div", { class: "sec-title", style: "margin:0 4px" }, "Tổng quan các xe"),
      h("div", { class: "row" }, [7, 30, 90].map((n) => h("button", { class: `btn small ${ui.days === n ? "primary" : ""}`, "aria-pressed": ui.days === n, on: { click: () => { ui.days = n; rerender(); } } }, `${n} ngày`)))),
    h("div", { class: "row wrap", style: "align-items:center" }, o.basis.map(basisPill), h("span", { class: "small muted" }, `${t.vehicles} xe · ${o.days} ngày qua`)),
    h("div", { class: "tiles" },
      stat("Sự cố bỏ quên", String(t.left_behind), `${t.critical} nghiêm trọng · ${t.open} đang mở`, t.open ? "red" : ""),
      stat("Đóng thủ công", String(t.manual_close), "Hệ thống vẫn thấy người nhưng đã có người xác nhận"),
      stat("Camera bị che", `${t.camera_blocked} lần`, `Tổng ${fmt.dur(t.camera_blocked_min * 60)}`, t.camera_blocked ? "orange" : ""),
      stat("Mất kết nối", `${t.offline} lần`, `Tổng ${fmt.dur(t.offline_min * 60)}`),
      stat("Có người xem sau", fmt.dur(t.median_ack_s), "Trung vị"),
      stat("Gửi tin sau", fmt.dur(t.median_notify_s), "Trung vị, từ lúc phát hiện")),
    h("div", { class: "sec-title" }, "Từng xe (xe cần chú ý xếp trước)"),
    h("section", { class: "card pad0 list" }, o.vehicles.map((v) => h("button", { class: `item ${S.vid === v.vehicle_id ? "on" : ""}`, "aria-pressed": S.vid === v.vehicle_id, style: "text-align:left",
      on: { click: () => { S.vid = v.vehicle_id; rerender(); } }, "aria-label": `Xem nhật ký của ${v.name}` },
      h("div", { class: "grow" }, h("div", {}, `${v.name} · ${v.plate}`),
        h("div", { class: "sub" }, `${v.left_behind} bỏ quên (${v.critical} nghiêm trọng) · che camera ${fmt.dur(v.camera_blocked_min * 60)} · mất kết nối ${fmt.dur(v.offline_min * 60)}`)),
      v.open ? h("span", { class: "pill red" }, `${v.open} đang mở`) : h("span", { class: `pill ${v.device.online ? "green" : "grey"}` }, v.device.known ? (v.device.online ? "Thiết bị trực tuyến" : "Thiết bị ngoại tuyến") : "Chưa có thiết bị")))),
    h("p", { class: "small muted" }, o.note, " Chỉ có số lượng, nhãn ghế và thời lượng. Không có ảnh và không hiện tên bé."));
}
