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

export async function loadMap(id, s, extra = {}) {
  try {
    const L = await leaflet();
    const el = document.getElementById(id);
    if (!el || !s.coords) return null;
    const car = [s.coords.lat, s.coords.lon];
    const map = baseMap(L, el, car);
    L.circleMarker(car, { radius: 9, color: "#f5c518", fillColor: "#f5c518", fillOpacity: 0.9 }).addTo(map).bindTooltip("Xe");
    const dest = (s.route && s.route.dest) || s.geofence;
    if (dest) {
      L.marker([dest.lat, dest.lon]).addTo(map).bindTooltip(dest.name);
      if (s.geofence) L.circle([s.geofence.lat, s.geofence.lon], { radius: s.geofence.radius_m, color: "#64a8ff", fillOpacity: 0.12 }).addTo(map);
      map.fitBounds([car, [dest.lat, dest.lon]], { padding: [30, 30], maxZoom: 16 });
    }
    if (extra.track && extra.track.length > 1) L.polyline(extra.track.map((p) => [p.lat, p.lon]), { color: "#f5c518", weight: 4, opacity: 0.8 }).addTo(map);
    return map;
  } catch { const el = document.getElementById(id); if (el) el.textContent = "Không tải được bản đồ."; return null; }
}
