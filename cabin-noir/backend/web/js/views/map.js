// Leaflet loaded on demand from cdnjs. Tiles are OpenStreetMap (attribution shown). Only coordinates of this vehicle are drawn.
let ready = null;
export function leaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!ready) ready = new Promise((resolve, reject) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.append(css);
    const js = document.createElement("script"); js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    js.onload = () => resolve(window.L); js.onerror = () => reject(new Error("Không tải được bản đồ.")); document.head.append(js);
  });
  return ready;
}

export function baseMap(L, el, center, zoom = 15) {
  const map = L.map(el, { zoomControl: true, attributionControl: true }).setView(center, zoom);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
  return map;
}

// The page repaints every few seconds and builds a new empty <div> each time. Keep the Leaflet map (and the view the person chose
// with zoom or drag) alive and move its container into the new slot; only the markers are refreshed.
const kept = {};

export async function loadMap(id, s, extra = {}) {
  try {
    const L = await leaflet();
    const slot = document.getElementById(id);
    if (!slot || !s.coords) return null;
    const car = [s.coords.lat, s.coords.lon];
    const dest = (s.route && s.route.dest) || s.geofence;
    const sig = `${s.vehicle ? s.vehicle.id : ""}|${dest ? `${dest.lat},${dest.lon}` : ""}|${s.geofence ? s.geofence.radius_m : ""}`;
    let k = kept[id];
    if (k && k.sig === sig) {
      if (k.el !== slot) { const c = k.map.getCenter(), z = k.map.getZoom(); slot.replaceWith(k.el); k.map.invalidateSize(false); k.map.setView(c, z, { animate: false }); }
    } else {
      if (k) k.map.remove();
      k = kept[id] = { el: slot, map: baseMap(L, slot, car), sig, layers: null, fresh: true };
    }
    const { map } = k;
    if (k.layers) k.layers.remove();
    k.layers = L.layerGroup().addTo(map);
    L.circleMarker(car, { radius: 9, color: "#f5c518", fillColor: "#f5c518", fillOpacity: 0.9 }).addTo(k.layers).bindTooltip("Xe");
    if (dest) {
      L.marker([dest.lat, dest.lon]).addTo(k.layers).bindTooltip(dest.name);
      if (s.geofence) L.circle([s.geofence.lat, s.geofence.lon], { radius: s.geofence.radius_m, color: "#64a8ff", fillOpacity: 0.12 }).addTo(k.layers);
      if (k.fresh) map.fitBounds([car, [dest.lat, dest.lon]], { padding: [30, 30], maxZoom: 16 });
    }
    if (extra.track && extra.track.length > 1) L.polyline(extra.track.map((p) => [p.lat, p.lon]), { color: "#f5c518", weight: 4, opacity: 0.8 }).addTo(k.layers);
    k.fresh = false;
    return map;
  } catch { const el = document.getElementById(id); if (el) el.textContent = "Không tải được bản đồ."; return null; }
}
