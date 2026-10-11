// Desktop preview: on a computer the mobile web is shown inside a phone frame, so it looks like the app on a phone.
// Phones, tablets and narrow windows get the plain full-screen app. ?frame=0 / ?frame=1 switches it and is remembered.
import { ICONS } from "./icons.js";

// Own tiny icon helper (ui.js imports this file, so importing ui.js here would be circular).
function icon(name) {
  const NS = "http://www.w3.org/2000/svg", s = document.createElementNS(NS, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", class: "ic" })) s.setAttribute(k, v);
  for (const [tag, attrs] of ICONS[name] || []) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); s.append(e); }
  return s;
}

const KEY = "cn.frame";
const W = 393, H = 852, BEZEL = 12;                       // iPhone 15 Pro screen in points, plus the frame

let screenEl = null;

/** Where floating UI (toasts, sheets) is attached: inside the phone screen when framed, otherwise the page. */
export const portal = () => screenEl || document.body;

/** The element that scrolls: the phone screen when framed, otherwise the window. */
export function scrollTop() { return screenEl ? document.getElementById("app").scrollTop : window.scrollY; }
export function scrollToY(y) { if (screenEl) document.getElementById("app").scrollTop = y; else window.scrollTo(0, y); }

const roomy = () => innerWidth >= 460 && innerHeight >= 560 && !matchMedia("(pointer: coarse)").matches;

function wanted() {
  const q = new URLSearchParams(location.search).get("frame");
  let pref = "1";
  try {
    if (q === "0" || q === "1") localStorage.setItem(KEY, q);
    pref = localStorage.getItem(KEY) ?? "1";
  } catch { /* storage blocked: keep the default */ }
  if (q === "1") return true;                              // asked for explicitly: show the frame even in a small window
  return pref === "1" && roomy();
}

function el(tag, cls, ...kids) { const e = document.createElement(tag); if (cls) e.className = cls; e.append(...kids); return e; }

function clock(span) {
  const tick = () => { const d = new Date(); span.textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
  tick(); setInterval(tick, 15000);
}

// Always fit the window: browser zoom (Ctrl/Cmd + or -) and window resizes change the CSS viewport, so the phone is scaled
// to fill the available height (or width, whichever is tighter), shrinking and growing alike.
function fit(device) {
  const vv = window.visualViewport;
  const w = vv ? vv.width : innerWidth, h = vv ? vv.height : innerHeight;
  const room = Math.min(48, h * 0.05);
  const s = Math.min((h - 2 * room) / (H + 2 * BEZEL), (w - 2 * room) / (W + 2 * BEZEL));
  device.style.setProperty("--s", String(Math.max(0.25, Math.min(2.5, s))));
}

function setPref(v) { try { localStorage.setItem(KEY, v); } catch { /* ignore */ } location.reload(); }

function build() {
  const app = document.getElementById("app");
  const time = el("span", "sb-time");
  const bar = el("div", "sb", time, el("span", "sb-icons", icon("signal"), icon("wifi"), icon("battery-full")));
  bar.setAttribute("aria-hidden", "true");
  screenEl = el("div", "device-screen");
  const island = el("div", "island"); island.setAttribute("aria-hidden", "true");
  const home = el("div", "home-ind"); home.setAttribute("aria-hidden", "true");
  app.before(el("div", "stage"));
  const stage = document.querySelector(".stage");
  const device = el("div", "device", ...["act", "up", "down", "power"].map((c) => el("i", `side ${c}`)));
  screenEl.append(bar, island, app, home);
  device.append(screenEl);
  const off = el("button", "frame-toggle", icon("maximize"), "Xem toàn màn hình");
  off.type = "button"; off.addEventListener("click", () => setPref("0"));
  stage.append(device, off);
  document.documentElement.classList.add("framed");
  clock(time);
  fit(device);
  let raf = 0;
  const refit = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => fit(device)); };
  addEventListener("resize", refit);
  if (window.visualViewport) visualViewport.addEventListener("resize", refit);
}

function offerFrame() {
  // A wide window that opted out still gets a way back to the phone view.
  if (!roomy()) return;
  const on = el("button", "frame-toggle floating", icon("phone-frame"), "Xem trong khung điện thoại");
  on.type = "button"; on.addEventListener("click", () => setPref("1"));
  document.body.append(on);
}

if (wanted()) build(); else offerFrame();
