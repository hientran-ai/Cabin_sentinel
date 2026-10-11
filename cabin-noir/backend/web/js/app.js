import { auth, get, ApiError } from "./api.js";
import { h, icon, toast, playBeep } from "./ui.js";
import { bell, stopBell } from "./views/bell.js";

// Shared state. Views read it and call actions; polling keeps it fresh.
export const S = { cfg: null, me: null, vehicles: [], vid: null, status: null, trips: [], children: [], loadedAt: 0, error: null };
const root = document.getElementById("app");
let route = { name: "home", arg: null };
let view = null;               // current view module
let timer = null;
let lastIncident = null;

const VIEWS = {
  home: () => import("./views/home.js"), incident: () => import("./views/incident.js"), school: () => import("./views/school.js"),
  history: () => import("./views/history.js"), check: () => import("./views/check.js"), report: () => import("./views/report.js"), account: () => import("./views/account.js"), device: () => import("./views/device.js"),
};
const TABS = [["home", "Xe", "car"], ["school", "Đưa đón", "school"], ["history", "Lịch sử", "hist"], ["account", "Tài khoản", "user"]];

export const go = (hash) => { location.hash = hash; };
export const vehicle = () => S.vehicles.find((v) => v.vehicle.id === S.vid);
export const role = () => (S.status && S.status.role) || (vehicle() && vehicle().role) || "view";

export async function refresh(full = true) {
  try {
    S.vehicles = await get("/v1/vehicles");
    if (!S.vehicles.some((v) => v.vehicle.id === S.vid)) S.vid = S.vehicles[0] ? S.vehicles[0].vehicle.id : null;
    if (S.vid) {
      const [st, tr] = await Promise.all([get(`/v1/vehicles/${S.vid}/status`), get(`/v1/vehicles/${S.vid}/trips`).catch(() => [])]);
      S.status = st; S.trips = tr;
    } else { S.status = null; S.trips = []; }
    S.error = null; S.loadedAt = Date.now() / 1000;
    announce();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return;
    S.error = e.message || "Mất kết nối.";
  }
  if (full) rerender();
}

// A new open incident gets a toast, a beep and (if allowed) a system notification, while this tab is open.
function announce() {
  const inc = S.status && S.status.incident;
  const id = inc ? inc.id + ":" + inc.level : null;
  if (id && id !== lastIncident && lastIncident !== undefined) {
    toast(`${inc.level === "critical" ? "Nghiêm trọng" : "Cảnh báo"}: ${inc.reason}`, "err");
    playBeep();
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      new Notification("Cabin Noir: có thể có người trong xe", { body: inc.reason, tag: inc.id });
    }
  }
  lastIncident = id;
}

// A repaint replaces the buttons under the finger, so a tap that lands during one is lost. Wait until the finger is lifted.
let pressing = false, deferred = false;
addEventListener("pointerdown", () => { pressing = true; }, true);
addEventListener("pointerup", () => { pressing = false; if (deferred) { deferred = false; setTimeout(rerender, 50); } }, true);
addEventListener("pointercancel", () => { pressing = false; }, true);

export function rerender() {
  if (!view || view.live === false) return;      // pages with forms repaint only when they ask to
  if (pressing) { deferred = true; return; }
  paint();
}

function banner() {
  if (S.error) return h("div", { class: "banner red", role: "alert" }, `Mất kết nối máy chủ. Dữ liệu có thể đã cũ. ${S.error}`);
  return null;
}

function shell(content) {
  const veh = vehicle();
  return h("div", { class: "shell" },
    h("header", { class: "topbar" },
      h("div", { class: "brand" }, h("img", { src: "logo.png", alt: "" }), h("span", { class: "brand-name" }, "Cabin Noir")),
      h("div", { class: "grow" }),
      S.vehicles.length > 1 && h("select", { class: "carsel", "aria-label": "Chọn xe", on: { change: (e) => { S.vid = e.target.value; refresh(); } } },
        S.vehicles.map((v) => h("option", { value: v.vehicle.id, selected: v.vehicle.id === S.vid }, `${v.vehicle.name} · ${v.vehicle.plate}`))),
      S.vehicles.length === 1 && veh && h("span", { class: "muted small" }, `${veh.vehicle.name} · ${veh.vehicle.plate}`),
      bell()),
    banner(), content,
    h("nav", { class: "tabs", "aria-label": "Điều hướng" }, h("div", { class: "tabs-in" },
      TABS.map(([name, label, ic]) => h("a", { class: `tab ${route.name === name || (name === "home" && route.name === "incident") || (name === "history" && ["report", "check"].includes(route.name)) ? "on" : ""}`, href: `#/${name}`, "aria-current": route.name === name ? "page" : null },
        icon(ic), label)))));
}

async function paint() {
  const mod = view;
  if (!mod) return;
  const node = await mod.render({ S, go, refresh, rerender: paint, arg: route.arg, vehicle, role });
  if (mod !== view) return;
  const scrollY = window.scrollY;
  root.replaceChildren(shell(node));
  window.scrollTo(0, scrollY);
}

async function navigate() {
  let [, name = "home", arg] = (location.hash || "#/home").split("/");
  if (name === "overview") name = "history";                       // the overview now lives at the top of History
  route = { name: VIEWS[name] ? name : "home", arg: arg ? decodeURIComponent(arg) : null };
  if (view && view.destroy) view.destroy();
  view = await VIEWS[route.name]();
  window.scrollTo(0, 0);
  await paint();
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(async () => { if (auth.token) await refresh(); schedule(); }, document.hidden ? 20000 : 4000);
}

export async function signedIn() {
  S.cfg = await get("/v1/config", { anon: true }).catch(() => ({}));
  S.me = await get("/v1/me");
  S.children = await get("/v1/children").catch(() => []);
  await refresh(false);
  lastIncident = undefined; announce(); lastIncident = (S.status && S.status.incident) ? S.status.incident.id + ":" + S.status.incident.level : null;
  if (!location.hash || location.hash === "#/login") location.hash = "#/home";
  await navigate();
  schedule();
}

export function signedOut() {
  stopBell();
  auth.set(null); Object.assign(S, { me: null, vehicles: [], vid: null, status: null, trips: [], children: [] });
  clearTimeout(timer); view = null;
  import("./views/login.js").then((m) => root.replaceChildren(m.render({ onDone: signedIn })));
}

window.addEventListener("hashchange", () => { if (auth.token) navigate(); });
window.addEventListener("cn:signout", () => { toast("Phiên đăng nhập đã hết. Đăng nhập lại."); signedOut(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && auth.token) refresh(); });

if (auth.token) signedIn().catch((e) => { if (!(e instanceof ApiError && e.status === 401)) root.replaceChildren(h("div", { class: "login" }, h("div", { class: "box card" }, "Không tải được dữ liệu. ", e.message))); });
else signedOut();
