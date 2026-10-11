import { get, post, put, del } from "../api.js";
import { h, icon, fmt, toast, sheet, confirmDialog, field, busy } from "../ui.js";
import { leaflet, baseMap, loadMap } from "./map.js";

const STAGE = { waiting: ["Chờ đón", "grey"], boarded: ["Đã lên xe", "green"], enroute: ["Đang trên đường", "green"], arrived: ["Đã tới nơi", "green"], leftin: ["Còn trên xe", "red"], late: ["Trễ giờ", "orange"] };
const DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const SEATS = { left: "Ghế sau trái", mid: "Ghế sau giữa", right: "Ghế sau phải" };

export async function render(ctx) {
  const { S, refresh } = ctx;
  const s = S.status;
  if (!S.vehicles.length) return h("div", { class: "card center muted" }, "Thêm xe trước khi dùng Đưa đón.");
  const owner = S.status && S.status.role === "owner";
  const out = [h("div", { class: "row between" }, h("h1", {}, "Đưa đón"), owner && h("button", { class: "btn small", on: { click: () => childForm(null, refresh, S) } }, icon("plus"), "Thêm bé"))];
  out.push(h("p", { class: "small muted", style: "margin:0" }, "Chuyến đi theo dữ liệu từ thiết bị trong xe. Trạng thái chỉ là thông tin, cảnh báo xe vẫn do hệ thống cabin xử lý."));
  if (!S.trips.length) out.push(h("div", { class: "card center gap" }, h("p", { class: "muted", style: "margin:0" }, "Chưa có bé nào được thêm."), owner && h("button", { class: "btn primary", on: { click: () => childForm(null, refresh, S) } }, "Thêm bé")));
  for (const t of S.trips) out.push(tripCard(t, ctx, owner));

  if (s && s.vehicle) {
    const dest = (s.route && s.route.dest) || s.geofence;
    out.push(h("section", { class: "card gap" }, h("div", { class: "row between" }, h("h2", {}, "Điểm đến và theo dõi xe"),
      owner && h("button", { class: "btn small", on: { click: () => destinationSheet(s, refresh) } }, icon("pin"), dest ? "Đổi điểm đến" : "Đặt điểm đến")),
      dest ? h("p", { style: "margin:0" }, `${dest.name}${s.geofence ? ` · vùng ${s.geofence.radius_m} m` : ""}${s.in_geofence ? " · xe đang trong vùng" : ""}`) : h("p", { class: "muted", style: "margin:0" }, "Chưa đặt điểm đến. Đặt điểm đến để theo dõi xe trên bản đồ và nhận báo khi xe tới nơi."),
      s.coords ? h("div", { class: "map", id: "school-map", role: "img", "aria-label": "Bản đồ theo dõi xe" }) : h("p", { class: "muted small", style: "margin:0" }, "Chưa có vị trí xe. Thiết bị trong xe cần bật định vị."),
      h("p", { class: "small muted", style: "margin:0" }, "Bản đồ © OpenStreetMap. Hành trình lưu 7 ngày rồi tự xóa.")));
    if (s.coords) get(`/v1/vehicles/${s.vehicle.id}/track?hours=6`).then((r) => loadMap("school-map", s, { track: r.points })).catch(() => loadMap("school-map", s));
  }
  return h("div", { class: "gap" }, out);
}

function tripCard(t, ctx, owner) {
  const [label, tone] = STAGE[t.stage] || [t.stage, "grey"];
  const { refresh, S } = ctx;
  const vid = t.vehicle_id;
  const call = (fn, msg) => (e) => busy(e.target, async () => { try { await fn(); toast(msg, "ok"); await refresh(); } catch (er) { toast(er.message, "err"); } });
  return h("section", { class: "card gap" },
    h("div", { class: "row between top" }, h("div", { class: "grow" }, h("h2", {}, t.child.name), h("div", { class: "small muted" }, [t.child.cls, t.seat_label, `đón ${t.pickup}, về ${t.dropoff}`].filter(Boolean).join(" · "))), h("span", { class: `pill nowrap ${tone}` }, label)),
    t.stage === "leftin" && h("div", { class: "banner red", role: "alert" }, "Xe đã đỗ nhưng camera vẫn thấy người. Quay lại xe ngay. Thấy người trong xe: gọi 112."),
    t.progress_known && h("div", {}, h("div", { class: "row between small muted" }, h("span", {}, t.school || (t.destination && t.destination.name) || "Điểm đến"), h("span", {}, `${t.progress}%`)),
      h("div", { class: "progress", role: "progressbar", "aria-valuenow": t.progress, "aria-valuemin": 0, "aria-valuemax": 100 }, h("i", { style: `width:${t.progress}%` }))),
    (t.log || []).length > 0 && h("div", { class: "timeline" }, t.log.slice(-4).reverse().map((l) => h("div", {}, h("span", { class: "muted small" }, l.time), h("div", {}, h("div", {}, l.title), h("div", { class: "small muted" }, l.detail))))),
    h("div", { class: "row wrap" },
      ["waiting", "late"].includes(t.stage) && h("button", { class: "btn grow", on: { click: call(() => post(`/v1/trips/${t.child.id}/pickup`, { vehicle_id: vid }), "Đã ghi nhận bé lên xe.") } }, `Ghi nhận ${t.child.name} đã lên xe`),
      ["boarded", "enroute", "leftin"].includes(t.stage) && h("button", { class: "btn primary grow", on: { click: () => dropoff(t, refresh) } }, `Ghi nhận ${t.child.name} đã tới nơi`),
      owner && h("button", { class: "btn ghost small", on: { click: () => childForm(t.child, refresh, S) } }, "Sửa")));
}

async function dropoff(t, refresh) {
  await sheet((close) => {
    let checked = false;
    return h("div", { class: "gap" }, h("p", { class: "muted", style: "margin:0" }, "Chỉ ghi nhận đã tới nơi sau khi bé xuống xe và bạn đã nhìn lại ghế."),
      h("label", { class: "check" }, h("input", { type: "checkbox", on: { change: (e) => { checked = e.target.checked; e.target.closest(".gap").querySelector("button.primary").disabled = !checked; } } }), "Tôi đã nhìn lại ghế và sàn xe, không còn bé trên xe"),
      h("button", { class: "btn primary block", disabled: true, on: { click: (e) => busy(e.target, async () => { try { await post(`/v1/trips/${t.child.id}/dropoff`, { vehicle_id: t.vehicle_id, cabin_checked: checked }); close(true); toast("Đã ghi nhận.", "ok"); await refresh(); } catch (er) { toast(er.message, "err"); } }) } }, "Xác nhận"));
  }, { title: `${t.child.name} đã tới nơi` });
}

function childForm(child, refresh, S) {
  return sheet((close) => {
    const name = h("input", { type: "text", value: child ? child.name : "", maxLength: 30 });
    const cls = h("input", { type: "text", value: child ? child.cls : "", maxLength: 60, placeholder: "Ví dụ: Lớp 2A" });
    const seat = h("select", {}, Object.entries(SEATS).map(([k, v]) => h("option", { value: k, selected: child ? child.seat === k : k === "left" }, v)));
    const pick = h("input", { type: "text", value: child ? child.pickup : "06:45", pattern: "\\d{2}:\\d{2}", maxLength: 5 });
    const drop = h("input", { type: "text", value: child ? child.dropoff : "16:30", pattern: "\\d{2}:\\d{2}", maxLength: 5 });
    const days = new Set(child ? child.days : [0, 1, 2, 3, 4]);
    const dayRow = h("div", { class: "row wrap" }, DAYS.map((d, i) => { const b = h("button", { type: "button", class: `btn small ${days.has(i) ? "primary" : ""}`, "aria-pressed": days.has(i), on: { click: () => { days.has(i) ? days.delete(i) : days.add(i); b.classList.toggle("primary"); b.setAttribute("aria-pressed", days.has(i)); } } }, d); return b; }));
    const save = async (e) => busy(e.target, async () => {
      const body = { name: name.value.trim(), cls: cls.value.trim(), seat: seat.value, pickup: pick.value, dropoff: drop.value, days: [...days].sort() };
      try { child ? await put(`/v1/children/${child.id}`, body) : await post("/v1/children", body); close(true); toast("Đã lưu.", "ok"); await refresh(); } catch (er) { toast(er.message, "err"); }
    });
    return h("div", { class: "gap" }, field("Tên bé", name), field("Lớp", cls), field("Ngồi ở", seat),
      h("div", { class: "row" }, h("div", { class: "grow" }, field("Giờ đón", pick)), h("div", { class: "grow" }, field("Giờ về", drop))),
      h("div", { class: "field" }, h("label", {}, "Các ngày đi học"), dayRow),
      h("button", { class: "btn primary block", on: { click: save } }, "Lưu"),
      child && h("button", { class: "btn danger block", on: { click: async () => { if (await confirmDialog({ title: `Xóa ${child.name}?`, message: "Lịch sử đưa đón của bé cũng bị xóa.", ok: "Xóa", danger: true })) { try { await del(`/v1/children/${child.id}`); close(true); await refresh(); } catch (er) { toast(er.message, "err"); } } } } }, "Xóa bé"));
  }, { title: child ? "Sửa thông tin bé" : "Thêm bé" });
}

// Pick a destination by searching (OpenStreetMap Nominatim) or clicking the map, then choose the arrival radius.
function destinationSheet(s, refresh) {
  return sheet((close) => {
    let pick = s.geofence ? { name: s.geofence.name, lat: s.geofence.lat, lon: s.geofence.lon } : null;
    let radius = s.geofence ? s.geofence.radius_m : 150;
    const results = h("div", { class: "card pad0 list", hidden: true });
    const q = h("input", { type: "search", placeholder: "Tìm trường, địa chỉ…", maxLength: 80 });
    const label = h("p", { style: "margin:0" }, pick ? pick.name : "Chưa chọn điểm đến");
    const mapEl = h("div", { class: "map", style: "height:260px" });
    const slider = h("input", { type: "range", min: 30, max: 1000, step: 10, value: radius, "aria-label": "Bán kính vùng tới nơi" });
    const rl = h("span", {}, `${radius} m`);
    let map, marker, circle, L, timer;
    const setPick = (p) => { pick = p; label.textContent = p.name; if (!map) return; marker ? marker.setLatLng([p.lat, p.lon]) : (marker = L.marker([p.lat, p.lon]).addTo(map)); circle ? circle.setLatLng([p.lat, p.lon]).setRadius(radius) : (circle = L.circle([p.lat, p.lon], { radius, color: "#64a8ff", fillOpacity: 0.15 }).addTo(map)); map.setView([p.lat, p.lon], 16); };
    slider.addEventListener("input", () => { radius = +slider.value; rl.textContent = `${radius} m`; circle && circle.setRadius(radius); });
    q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(async () => {
      if (q.value.trim().length < 3) { results.hidden = true; return; }
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=vn&accept-language=vi&q=${encodeURIComponent(q.value.trim())}`);
        const list = await r.json();
        results.replaceChildren(...list.map((x) => h("button", { class: "item", on: { click: () => { setPick({ name: x.display_name.split(",").slice(0, 2).join(",").trim(), lat: +x.lat, lon: +x.lon }); results.hidden = true; } } }, icon("pin"), h("div", { class: "grow" }, x.display_name))));
        results.hidden = !list.length;
      } catch { toast("Không tìm được địa điểm. Bấm lên bản đồ để chọn.", "err"); }
    }, 500); });
    leaflet().then((Lx) => { L = Lx; map = baseMap(L, mapEl, pick ? [pick.lat, pick.lon] : (s.coords ? [s.coords.lat, s.coords.lon] : [10.7769, 106.7009]), 14);
      map.on("click", (e) => setPick({ name: `Điểm đã chọn (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`, lat: e.latlng.lat, lon: e.latlng.lng })); if (pick) setPick(pick); }).catch(() => toast("Không tải được bản đồ.", "err"));
    return h("div", { class: "gap" }, h("p", { class: "small muted", style: "margin:0" }, "Từ khóa tìm kiếm được gửi tới OpenStreetMap (Nominatim) để tìm địa điểm."), q, results, label, mapEl,
      h("div", { class: "row between" }, h("span", {}, "Bán kính vùng tới nơi"), rl), slider,
      h("button", { class: "btn primary block", on: { click: (e) => busy(e.target, async () => { if (!pick) { toast("Chọn điểm đến trước.", "err"); return; } try { await put(`/v1/vehicles/${s.vehicle.id}/geofence`, { name: pick.name.slice(0, 40), lat: pick.lat, lon: pick.lon, radius_m: radius }); close(true); toast("Đã đặt điểm đến.", "ok"); await refresh(); } catch (er) { toast(er.message, "err"); } }) } }, "Lưu điểm đến"),
      s.geofence && h("button", { class: "btn ghost block", on: { click: async () => { try { await del(`/v1/vehicles/${s.vehicle.id}/geofence`); close(true); await refresh(); } catch (er) { toast(er.message, "err"); } } } }, "Xóa điểm đến"));
  }, { title: "Điểm đến" });
}
