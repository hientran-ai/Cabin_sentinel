// Cabin log, shown in two halves on the History page:
//   "alerts"   = left-behind episodes (someone has to act on them)
//   "activity" = device activity: camera blocked, connection lost, test videos (a trace, nothing to do right now)
// Rows are sealed in a hash chain, so the page can say whether the log was altered.
import { get, api } from "../api.js";
import { h, icon, fmt } from "../ui.js";

const ui = { kind: "all", days: 7, vid: null, mode: null, param: null, data: null, loaded: 0 };
const KIND = { left_behind: ["Bỏ quên", "red"], camera_blocked: ["Camera bị che", "orange"], device_offline: ["Mất kết nối", "grey"], replay: ["Video thử", "grey"] };
const LEVEL = { critical: "Nghiêm trọng", warning: "Cảnh báo" };
const kindParam = (mode) => (mode === "alerts" ? "left_behind" : ui.kind === "all" ? "activity" : ui.kind);

export async function loadLog(vid, mode, force = false) {
  const param = kindParam(mode);
  if (!force && ui.vid === vid && ui.param === param && ui.data && Date.now() - ui.loaded < 3500) return ui.data;
  ui.data = await get(`/v1/vehicles/${vid}/log?days=${ui.days}&kind=${param}`).catch(() => null);
  Object.assign(ui, { vid, param, mode, loaded: Date.now() });
  return ui.data;
}

export async function downloadCsv(vid, days) {
  const r = await api("GET", `/v1/vehicles/${vid}/log.csv?days=${days}`, undefined, { raw: true });
  if (!r.ok) throw new Error("Không tải được tệp.");
  const url = URL.createObjectURL(await r.blob());
  const a = h("a", { href: url, download: `nhat-ky-cabin-${days}-ngay.csv` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const basisPill = (b) => h("span", { class: `pill ${b === "measured" ? "green" : "grey"}`, title: "Nguồn số liệu" }, fmt.basis(b));

export function stat(label, value, sub, tone = "") {
  return h("div", { class: `tile ${tone}` }, h("div", { class: "small muted" }, label), h("div", { class: "v" }, value), sub && h("div", { class: "small muted" }, sub));
}

const ACT = { camera_blocked: ["eye-off", "orange"], device_offline: ["wifi-off", "orange"], replay: ["play", "grey"] };
const DAY_NAME = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

export function dayKey(ts) { const d = new Date(ts * 1000); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000; }
export function dayTitle(key) {
  const today = dayKey(Date.now() / 1000), d = new Date(key * 1000);
  if (key === today) return "Hôm nay";
  if (key === today - 86400) return "Hôm qua";
  return `${DAY_NAME[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** One row of the device-activity list. Only rows that are not real measurements wear a source chip, so "Mô phỏng" stands out. */
export function activityRow(i) {
  const [lbl] = KIND[i.kind] || [i.kind];
  const [ic, tone] = ACT[i.kind] || ["alert-triangle", "grey"];
  const sub = i.kind === "replay"
    ? `${i.outcome_label || ""}${i.conf_max != null ? ` · độ tin cậy cao nhất ${Math.round(i.conf_max * 100)}%` : ""}`
    : `${fmt.clock(i.started_at)} → ${i.ongoing ? "đang diễn ra" : fmt.clock(i.ended_at)} · ${fmt.dur(i.duration_s)}`;
  return h("div", { class: "arow" }, h("span", { class: `aic ${tone}` }, icon(ic)),
    h("div", { class: "grow" }, h("div", { class: "at" }, i.kind === "replay" ? `Video thử · ${i.clip || ""}` : lbl), h("div", { class: "as" }, sub),
      i.kind === "replay" && h("div", { class: "as" }, `${fmt.dur(i.duration_s)} trong video`)),
    i.basis !== "measured" && h("span", { class: "tag" }, fmt.basis(i.basis)), i.ongoing && h("span", { class: "tag red" }, "Đang mở"));
}

export function groupByDay(items) {
  const groups = new Map();
  for (const i of items) { const k = dayKey(i.started_at); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); }
  return [...groups.entries()].sort((a, b) => b[0] - a[0]);
}

export const ACTIVITY_KINDS = [["all", "Tất cả"], ["camera_blocked", "Camera bị che"], ["device_offline", "Mất kết nối"], ["replay", "Video thử"]];
export function setKind(k) { ui.kind = k; ui.loaded = 0; }
export function getKind() { return ui.kind; }
export function setDays(n) { ui.days = n; ui.loaded = 0; }
export function getDays() { return ui.days; }
