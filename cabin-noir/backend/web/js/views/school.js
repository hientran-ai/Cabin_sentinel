import { get, post, put, del } from "../api.js";
import { h, icon, fmt, toast, sheet, confirmDialog, field, busy } from "../ui.js";
import { leaflet, baseMap, loadMap } from "./map.js";

const STAGE = { waiting: ["Chờ đón", "grey"], boarded: ["Đã lên xe", "green"], enroute: ["Đang trên đường", "green"], arrived: ["Đã tới nơi", "green"], leftin: ["Còn trên xe", "red"], late: ["Trễ giờ", "orange"] };
const DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export async function render(ctx) {
  const { S, refresh } = ctx;
  const s = S.status;
  if (!S.vehicles.length) return h("div", { class: "card center muted" }, "Thêm xe trước khi dùng Đưa đón.");
  const owner = S.status && S.status.role === "owner";
  const out = [h("div", { class: "row between" }, h("h1", {}, "Đưa đón"), owner && h("button", { class: "btn small", on: { click: () => childForm(null, refresh, S) } }, icon("plus"), "Thêm bé"))];
  out.push(h("p", { class: "small muted", style: "margin:0" }, "Chuyến đi theo dữ liệu từ thiết bị trong xe. Trạng thái chỉ là thông tin, cảnh báo xe vẫn do hệ thống cabin xử lý."));
  if (!S.trips.length) out.push(h("div", { class: "card center gap" }, h("p", { class: "muted", style: "margin:0" }, "Chưa có bé nào được thêm."), owner && h("button", { class: "btn primary", on: { click: () => childForm(null, refresh, S) } }, "Thêm bé")));
  for (const t of S.trips) out.push(tripCard(t, ctx, owner));
  const places = await get("/v1/places").catch(() => []);
  out.push(placesCard(places, S.status, ctx));

  if (s && s.vehicle) {
    const dest = (s.route && s.route.dest) || s.geofence;
    out.push(h("section", { class: "card gap" }, h("div", { class: "row between" }, h("h2", {}, "Điểm đến và theo dõi xe"),
      owner && h("button", { class: "btn small", on: { click: () => destinationSheet(s, refresh, { places }) } }, icon("pin"), dest ? "Đổi điểm đến" : "Đặt điểm đến")),
      dest ? h("p", { style: "margin:0" }, `${dest.name}${s.geofence ? ` · vùng ${s.geofence.radius_m} m` : ""}${s.in_geofence ? " · xe đang trong vùng" : ""}`) : h("p", { class: "muted", style: "margin:0" }, "Chưa đặt điểm đến. Đặt điểm đến để theo dõi xe trên bản đồ và nhận báo khi xe tới nơi."),
      s.coords ? h("div", { class: "map", id: "school-map", role: "img", "aria-label": "Bản đồ theo dõi xe" }) : h("p", { class: "muted small", style: "margin:0" }, "Chưa có vị trí xe. Thiết bị trong xe cần bật định vị."),
      h("p", { class: "small muted", style: "margin:0" }, "Bản đồ © OpenStreetMap. Hành trình lưu 7 ngày rồi tự xóa.")));
    if (s.coords) get(`/v1/vehicles/${s.vehicle.id}/track?hours=6`).then((r) => loadMap("school-map", s, { track: r.points })).catch(() => loadMap("school-map", s));
  }
  return h("div", { class: "gap" }, out);
}

// Places the family uses every day ("Nhà", "Trường học"), saved to the account so a school run is one tap away.
function placesCard(places, s, ctx) {
  const { refresh } = ctx;
  const canSetDest = s && s.vehicle && s.role === "owner";
  const row = (p) => h("div", { class: "item", style: "align-items:flex-start" }, icon("pin"),
    h("div", { class: "grow" }, h("div", { style: "font-weight:600" }, p.name), p.address && h("div", { class: "sub" }, p.address), h("div", { class: "sub" }, `Vùng tới nơi ${p.radius_m} m`),
      h("div", { class: "row wrap", style: "margin-top:8px" },
        canSetDest && h("button", { class: "btn small", on: { click: (e) => busy(e.target, async () => { try { await put(`/v1/vehicles/${s.vehicle.id}/geofence`, { name: p.name, lat: p.lat, lon: p.lon, radius_m: p.radius_m }); toast(`Đã đặt ${p.name} làm điểm đến.`, "ok"); await refresh(); } catch (er) { toast(er.message, "err"); } }) } }, "Đặt làm điểm đến"),
        h("button", { class: "btn small ghost", on: { click: () => destinationSheet(s, refresh, { mode: "place", place: p }) } }, icon("edit"), "Sửa"),
        h("button", { class: "btn small ghost", "aria-label": `Xóa ${p.name}`, on: { click: async () => { if (await confirmDialog({ title: `Xóa ${p.name}?`, message: "Chỉ xóa điểm đã lưu. Điểm đến đang dùng cho xe không đổi.", ok: "Xóa", danger: true })) { try { await del(`/v1/places/${p.id}`); toast("Đã xóa.", "ok"); await refresh(); } catch (er) { toast(er.message, "err"); } } } } }, icon("trash"), "Xóa"))));
  return h("section", { class: "card gap" }, h("div", { class: "row between" }, h("h2", {}, "Điểm đón cố định"),
    h("button", { class: "btn small", on: { click: () => destinationSheet(s, refresh, { mode: "place", place: null }) } }, icon("plus"), "Thêm điểm đón cố định")),
    places.length ? h("div", { class: "card pad0 list" }, places.map(row)) : h("p", { class: "muted", style: "margin:0" }, "Chưa lưu điểm nào. Thêm Nhà, Trường học… để chọn nhanh khi đặt điểm đến."));
}

function tripCard(t, ctx, owner) {
  const [label, tone] = STAGE[t.stage] || [t.stage, "grey"];
  const { refresh, S } = ctx;
  const vid = t.vehicle_id;
  const call = (fn, msg) => (e) => busy(e.target, async () => { try { await fn(); toast(msg, "ok"); await refresh(); } catch (er) { toast(er.message, "err"); } });
  return h("section", { class: "card gap" },
    h("div", { class: "row between top" }, h("div", { class: "grow" }, h("h2", {}, t.child.name), h("div", { class: "small muted" }, [t.child.cls, `đón ${t.pickup}, về ${t.dropoff}`].filter(Boolean).join(" · "))), h("span", { class: `pill nowrap ${tone}` }, label)),
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
    const pick = h("input", { type: "text", value: child ? child.pickup : "06:45", pattern: "\\d{2}:\\d{2}", maxLength: 5 });
    const drop = h("input", { type: "text", value: child ? child.dropoff : "16:30", pattern: "\\d{2}:\\d{2}", maxLength: 5 });
    const days = new Set(child ? child.days : [0, 1, 2, 3, 4]);
    const dayRow = h("div", { class: "row wrap" }, DAYS.map((d, i) => { const b = h("button", { type: "button", class: `btn small ${days.has(i) ? "primary" : ""}`, "aria-pressed": days.has(i), on: { click: () => { days.has(i) ? days.delete(i) : days.add(i); b.classList.toggle("primary"); b.setAttribute("aria-pressed", days.has(i)); } } }, d); return b; }));
    const save = async (e) => busy(e.target, async () => {
      const body = { name: name.value.trim(), cls: cls.value.trim(), pickup: pick.value, dropoff: drop.value, days: [...days].sort() };
      try { child ? await put(`/v1/children/${child.id}`, body) : await post("/v1/children", body); close(true); toast("Đã lưu.", "ok"); await refresh(); } catch (er) { toast(er.message, "err"); }
    });
    return h("div", { class: "gap" }, field("Tên bé", name), field("Lớp", cls),
      h("div", { class: "row" }, h("div", { class: "grow" }, field("Giờ đón", pick)), h("div", { class: "grow" }, field("Giờ về", drop))),
      h("div", { class: "field" }, h("label", {}, "Các ngày đi học"), dayRow),
      h("button", { class: "btn primary block", on: { click: save } }, "Lưu"),
      child && h("button", { class: "btn danger block", on: { click: async () => { if (await confirmDialog({ title: `Xóa ${child.name}?`, message: "Lịch sử đưa đón của bé cũng bị xóa.", ok: "Xóa", danger: true })) { try { await del(`/v1/children/${child.id}`); close(true); await refresh(); } catch (er) { toast(er.message, "err"); } } } } }, "Xóa bé"));
  }, { title: child ? "Sửa thông tin bé" : "Thêm bé" });
}

// Pick a destination by searching (OpenStreetMap Nominatim) or clicking the map, then choose the arrival radius.
function destinationSheet(s, refresh, opts = {}) {
  const isPlace = opts.mode === "place", place = opts.place || null, places = opts.places || [];
  return sheet((close) => {
    const base = isPlace ? place : s && s.geofence;
    let pick = base ? { name: base.name, lat: base.lat, lon: base.lon } : null;
    let radius = base ? base.radius_m : 150;
    const nameIn = h("input", { type: "text", maxLength: 40, value: place ? place.name : "", placeholder: "Tên gợi nhớ: Nhà, Trường học…", "aria-label": "Tên gợi nhớ" });
    const addrIn = h("input", { type: "text", maxLength: 160, value: place ? place.address : "", placeholder: "Địa chỉ (tự điền khi chọn từ kết quả tìm)", "aria-label": "Địa chỉ" });
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
        results.replaceChildren(...list.map((x) => h("button", { class: "item", on: { click: () => { setPick({ name: x.display_name.split(",").slice(0, 2).join(",").trim(), lat: +x.lat, lon: +x.lon }); addrIn.value = x.display_name.slice(0, 160); if (isPlace && !nameIn.value.trim()) nameIn.value = pick.name.slice(0, 40); results.hidden = true; } } }, icon("pin"), h("div", { class: "grow" }, x.display_name))));
        results.hidden = !list.length;
      } catch { toast("Không tìm được địa điểm. Bấm lên bản đồ để chọn.", "err"); }
    }, 500); });
    leaflet().then((Lx) => { L = Lx; map = baseMap(L, mapEl, pick ? [pick.lat, pick.lon] : (s && s.coords ? [s.coords.lat, s.coords.lon] : [10.7769, 106.7009]), 14);
      map.on("click", (e) => setPick({ name: `Điểm đã chọn (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`, lat: e.latlng.lat, lon: e.latlng.lng })); if (pick) setPick(pick); }).catch(() => toast("Không tải được bản đồ.", "err"));
    return h("div", { class: "gap" }, h("p", { class: "small muted", style: "margin:0" }, "Từ khóa tìm kiếm được gửi tới OpenStreetMap (Nominatim) để tìm địa điểm."),
      isPlace && field("Tên gợi nhớ", nameIn), places.length > 0 && h("div", {}, h("div", { class: "small muted", style: "margin-bottom:6px" }, "Chọn nhanh từ điểm đã lưu"),
        h("div", { class: "row wrap" }, places.map((p) => h("button", { class: "btn small", on: { click: () => { setPick({ name: p.name, lat: p.lat, lon: p.lon }); radius = p.radius_m; slider.value = radius; rl.textContent = `${radius} m`; circle && circle.setRadius(radius); } } }, p.name)))),
      q, results, isPlace && field("Địa chỉ", addrIn), label, mapEl,
      h("div", { class: "row between" }, h("span", {}, "Bán kính vùng tới nơi"), rl), slider,
      h("button", { class: "btn primary block", on: { click: (e) => busy(e.target, async () => {
        if (!pick) { toast(isPlace ? "Chọn vị trí trước." : "Chọn điểm đến trước.", "err"); return; }
        try {
          if (isPlace) {
            const name = nameIn.value.trim();
            if (!name) { toast("Nhập tên gợi nhớ, ví dụ Nhà hoặc Trường học.", "err"); nameIn.focus(); return; }
            const body = { name, address: addrIn.value.trim(), lat: pick.lat, lon: pick.lon, radius_m: radius };
            place ? await put(`/v1/places/${place.id}`, body) : await post("/v1/places", body);
            close(true); toast("Đã lưu điểm đón.", "ok"); await refresh(); return;
          }
          await put(`/v1/vehicles/${s.vehicle.id}/geofence`, { name: pick.name.slice(0, 40), lat: pick.lat, lon: pick.lon, radius_m: radius }); close(true); toast("Đã đặt điểm đến.", "ok"); await refresh();
        } catch (er) { toast(er.message, "err"); } }) } }, isPlace ? "Lưu điểm đón" : "Lưu điểm đến"),
      !isPlace && s.geofence && h("button", { class: "btn ghost block", on: { click: async () => { try { await del(`/v1/vehicles/${s.vehicle.id}/geofence`); close(true); await refresh(); } catch (er) { toast(er.message, "err"); } } } }, "Xóa điểm đến"));
  }, { title: isPlace ? (place ? "Sửa điểm đón cố định" : "Thêm điểm đón cố định") : "Điểm đến" });
}
