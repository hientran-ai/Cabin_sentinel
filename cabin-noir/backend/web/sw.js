// Service worker: shows Cabin Noir alerts as system notifications, also when no Cabin Noir tab is open.
// The payload arrives encrypted for this browser; it only holds a title, one line and the page to open.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: "Cabin Noir", body: event.data ? event.data.text() : "" }; }
  const title = d.title || "Cabin Noir";
  const url = new URL(d.url || "./#/home", self.registration.scope).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const visible = tabs.filter((c) => c.visibilityState === "visible");
    // An open, visible Cabin Noir page shows its own banner; the system notification is for everything else.
    for (const c of visible) c.postMessage({ type: "cn-push", title, body: d.body || "", url, urgent: !!d.urgent });
    if (visible.some((c) => c.focused)) return;
    await self.registration.showNotification(title, {
      body: d.body || "", tag: d.tag || "cabin-noir", renotify: true, requireInteraction: !!d.urgent,
      icon: "icon-192.png", badge: "icon-192.png", data: { url }, vibrate: d.urgent ? [300, 120, 300, 120, 600] : [200],
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of tabs) {
      if (c.url.startsWith(self.registration.scope)) { await c.focus(); if ("navigate" in c) await c.navigate(url); return; }
    }
    await self.clients.openWindow(url);
  })());
});
