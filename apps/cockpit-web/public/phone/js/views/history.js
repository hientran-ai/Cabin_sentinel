import { get, post, del, api } from "../api.js";
import { h, icon, fmt, toast, sheet, confirmDialog, busy } from "../ui.js";
import { loadLog, downloadCsv, activityRow, groupByDay, dayKey, dayTitle, ACTIVITY_KINDS, setKind, getKind, setDays, getDays, basisPill } from "./log.js";
import { loadTab, saveTab } from "./histtab.js";
import { overviewSection } from "./overview.js";

const ui = { level: "all", loaded: null, data: null, obs: null, audit: null, photos: null, vid: null };
const LEVEL = { critical: ["Nghiêm trọng", "red"], warning: ["Cảnh báo", "orange"] };

async function load(vid, owner) {
  if (ui.vid === vid && ui.loaded && Date.now() - ui.loaded < 3500) return;
  const [d, o, p, a] = await Promise.all([
    get(`/v1/vehicles/${vid}/history?days=30&level=${ui.level}`).catch(() => ({ incidents: [], events: [] })),
    get(`/v1/vehicles/${vid}/observations?hours=24&limit=2000`).catch(() => null),
    get(`/v1/vehicles/${vid}/photos`).catch(() => []),
    owner ? get(`/v1/vehicles/${vid}/audit?limit=40`).catch(() => null) : null,
  ]);
  Object.assign(ui, { vid, loaded: Date.now(), data: d, obs: o, photos: p, audit: a });
}

function chart(obs) {
  if (!obs || !obs.items.length) return h("p", { class: "muted small", style: "margin:0" }, "Chưa có dữ liệu cảm biến trong 24 giờ qua.");
  const now = Date.now() / 1000, buckets = new Array(48).fill(null);
  for (const it of obs.items) { const i = 47 - Math.floor((now - it.ts) / 1800); if (i >= 0 && i < 48) buckets[i] = Math.max(buckets[i] ?? 0, it.people + it.pets); }
  const max = Math.max(1, ...buckets.map((b) => b || 0));
  return h("div", {}, h("div", { class: "bars", role: "img", "aria-label": "Số người và thú cưng camera thấy theo từng 30 phút trong 24 giờ qua" },
    buckets.map((b) => h("i", { class: b ? "" : "zero", style: `height:${b == null ? 3 : Math.max(5, (b / max) * 100)}%` }))),
    h("div", { class: "row between small muted" }, h("span", {}, "24 giờ trước"), h("span", {}, "bây giờ")),
    h("p", { class: "small muted", style: "margin:6px 0 0" }, `Chỉ lưu số lượng, không lưu ảnh. Tự xóa sau ${obs.retention_hours} giờ. Khoảng trống nghĩa là không có dữ liệu, không phải xe trống.`));
}

async function photoView(vid, p) {
  const r = await api("GET", `/v1/vehicles/${vid}/photos/${p.id}`, undefined, { raw: true });
  if (!r.ok) { toast("Không mở được ảnh.", "err"); return; }
  const url = URL.createObjectURL(await r.blob());
  await sheet(() => h("div", { class: "gap" }, h("img", { src: url, alt: "Ảnh đã gửi", style: "width:100%;border-radius:12px" }), h("p", { class: "small muted", style: "margin:0" }, `Tự xóa ${fmt.datetime(p.expires_at)}`)), { title: "Ảnh" });
  URL.revokeObjectURL(url);
}

function uploadPhoto(vid, refresh) {
  const input = h("input", { type: "file", accept: "image/jpeg,image/png", hidden: true, on: { change: async () => {
    const f = input.files[0]; input.value = ""; if (!f) return;
    if (f.size > 6 * 1024 * 1024) { toast("Ảnh lớn hơn 6 MB.", "err"); return; }
    const url = URL.createObjectURL(f);
    const ok = await sheet((close) => h("div", { class: "gap" }, h("img", { src: url, alt: "Xem trước", style: "width:100%;border-radius:12px" }),
      h("p", { class: "small muted", style: "margin:0" }, "Ảnh chỉ được gửi sau khi bạn xác nhận. Ảnh tự xóa sau 30 ngày và bạn xóa được bất kỳ lúc nào."),
      h("div", { class: "row" }, h("button", { class: "btn grow", on: { click: () => close(false) } }, "Hủy"), h("button", { class: "btn primary grow", on: { click: () => close(true) } }, "Gửi ảnh"))), { title: "Gửi ảnh vào nhật ký xe" });
    URL.revokeObjectURL(url);
    if (ok) { try { await api("POST", `/v1/media/photo?vehicle_id=${vid}`, f); toast("Đã gửi ảnh.", "ok"); ui.loaded = null; refresh(); } catch (e) { toast(e.message, "err"); } }
  } } });
  return h("div", {}, input, h("button", { class: "btn small", on: { click: () => input.click() } }, icon("plus"), "Gửi ảnh"));
}

const sum = { vid: null, data: null, at: 0 };
const view = { day: null };                                  // a tapped day of the strip filters both halves

async function loadSummary(vid, force = false) {
  if (!force && sum.vid === vid && sum.data && Date.now() - sum.at < 3500) return sum.data;
  sum.data = await get(`/v1/vehicles/${vid}/log/summary?days=${getDays()}&tz=${-new Date().getTimezoneOffset()}`).catch(() => null);
  Object.assign(sum, { vid, at: Date.now() });
  return sum.data;
}

const BAR = { critical: "var(--red)", warning: "var(--orange)", notice: "color-mix(in srgb, var(--orange) 45%, var(--card2))", none: "var(--card2)" };
const BAR_H = { critical: 100, warning: 70, notice: 40, none: 14 };

function hero(S, sm, d, rerender, tab) {
  const open = d.incidents.filter((i) => i.status === "open").length;
  const closed = d.incidents.filter((i) => i.status === "resolved").length;
  const days = getDays();
  const strip = sm ? h("div", { class: "strip", role: "group", "aria-label": "Màu theo mức nặng nhất của mỗi ngày (90 ngày: mỗi tuần)" }, sm.days.map((x, i) => {
    const sel = view.day === x.start;
    const text = `${x.label}${x.today ? " (hôm nay)" : ""}: ${x.worst === "none" ? "không có gì" : x.worst === "notice" ? "có lúc không được giám sát" : `${x.incidents} sự cố`}`;
    return h("button", { class: `sday ${sel ? "sel" : ""}`, "aria-pressed": sel, "aria-label": text, title: text,
      on: { click: () => { view.day = sel ? null : x.start; rerender(); } } },
      h("span", { class: "sbar", style: `height:${BAR_H[x.worst]}%;background:${BAR[x.worst]}` }), h("span", { class: "slab" }, (sm.days.length <= 7 || (sm.days.length > 13 ? (sm.days.length - 1 - i) % 5 === 0 : (sm.days.length - 1 - i) % 2 === 0)) ? (x.today ? "Nay" : x.label) : "\u00a0"));
  })) : null;
  const cov = sm && sm.coverage;
  return h("section", { class: "hero glass" },
    h("div", { class: "row between" }, h("div", { class: "kicker2" }, `${days} ngày qua`),
      h("div", { class: "pmenu" }, [7, 30, 90].map((n) => h("button", { class: getDays() === n ? "on" : "", "aria-pressed": getDays() === n, on: { click: () => { setDays(n); view.day = null; sum.at = 0; ui.loaded = null; rerender(); } } }, n)))),
    h("div", { class: "headline" }, open ? [h("span", { class: "red" }, `${open} sự cố đang mở`), `, ${closed} đã xử lý`] : `${d.incidents.length ? `${d.incidents.length} sự cố, đã xử lý hết` : "Không có sự cố"}`),
    strip,
    tab === "alerts" && cov && h("div", { class: `covline ${cov.pct >= 95 ? "good" : cov.pct >= 80 ? "warn" : "bad"}` }, icon(cov.pct >= 95 ? "shield" : "alert-triangle"), h("span", {}, `Giám sát ${String(cov.pct).replace(".", ",")}% thời gian`), basisPill(cov.basis)),
    tab === "alerts" && sm && !cov && h("div", { class: "covline muted small" }, "Chưa có thiết bị trong xe nên chưa tính được thời gian giám sát."),
    view.day && h("button", { class: "btn small ghost", on: { click: () => { view.day = null; rerender(); } } }, "Bỏ lọc ngày"));
}

function inDay(ts) {
  if (view.day == null) return true;
  const x = (sum.data && sum.data.days || []).find((d) => d.start === view.day);
  return ts >= view.day && ts < view.day + 86400 * ((x && x.span) || 1);
}

function stepper(inc, row) {
  const steps = [];
  if (row && row.notify_s != null) steps.push(["done", `Gửi tin ${fmt.dur(row.notify_s)}`]); else steps.push(["pending", "Chưa gửi được tin"]);
  if (inc.viewed_at) steps.push(["done", `Xem sau ${fmt.dur(row && row.ack_s != null ? row.ack_s : inc.viewed_at - inc.created_at)}`]); else steps.push([inc.status === "open" ? "pending" : "skip", "Chưa ai xem"]);
  if (inc.status === "resolved") steps.push(["ok", `Đóng sau ${fmt.dur(Math.max(0, (inc.resolved_at || inc.created_at) - inc.created_at))}`]); else steps.push(["pending", "Đang mở"]);
  return h("div", { class: "steps2", "aria-hidden": "false" }, steps.map(([k, t]) => h("span", { class: `st ${k}` }, h("i", {}), t)));
}

function incidentCard(inc, row) {
  const crit = inc.level === "critical", open = inc.status === "open";
  const tone = open ? (crit ? "red" : "orange") : "green";
  return h("a", { class: `icard ${tone}`, href: `#/report/${inc.id}`, "aria-label": `${open ? "Sự cố đang mở" : "Sự cố đã đóng"}: ${inc.reason}` },
    h("div", { class: "row between" }, h("b", { class: "ititle" }, crit ? "Có thể có người trong xe" : "Cảnh báo cabin"),
      h("span", { class: `tag ${open ? tone : ""}` }, open ? "Đang mở" : (row && row.outcome_label) || "Đã đóng")),
    h("div", { class: "isub" }, `${inc.seat_label ? `${inc.seat_label} · ` : ""}${fmt.datetime(inc.created_at)}${row ? ` · ${fmt.dur(row.duration_s)}` : ""}`),
    h("div", { class: "isub" }, inc.reason),
    stepper(inc, row), row && row.basis !== "measured" && h("span", { class: "tag" }, fmt.basis(row.basis)));
}

export async function render(ctx) {
  const { S, refresh, rerender } = ctx;
  if (!S.vid) return h("div", { class: "card center muted" }, "Thêm xe để xem lịch sử.");
  const role = S.status && S.status.role;
  if (role === "school") return h("div", { class: "card center muted" }, "Tài khoản chỉ có quyền Đưa đón.");
  const tab = loadTab();
  await Promise.all([load(S.vid, role === "owner"), loadLog(S.vid, tab), loadSummary(S.vid)]);
  const d = ui.data, lg = await loadLog(S.vid, tab);
  const canPhoto = false;
  const open = d.incidents.filter((i) => i.status === "open").length;
  const go = (t) => { saveTab(t); ui.loaded = null; rerender(); };
  const seg = h("div", { class: "seg glass", role: "tablist", "aria-label": "Loại lịch sử" },
    h("button", { role: "tab", class: tab === "alerts" ? "on" : "", "aria-selected": tab === "alerts", on: { click: () => go("alerts") } }, "Cảnh báo", open > 0 && h("i", { class: "dot-red", "aria-label": `${open} sự cố đang mở` })),
    h("button", { role: "tab", class: tab === "activity" ? "on" : "", "aria-selected": tab === "activity", on: { click: () => go("activity") } }, "Hoạt động thiết bị"));
  const rows = lg ? new Map(lg.items.filter((i) => i.incident_id).map((i) => [i.incident_id, i])) : new Map();
  const stats = lg && lg.stats;

  const alerts = () => {
    const list = d.incidents.filter((i) => inDay(i.created_at));
    const quiet = stats ? stats.camera_blocked + stats.offline : 0;
    return [
      quiet > 0 && h("button", { class: "nudge", on: { click: () => go("activity") } }, icon("eye-off"),
        h("span", { class: "grow" }, `Có lúc xe không được giám sát: che camera ${stats.camera_blocked} lần, mất kết nối ${stats.offline} lần. Xem ở Hoạt động thiết bị.`), icon("chev")),
      h("div", { class: "row wrap" }, [["all", "Tất cả"], ["warning", "Cảnh báo"], ["critical", "Nghiêm trọng"]].map(([k, t]) => h("button", { class: `chip2 ${ui.level === k ? "on" : ""}`, "aria-pressed": ui.level === k, on: { click: () => { ui.level = k; ui.loaded = null; rerender(); } } }, t))),
      list.length ? h("div", { class: "cards" }, list.map((i) => incidentCard(i, rows.get(i.id)))) : h("div", { class: "empty glass" }, icon("shield"), h("div", {}, view.day ? "Không có sự cố trong ngày này." : `Không có sự cố trong ${getDays()} ngày qua.`)),
      stats && h("div", { class: "foot2" }, [stats.median_ack_s != null && `có người xem sau ${fmt.dur(stats.median_ack_s)}`, stats.median_notify_s != null && `gửi tin sau ${fmt.dur(stats.median_notify_s)}`]
        .filter(Boolean).join(" · ").replace(/^./, (c) => c.toUpperCase()).concat(stats.median_ack_s != null || stats.median_notify_s != null ? " (trung vị). " : "", stats.manual_close ? `${stats.manual_close} lần đóng thủ công.` : ""))];
  };

  const activity = () => {
    const items = (lg ? lg.items : []).filter((i) => inDay(i.started_at));
    const cov = sum.data && sum.data.coverage;
    return [
      cov && h("section", { class: "cov glass" },
        h("div", { class: "row between" }, h("div", { class: "kicker2" }, "Thời gian được giám sát"), basisPill(cov.basis)),
        h("div", { class: "covnum" }, `${String(cov.pct).replace(".", ",")}%`),
        h("div", { class: "covbar", role: "img", "aria-label": `Giám sát ${cov.pct}% thời gian, mất giám sát ${fmt.dur(cov.lost_s)}` }, cov.segments.map((sg) => h("i", { class: sg.kind, style: `left:${sg.from * 100}%;width:${Math.max(0.8, (sg.to - sg.from) * 100)}%` }))),
        h("div", { class: "legend" }, h("span", {}, h("i", { class: "g" }), "Giám sát"), h("span", {}, h("i", { class: "o" }), "Camera bị che"), h("span", {}, h("i", { class: "n" }), "Mất kết nối"))),
      h("div", { class: "row wrap" }, ACTIVITY_KINDS.map(([k, t]) => h("button", { class: `chip2 ${getKind() === k ? "on" : ""}`, "aria-pressed": getKind() === k, on: { click: () => { setKind(k); ui.loaded = null; rerender(); } } }, t))),
      items.length ? groupByDay(items).map(([k, list]) => h("section", { class: "dgroup" }, h("h3", { class: "dtitle" }, dayTitle(k)), h("div", { class: "group glass" }, list.map(activityRow))))
        : h("div", { class: "empty glass" }, icon("check"), h("div", {}, "Không có hoạt động nào trong khoảng này.")),
      lg && h("div", { class: "foot2" }, h("span", { class: `seal ${lg.chain.ok ? "ok" : "bad"}` }, icon(lg.chain.ok ? "shield" : "alert-triangle"), lg.chain.ok ? `Nhật ký nguyên vẹn, ${lg.chain.checked} dòng niêm phong` : "Nhật ký có dấu hiệu bị sửa")),
      h("details", { class: "more glass" }, h("summary", {}, "Camera thấy gì trong 24 giờ"), chart(ui.obs)),
      h("details", { class: "more glass" }, h("summary", {}, "Dòng thời gian"),
        h("div", { class: "timeline" }, d.events.slice(0, 40).map((e) => h("div", {}, h("span", { class: "small muted" }, fmt.clock(e.at)), h("div", {}, h("div", {}, e.title), e.detail && h("div", { class: "small muted" }, e.detail)))))),
      canPhoto && h("details", { class: "more glass" }, h("summary", {}, `Ảnh đã gửi${(ui.photos || []).length ? ` (${ui.photos.length})` : ""}`), h("div", { class: "row between", style: "margin:8px 0" }, h("span", { class: "small muted" }, "Tự xóa sau 30 ngày"), uploadPhoto(S.vid, rerender)),
        h("div", { class: "list" }, (ui.photos || []).length ? ui.photos.map((p) => h("div", { class: "item" }, icon("cam"), h("button", { class: "btn ghost small grow", style: "justify-content:flex-start", on: { click: () => photoView(S.vid, p) } }, `Ảnh ${fmt.datetime(p.created_at)}`),
          h("button", { class: "btn ghost small", "aria-label": "Xóa ảnh", on: { click: async () => { if (await confirmDialog({ title: "Xóa ảnh?", message: "Ảnh bị xóa vĩnh viễn.", ok: "Xóa", danger: true })) { try { await del(`/v1/vehicles/${S.vid}/photos/${p.id}`); ui.loaded = null; rerender(); } catch (e) { toast(e.message, "err"); } } } } }, icon("x")))) : h("div", { class: "item muted" }, "Chưa có ảnh."))),
      role === "owner" && ui.audit && h("details", { class: "more glass" }, h("summary", {}, "Nhật ký truy cập (chỉ chủ xe)"),
        h("div", { class: "timeline" }, ui.audit.items.length ? ui.audit.items.map((a) => h("div", {}, h("span", { class: "small muted" }, fmt.clock(a.ts)), h("div", {}, h("div", {}, `${a.actor_name || "Thiết bị/ẩn danh"} · ${a.action}`), h("div", { class: "small muted" }, a.outcome === "ok" ? "Thành công" : a.outcome === "denied" ? "Bị từ chối" : "Không thành công")))) : h("div", { class: "muted" }, "Chưa có."),
          h("p", { class: "small muted", style: "margin:8px 0 0" }, `Lưu ${ui.audit.retention_days} ngày. Không lưu nội dung yêu cầu.`)))];
  };

  return h("div", { class: "gap hist" },
    h("h1", {}, "Lịch sử"),
    hero(S, sum.data, d, rerender, tab),
    S.vehicles.length > 1 && h("details", { class: "more glass" }, h("summary", {}, `Các xe và số liệu chi tiết (${S.vehicles.length})`), await overviewSection(ctx)),
    seg, ...(tab === "alerts" ? alerts() : activity()),
    h("div", { class: "actionbar glass" },
      canPhoto && h("a", { class: "btn primary grow", href: "#/check" }, icon("scan"), "Tự kiểm tra cabin"),
      canPhoto && h("button", { class: "btn icon-only", "aria-label": "Tải nhật ký (CSV)", on: { click: (e) => busy(e.currentTarget, async () => { try { await downloadCsv(S.vid, getDays()); } catch (er) { toast(er.message, "err"); } }) } }, icon("download"))));
}
