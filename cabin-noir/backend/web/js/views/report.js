// One incident as a printable report: what the system saw, who was told and how fast, who looked, how it ended.
import { get } from "../api.js";
import { h, icon, fmt, toast } from "../ui.js";
import { basisPill, stat } from "./log.js";

const KIND = { level: "Thông báo đầu tiên", repeat: "Nhắc lại", resolved: "Báo đã đóng", sms: "SMS", call: "Gọi tự động", contacts: "SMS người liên hệ" };
const STATUS = { ok: ["Đã gửi", "green"], failed: ["Lỗi", "red"], skipped: ["Bỏ qua", "grey"] };

function spark(obs) {
  if (!obs.length) return h("p", { class: "muted small", style: "margin:0" }, "Nhật ký quan sát chi tiết đã hết hạn lưu (7 ngày) hoặc chưa có.");
  const max = Math.max(1, ...obs.map((o) => o.people + o.pets));
  return h("div", { class: "bars", role: "img", "aria-label": "Số người và thú cưng camera thấy trong suốt sự cố" },
    obs.map((o) => h("i", { class: o.camera_ok ? "" : "zero", style: `height:${Math.max(5, ((o.people + o.pets) / max) * 100)}%;max-width:14px`, title: fmt.clock(o.ts) })));
}

export async function render({ arg }) {
  let r;
  try { r = await get(`/v1/incidents/${arg}/report`); } catch (e) { return h("div", { class: "card center muted" }, e.message || "Không mở được báo cáo."); }
  const inc = r.incident, log = r.log;
  const first = r.deliveries.find((d) => d.kind === "level" && d.status === "ok");
  return h("div", { class: "gap report" },
    h("a", { href: "#/history", class: "noprint" }, "← Lịch sử"),
    h("div", { class: "row between wrap" }, h("h1", { style: "margin:0" }, "Báo cáo sự cố"),
      h("button", { class: "btn small noprint", on: { click: () => window.print() } }, icon("doc"), "In hoặc lưu PDF")),
    h("p", { class: "muted small", style: "margin:0" }, `Mã ${inc.id} · tạo ${new Date().toLocaleString("vi-VN")}`),
    h("section", { class: `card ${inc.level === "critical" ? "red" : ""}` }, h("h2", { style: "margin:0 0 6px" }, inc.reason),
      h("div", { class: "row wrap" }, h("span", { class: `pill ${inc.level === "critical" ? "red" : "orange"}` }, inc.level === "critical" ? "Nghiêm trọng" : "Cảnh báo"),
        log && basisPill(log.basis), h("span", { class: "pill grey" }, inc.status === "open" ? "Đang mở" : "Đã đóng"))),
    h("div", { class: "tiles" },
      stat("Bắt đầu", fmt.datetime(inc.created_at), ""),
      stat("Thời lượng", fmt.dur(log ? log.duration_s : inc.elapsed), inc.status === "open" ? "Đang diễn ra" : OUT(log)),
      stat("Gửi tin sau", first ? fmt.dur(first.delay_s) : "–", first ? "Từ lúc phát hiện" : "Chưa có tin gửi thành công"),
      stat("Có người xem sau", log && log.ack_s != null ? fmt.dur(log.ack_s) : "–", inc.viewed_by ? `Bởi ${inc.viewed_by}` : "Chưa ai xem"),
      stat("Cabin", inc.cabin_temp != null ? `${Math.round(inc.cabin_temp)}°C` : "–", inc.confidence ? `Độ tin cậy ${Math.round(inc.confidence * 100)}%` : "")),
    h("div", { class: "sec-title" }, "Dòng thời gian"),
    h("section", { class: "card timeline" }, inc.events.map((e) => h("div", {}, h("span", { class: "small muted" }, fmt.clock(e.at)), h("div", {}, h("div", {}, e.title), e.detail && h("div", { class: "small muted" }, e.detail))))),
    h("div", { class: "sec-title" }, "Thông báo đã gửi"),
    h("section", { class: "card pad0 list" }, r.deliveries.length ? r.deliveries.map((d) => {
      const [t, tone] = STATUS[d.status] || [d.status, "grey"];
      return h("div", { class: "item" }, h("div", { class: "grow" }, h("div", {}, KIND[d.kind] || d.kind), h("div", { class: "sub" }, `${fmt.clock(d.at)} · sau ${fmt.dur(d.delay_s)} · ${d.detail || ""}`)), h("span", { class: `pill ${tone}` }, t));
    }) : h("div", { class: "item muted" }, "Không có bản ghi gửi tin (đã quá 30 ngày hoặc chưa gửi).")),
    h("div", { class: "sec-title" }, "Camera thấy gì trong sự cố"), h("section", { class: "card" }, spark(r.observations),
      h("p", { class: "small muted", style: "margin:8px 0 0" }, r.notes)),
    r.related.length > 0 && [h("div", { class: "sec-title" }, "Cùng thời điểm"), h("section", { class: "card pad0 list" }, r.related.map((x) =>
      h("div", { class: "item" }, h("div", { class: "grow" }, h("div", {}, x.label), h("div", { class: "sub" }, `${fmt.datetime(x.started_at)} · ${fmt.dur(x.duration_s)}`)), basisPill(x.basis))))],
    h("p", { class: "small muted" }, r.chain.ok ? `Nhật ký xe nguyên vẹn: ${r.chain.checked} dòng niêm phong, không phát hiện chỉnh sửa.` : "Cảnh báo: chuỗi niêm phong của xe không khớp, nhật ký có thể đã bị sửa."),
    h("p", { class: "small muted" }, "Cabin Noir chỉ giám sát, không điều khiển xe. Nguồn số liệu: Đo thật là thiết bị thật, Mô phỏng là dữ liệu thử."));
}
const OUT = (log) => (log && log.outcome_label) || "";
