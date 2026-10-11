// Turn system notifications on or off for this browser (Web Push). Works with the tab closed on Chrome, Edge and Firefox;
// on iPhone and iPad only after "Thêm vào Màn hình chính" (iOS 16.4 or later).
import { get, post, api } from "./api.js";

export const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const installed = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

const keyBytes = (b64) => {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function registration() {
  if (!supported()) return null;
  return navigator.serviceWorker.register("sw.js", { scope: "./" });
}

/** Is this browser subscribed right now (and does the server know it)? */
export async function enabled() {
  if (!supported() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration("./");
  return !!(reg && await reg.pushManager.getSubscription());
}

export async function enable() {
  if (!supported()) throw new Error(isIOS() && !installed() ? "Trên iPhone: bấm Chia sẻ → Thêm vào Màn hình chính, mở Cabin Noir từ biểu tượng đó rồi bật lại." : "Trình duyệt này không hỗ trợ thông báo đẩy.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Bạn chưa cho phép thông báo. Mở cài đặt trang web của trình duyệt để cho phép.");
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const { public_key } = await get("/v1/webpush/key", { anon: true });
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const cur = sub.options && sub.options.applicationServerKey ? b64(sub.options.applicationServerKey) : null;
    if (cur && cur !== public_key) { await sub.unsubscribe(); sub = null; }        // server key changed: subscribe again
  }
  sub = sub || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(public_key) });
  const j = sub.toJSON();
  await post("/v1/me/webpush", { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
}

export async function disable() {
  const reg = supported() ? await navigator.serviceWorker.getRegistration("./") : null;
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    try { await api("DELETE", "/v1/me/webpush", { endpoint: sub.endpoint }); } catch { /* signed out already */ }
    await sub.unsubscribe();
  }
}

export const test = () => post("/v1/me/webpush/test", {});

/** Messages from the service worker while a page is visible: show the in-page banner instead of a system notification. */
export function listen(onPush) {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (e) => { if (e.data && e.data.type === "cn-push") onPush(e.data); });
}
