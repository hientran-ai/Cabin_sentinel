// The bell in the top bar: one list of alerts, new devices, camera/connection problems and update notices.
// It stays alive between page repaints (the shell is rebuilt every few seconds), so open state and scroll are not lost.
import { get } from "../api.js";
import { h, icon, fmt } from "../ui.js";
import { saveTab } from "./histtab.js";

const SEEN = "cn.bellSeen";
const POLL_MS = 20000;
const ICON = { alert: "alert-triangle", resolved: "seal", device: "smartphone", camera: "eye-off", offline: "wifi-off", update: "download" };
const TONE = { critical: "red", warning: "orange", info: "grey" };
const st = { items: [], build: null, newBuild: false, open: false, timer: null, loaded: false, error: null };
let btn = null, badge = null, panel = null, list = null;

const seenAt = () => { try { return Number(localStorage.getItem(SEEN) || 0); } catch { return 0; } };
const markSeen = () => { try { localStorage.setItem(SEEN, String(Date.now() / 1000)); } catch { /* optional */ } };
const all = () => (st.newBuild ? [{ id: "web-update", kind: "update", level: "info", title: "Có bản cập nhật", detail: "Cabin Noir vừa được nâng cấp. Tải lại trang để dùng bản mới.", at: Date.now() / 1000, action: "reload" }] : []).concat(st.items);
const unread = () => all().filter((i) => i.at > seenAt() && !(i.kind === "resolved" && i.level === "info")).length;

function go(i) {
  close();
  if (i.action === "reload") { location.reload(); return; }
  if (i.url) { window.open(i.url, "_blank", "noopener"); return; }
  if (i.kind === "alert" && i.incident_id) location.hash = `#/incident/${i.incident_id}`;
  else if (i.kind === "resolved" && i.incident_id) location.hash = `#/report/${i.incident_id}`;
  else if (i.kind === "camera" || i.kind === "offline") { saveTab("activity"); location.hash = "#/history"; }
  else if (i.kind === "device") location.hash = "#/account";
}

function paint() {
  if (!btn) return;
  const n = unread();
  badge.textContent = n > 9 ? "9+" : String(n); badge.hidden = n === 0;
  btn.setAttribute("aria-label", n ? `Thông báo, ${n} mới` : "Thông báo");
  btn.setAttribute("aria-expanded", String(st.open));
  panel.hidden = !st.open;
  if (!st.open) return;
  const items = all(), since = seenAtAtOpen;
  list.replaceChildren(...(items.length ? items.map((i) => h("button", { class: `bell-item ${i.at > since ? "new" : ""}`, on: { click: () => go(i) } },
    h("span", { class: `bell-ic ${TONE[i.level] || "grey"}` }, icon(ICON[i.kind] || "bell")),
    h("span", { class: "grow" }, h("span", { class: "bell-t" }, i.title), h("span", { class: "bell-d" }, i.detail || ""),
      h("span", { class: "bell-m" }, `${i.vehicle_name ? `${i.vehicle_name} · ` : ""}${fmt.ago(i.at)}`)))) :
    [h("div", { class: "bell-empty" }, st.error || (st.loaded ? "Chưa có thông báo nào." : "Đang tải…"))]));
}

let seenAtAtOpen = 0;
function open() { st.open = true; seenAtAtOpen = seenAt(); markSeen(); paint(); refresh(); }
function close() { if (st.open) { st.open = false; paint(); } }

export async function refresh() {
  try {
    const r = await get("/v1/me/notifications?limit=30&app=web");
    if (st.build && r.server_build && r.server_build !== st.build) st.newBuild = true;
    if (!st.build) st.build = r.server_build;
    st.items = r.items; st.error = null; st.loaded = true;
  } catch (e) { st.error = e.message || "Không tải được thông báo."; st.loaded = true; }
  paint();
}

export function bell() {
  if (!btn) {
    badge = h("span", { class: "bell-badge", hidden: true });
    btn = h("button", { class: "icon-btn bell", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-label": "Thông báo", on: { click: (e) => { e.stopPropagation(); st.open ? close() : open(); } } }, icon("bell"), badge);
    list = h("div", { class: "bell-list" });
    panel = h("div", { class: "bell-panel", role: "dialog", "aria-label": "Thông báo", hidden: true, on: { click: (e) => e.stopPropagation() } },
      h("div", { class: "row between", style: "padding:12px 14px 6px" }, h("strong", {}, "Thông báo"), h("button", { class: "btn ghost small", on: { click: close } }, "Đóng")), list);
    document.addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && st.open) { close(); btn.focus(); } });
    refresh();
    st.timer = setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
  }
  paint();
  return h("div", { class: "bell-wrap" }, btn, panel);
}

export function stopBell() { clearInterval(st.timer); st.timer = null; btn = badge = panel = list = null; st.items = []; st.build = null; st.newBuild = false; st.loaded = false; st.open = false; }
