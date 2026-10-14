import { ICONS } from "./icons.js";
import { portal } from "./frame.js";

const SVG = "http://www.w3.org/2000/svg";
// Tiny DOM helpers. Text always goes through textContent, never innerHTML, so server data cannot inject markup.
// Listeners go through one dispatcher per event so morph() can hand an element that stays on screen the handlers of
// the freshly built one (whose closures hold the newest data).
function dispatch(e) { const fn = this.__on && this.__on[e.type]; if (fn) return fn.call(this, e); }
function listen(el, ev, fn) {
  if (!el.__on) el.__on = {};
  if (!el.__on[ev]) el.addEventListener(ev, dispatch);
  el.__on[ev] = fn;
}

/** Make `cur` look like `next` while keeping every element that is still there, so a repaint every few seconds does not
 *  replace the button under a finger, drop keyboard focus or make the page jump. Maps are kept as they are (map.js moves
 *  its own container); canvas, video and iframe are swapped whole because their content is drawn, not described. */
export function morph(cur, next) {
  // An element a view keeps across repaints (data-keep) is inserted as it is, never rewritten.
  if (next.nodeType === 1 && next.hasAttribute("data-keep")) { if (cur !== next) cur.replaceWith(next); return; }
  if (cur.nodeType !== next.nodeType || cur.nodeName !== next.nodeName) { cur.replaceWith(next); return; }
  if (cur.nodeType === 3 || cur.nodeType === 8) { if (cur.nodeValue !== next.nodeValue) cur.nodeValue = next.nodeValue; return; }
  if (cur.nodeType !== 1) return;
  if (cur.classList.contains("map")) return;
  if (/^(CANVAS|VIDEO|IFRAME)$/.test(cur.nodeName)) { cur.replaceWith(next); return; }
  const typing = cur === document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(cur.nodeName);
  for (const a of [...cur.attributes]) if (!next.hasAttribute(a.name) && !(typing && a.name === "value")) cur.removeAttribute(a.name);
  for (const a of next.attributes) if (cur.getAttribute(a.name) !== a.value) cur.setAttribute(a.name, a.value);
  if (/^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(cur.nodeName)) {
    for (const k of ["checked", "disabled", "selected"]) if (k in next && cur[k] !== next[k]) cur[k] = next[k];
    if (!typing && "value" in next && cur.value !== next.value) cur.value = next.value;
  }
  if (cur.nodeName === "DETAILS") next.open = cur.open;             // what the person opened stays open
  for (const ev of Object.keys(cur.__on || {})) if (!(next.__on && next.__on[ev])) cur.__on[ev] = null;
  for (const [ev, fn] of Object.entries(next.__on || {})) listen(cur, ev, fn);
  // Children are matched in order. A kept element (data-keep) is the same node in both trees, so building `next` has
  // already taken it out of `cur`: put it back in its place and do not count it, or every later child is paired with
  // the wrong one and rebuilt (the incident page lost its ticks and jumped up when the alert card reloaded).
  const a = [...cur.childNodes], b = [...next.childNodes];
  let j = 0;
  for (const n of b) {
    while (j < a.length && a[j].nodeType === 1 && a[j].hasAttribute("data-keep") && a[j] !== n) a[j++].remove();
    if (n.nodeType === 1 && n.hasAttribute("data-keep")) { if (a[j] === n) j++; else cur.insertBefore(n, a[j] || null); continue; }
    if (j < a.length) morph(a[j++], n); else cur.append(n);
  }
  for (; j < a.length; j++) a[j].remove();
}

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k.startsWith("aria-") && typeof v === "boolean") { el.setAttribute(k, String(v)); continue; }   // ARIA wants "true"/"false", not an empty attribute
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) listen(el, ev, fn);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k in el && k !== "list") { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// Static SVG icons (stroke style). These strings are constants, not data.

export function icon(name) {
  const s = document.createElementNS(SVG, "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "1.8"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
  s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "ic");
  let parts = ICONS[name];
  if (!parts) { console.warn("icon missing:", name); parts = ICONS.help; }        // a visible "?" instead of a wrong picture
  for (const [tag, attrs] of parts) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    s.append(el);
  }
  return s;
}

export const fmt = {
  clock(ts) { return ts ? new Date(ts * 1000).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "–"; },
  datetime(ts) { return ts ? new Date(ts * 1000).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–"; },
  ago(ts) {
    if (!ts) return "chưa có";
    const s = Math.max(0, Math.round(Date.now() / 1000 - ts));
    if (s < 10) return "vừa xong";
    if (s < 60) return `${s} giây trước`;
    if (s < 3600) return `${Math.round(s / 60)} phút trước`;
    if (s < 86400) return `${Math.round(s / 3600)} giờ trước`;
    return `${Math.round(s / 86400)} ngày trước`;
  },
  dur(s) {
    if (s == null) return "–";
    s = Math.round(s);
    if (s < 60) return `${s} giây`;
    if (s < 3600) { const m = Math.floor(s / 60), r = s % 60; return r ? `${m} phút ${r} giây` : `${m} phút`; }
    const hh = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return m ? `${hh} giờ ${m} phút` : `${hh} giờ`;
  },
  basis(b) { return { measured: "Đo thật", simulated: "Mô phỏng", unknown: "Chưa rõ nguồn" }[b] || b; },
  secs(n) { const m = Math.floor(n / 60); return `${m}:${String(n % 60).padStart(2, "0")}`; },
};

export function toast(message, kind = "") {
  let box = document.querySelector(".toasts");
  if (!box) { box = h("div", { class: "toasts", role: "status", "aria-live": "polite" }); portal().append(box); }
  for (const old of box.querySelectorAll(".toast")) if (old.textContent === message) old.remove();   // the same message never stacks
  while (box.children.length >= 2) box.firstElementChild.remove();                                   // at most two at a time
  const t = h("div", { class: `toast ${kind}` }, message);
  box.append(t);
  setTimeout(() => t.remove(), kind === "err" ? 6000 : 3500);
}

// Bottom sheet. Resolves with whatever `close(value)` is called with. Escape and the backdrop dismiss it.
export function sheet(build, { title } = {}) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    let done = false;
    const close = (v) => { if (done) return; done = true; scrim.remove(); document.removeEventListener("keydown", onKey); removeEventListener("hashchange", onNav); prev && prev.focus && prev.focus(); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") close(undefined); };
    const onNav = () => close(undefined);                 // a sheet belongs to the page that opened it
    addEventListener("hashchange", onNav);
    const body = h("div", { class: "gap" });
    const sh = h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": title || "Hộp thoại" },
      title && h("div", { class: "row between", style: "margin-bottom:12px" }, h("h2", {}, title),
        h("button", { class: "icon-btn", "aria-label": "Đóng", on: { click: () => close(undefined) } }, icon("x"))), body);
    const scrim = h("div", { class: "scrim", on: { click: (e) => { if (e.target === scrim) close(undefined); } } }, sh);
    portal().append(scrim);
    document.addEventListener("keydown", onKey);
    body.append(build(close));
    const first = sh.querySelector("input,button:not(.icon-btn),select"); first && first.focus();
  });
}

export const confirmDialog = ({ title, message, ok = "Đồng ý", danger = false, cancel = "Quay lại" }) =>
  sheet((close) => h("div", { class: "gap" },
    h("p", { style: "margin:0" }, message),
    h("div", { class: "row wrap" },
      h("button", { class: "btn grow", on: { click: () => close(false) } }, cancel),
      h("button", { class: `btn grow ${danger ? "danger" : "primary"}`, on: { click: () => close(true) } }, ok))), { title }).then((v) => v === true);

export function field(label, input, hint) {
  const id = "f" + Math.random().toString(36).slice(2, 8);
  input.id = id;
  return h("div", { class: "field" }, h("label", { for: id }, label), input, hint && h("div", { class: "small muted" }, hint));
}

export function switchRow(label, sub, checked, onChange) {
  const input = h("input", { type: "checkbox", checked, role: "switch", on: { change: (e) => onChange(e.target.checked, e.target) } });
  return h("label", { class: "switch" }, h("div", {}, h("div", {}, label), sub && h("div", { class: "small muted" }, sub)), input);
}

export async function busy(btn, fn) {
  btn.disabled = true;
  try { return await fn(); } finally { btn.disabled = false; }
}

export function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.08;
    o.start(); setTimeout(() => { o.stop(); ctx.close(); }, 350);
  } catch { /* audio blocked */ }
}

/** The vehicle's photo, or a neutral drawing for models we have no photo of (never another model's photo). */
export function carPic(v, cls = "carpic") {
  const img = v && v.image;
  const file = img === "vf6" ? "car-vf6" : img === "vf8" ? (v.color === "red" ? "car-vf8-red" : v.color === "black" ? "car-vf8-black" : "car-vf8") : null;
  const label = v ? `${v.model || "Xe"}${v.color ? ` màu ${({ white: "trắng", black: "đen", red: "đỏ" })[v.color] || v.color}` : ""}` : "Xe";
  if (file) return h("img", { class: cls, src: `img/${file}.png`, alt: label, loading: "lazy", decoding: "async" });
  return h("div", { class: `${cls} generic`, role: "img", "aria-label": label }, icon("car-side"));
}

/** iPhone-style notification banner at the top of the screen (inside the phone frame on a computer). Tap opens `url`. */
export function banner({ title, body = "", url = null, urgent = false }) {
  const root = portal();
  let box = root.querySelector(":scope > .banners");
  if (!box) { box = h("div", { class: "banners", role: "alert", "aria-live": "assertive" }); root.append(box); }
  for (const old of box.querySelectorAll(".banner-n")) if (old.dataset.title === title) old.remove();
  const close = () => { b.classList.add("out"); setTimeout(() => b.remove(), 250); };
  const b = h("div", { class: `banner-n ${urgent ? "urgent" : ""}`, tabindex: "0", on: {
      click: () => { if (url) location.hash = new URL(url, location.href).hash || "#/home"; close(); },
      keydown: (e) => { if (e.key === "Enter") e.currentTarget.click(); if (e.key === "Escape") close(); } } },
    h("img", { src: "icon-192.png", alt: "" }),
    h("div", { class: "grow" },
      h("div", { class: "banner-top" }, h("span", {}, "CABIN NOIR"), h("span", {}, "bây giờ")),
      h("div", { class: "banner-t" }, title), body && h("div", { class: "banner-b" }, body)),
    h("button", { class: "banner-x", "aria-label": "Đóng thông báo", on: { click: (e) => { e.stopPropagation(); close(); } } }, icon("x")));
  b.dataset.title = title;
  box.prepend(b);
  while (box.children.length > 3) box.lastElementChild.remove();
  setTimeout(close, urgent ? 15000 : 8000);
}
