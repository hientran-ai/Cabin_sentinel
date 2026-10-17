import { get, post, del, ApiError } from "../api.js";
import { h, icon, carPic, fmt, toast, sheet, confirmDialog, busy } from "../ui.js";
const loadMap = () => {};
import { addVehicle, setupCard } from "./setup.js";

const LEVEL = { critical: "Nghiêm trọng", warning: "Cảnh báo", notice: "Lưu ý", paused: "Tạm dừng", ok: "Bình thường", safe: "Bình thường", unknown: "Chưa rõ" };

// Fresh, real data only. "unknown" and stale data are never drawn as safe.
function fresh(s) { return s && !s.restricted && s.verdict && s.verdict.current !== false && !s.no_real_data && (s.camera || "ok") === "ok" && s.seats; }

function counts(s) {
  if (!fresh(s)) return null;
  const who = s.seats.filter((x) => x.occ);
  return { people: who.length, items: (s.items || []).length, child: who.some((x) => x.age === "child") };
}

function glance(s) {
  return sheet((close) => {
    const who = (s.seats || []).filter((x) => x.occ);
    return h("div", { class: "gap" },
      !fresh(s) && h("div", { class: "banner" }, "Chưa có dữ liệu mới từ xe. Không coi là an toàn."),
      h("h3", {}, "Người và thú cưng"),
      who.length ? h("div", { class: "card pad0 list" }, who.map((x) => h("div", { class: "item" }, icon("child"),
        h("div", { class: "grow" }, h("div", {}, `${x.label} · ${x.kind === "pet" ? "thú cưng" : "người"} ${Math.round(x.conf * 100)}%`),
          x.age === "child" && h("div", { class: "sub" }, "Có thể là trẻ em (chỉ là gợi ý, không đổi mức cảnh báo)"))))) : h("p", { class: "muted" }, "Camera chưa thấy ai ở các ghế sau."),
      h("h3", {}, "Đồ vật"),
      (s.items || []).length ? h("div", { class: "card pad0 list" }, s.items.map((i) => h("div", { class: "item" }, icon("bag"), `${i.name} · ${i.seat}`))) : h("p", { class: "muted" }, "Chưa thấy đồ vật."),
      h("p", { class: "small muted" }, "Chỉ giám sát, không thay cho việc tự kiểm tra xe."));
  }, { title: "Trong xe" });
}

async function act(btn, fn, okMsg) {
  await busy(btn, async () => {
    try { await fn(); if (okMsg) toast(okMsg, "ok"); } catch (e) { toast(e.message, "err"); }
  });
}

export async function render(ctx) {
  const { S, refresh, go, rerender } = ctx;
  const s = S.status;
  if (!S.vehicles.length) {
    return h("div", { class: "gap" }, h("section", { class: "card gap" }, h("h2", {}, "Bắt đầu với Cabin Noir"),
      h("div", { class: "list" },
        h("div", { class: "item" }, h("span", { class: "stepno" }, "1"), h("div", { class: "grow" }, "Thêm xe của bạn")),
        h("div", { class: "item" }, h("span", { class: "stepno" }, "2"), h("div", { class: "grow" }, "Ghép thiết bị camera trong xe (điện thoại, máy tính hoặc trình duyệt)")),
        h("div", { class: "item" }, h("span", { class: "stepno" }, "3"), h("div", { class: "grow" }, "Bật thông báo để nhận cảnh báo ngay"))),
      h("button", { class: "btn primary block", on: { click: () => addVehicle(refresh, rerender) } }, icon("plus"), "Thêm xe"),
      h("p", { class: "small muted", style: "margin:0" }, "Chưa có xe nghĩa là chưa có dữ liệu: app không hiển thị trạng thái an toàn giả.")));
  }
  if (!s) return h("div", { class: "card center muted" }, "Đang tải…");
  if (s.restricted) return h("div", { class: "card gap" }, h("h2", {}, s.vehicle.name), h("p", { class: "muted", style: "margin:0" }, "Bạn chỉ có quyền Đưa đón với xe này."), h("a", { class: "btn primary", href: "#/school" }, "Mở Đưa đón"));

  const v = s.verdict;
  const stale = !fresh(s);
  const c = counts(s);
  const inc = s.incident;
  const level = stale ? "unknown" : v.level;
  const sim = s.source !== "device" && !s.no_real_data;
  const out = [];
  // An open incident outranks a calm camera: never show a green "normal" card while someone still has to check the car.
  const pending = inc && !stale && ["safe", "notice"].includes(v.level);

  const setup = null;
  out.push(h("div", { class: `car-stage ${stale ? "stale" : ""}` }, carPic(s.vehicle)));
  out.push(h("section", { class: `verdict ${pending ? "warning" : level}` },
    h("div", { class: "row between" }, h("div", { class: "kicker" }, stale ? "Chưa có dữ liệu mới" : pending ? "Sự cố chưa đóng" : LEVEL[v.level] || v.level), sim && h("span", { class: "pill" }, "MÔ PHỎNG")),
    h("h1", { style: "margin:6px 0" }, stale && !s.no_real_data ? "Không coi là an toàn" : pending ? "Camera không còn thấy người" : v.title),
    h("p", { class: "muted", style: "margin:0" }, stale && !s.no_real_data ? "Xe chưa gửi dữ liệu mới hoặc camera không nhìn được ghế sau. Hãy kiểm tra xe." : pending ? "Sự cố vẫn mở cho tới khi có người xác nhận đã tự kiểm tra xe." : v.sub),
    h("p", { class: "small muted", style: "margin:10px 0 0" }, s.last_seen ? `Cập nhật ${fmt.ago(s.last_seen)} · ${s.connection === "online" ? "thiết bị trực tuyến" : "thiết bị ngoại tuyến"}` : "Chưa nhận dữ liệu nào từ thiết bị trong xe")));

  if (setup) out.push(setup);
  out.push(h("div", { class: "chips" },
    h("button", { class: `chip ${c && c.people ? "hot" : ""}`, "aria-label": `Người và thú cưng: ${c ? c.people : "chưa có dữ liệu"}`, on: { click: () => glance(s) } }, icon("child"), c ? c.people : "–", c && c.child && h("span", { class: "small" }, "có thể có trẻ em")),
    h("button", { class: "chip items", "aria-label": `Đồ vật: ${c ? c.items : "chưa có dữ liệu"}`, on: { click: () => glance(s) } }, icon("bag"), c ? c.items : "–")));

  if (inc) {
    out.push(h("section", { class: "card gap" },
      h("div", { class: "row between" }, h("h2", {}, "Sự cố đang mở"), h("span", { class: `pill ${inc.level === "critical" ? "red" : "orange"}` }, LEVEL[inc.level])),
      h("p", { style: "margin:0" }, inc.reason),
      h("p", { class: "small muted", style: "margin:0" }, `Mở ${fmt.ago(inc.created_at)}${inc.viewed_at ? ` · ${inc.viewed_by} đã xem (chưa đóng)` : " · chưa ai xem"}`),
      h("div", { class: "actions3" },
        h("a", { class: "btn primary", href: `#/incident/${inc.id}` }, "Xử lý ngay"),
        !inc.viewed_at && h("button", { class: "btn", on: { click: (e) => act(e.target, async () => { await post(`/v1/incidents/${inc.id}/view`); await refresh(); }, "Đã ghi nhận bạn đã xem. Sự cố vẫn mở.") } }, "Đã xem"),
        h("a", { class: "btn danger", href: "tel:112" }, icon("phone"), "Gọi 112"))));
  }

  const ex = s.exit_check;
  if (ex && ex.pending && !inc) {
    out.push(h("section", { class: "card gap" }, h("h2", {}, "Trước khi rời xe"),
      h("p", { style: "margin:0" }, `Camera đang thấy ${ex.seats.length} người/thú${ex.items.length ? ` và ${ex.items.length} đồ vật` : ""} ở ghế sau.`),
      h("button", { class: "btn primary", on: { click: (e) => act(e.target, async () => { await post(`/v1/vehicles/${s.vehicle.id}/exit-check/confirm`); await refresh(); }, "Đã ghi nhận.") } }, "Tôi đã kiểm tra ghế sau")));
  }

  out.push(h("section", { class: "card gap" }, h("h3", {}, "Sơ đồ ghế"),
    h("div", { class: "seats", role: "list" }, s.seats.map((x) => h("div", { role: "listitem", class: `seat ${["driver", "passenger"].includes(x.key) ? "front" : "rear"} ${x.occ ? (x.kind === "pet" ? "occ pet" : "occ") : ""}`,
      "aria-label": `${x.label}: ${x.occ ? (x.kind === "pet" ? "thú cưng" : "có người") : "chưa thấy ai"}` }, x.label, x.occ && h("div", {}, `${x.kind === "pet" ? "Thú" : "Người"} ${Math.round(x.conf * 100)}%`)))),
    h("p", { class: "small muted", style: "margin:0" }, "Không phát hiện gì không có nghĩa là xe trống.")));

  if ((s.tiles || []).length) out.push(h("div", { class: "tiles" }, s.tiles.map((t) => h("div", { class: `tile ${t.tone}` }, h("div", { class: "small muted" }, t.label), h("div", { class: "v" }, t.value)))));

  const paused = s.paused_until && s.paused_until > Date.now() / 1000;
  const mapBox = s.coords ? h("div", { class: "map", id: "home-map", role: "img", "aria-label": "Vị trí xe trên bản đồ" }) : null;
  out.push(h("section", { class: "card gap" }, h("h3", {}, "Hành động"),
    h("div", { class: "acts" },
      h("button", { class: "btn", on: { click: (e) => act(e.target, async () => { await post(`/v1/vehicles/${s.vehicle.id}/refresh`); await refresh(); }, "Đã yêu cầu dữ liệu mới.") } }, icon("refresh"), "Làm mới dữ liệu"),
      paused ? h("button", { class: "btn", on: { click: (e) => act(e.target, async () => { await del(`/v1/vehicles/${s.vehicle.id}/pause`); await refresh(); }, "Đã bật lại giám sát.") } }, icon("power"), "Bật lại giám sát")
        : null),
    paused && h("div", { class: "banner" }, s.paused_indefinite ? "Giám sát đang tắt cho đến khi bạn bật lại. Hệ thống không cảnh báo trong lúc này." : `Đang tạm dừng giám sát tới ${fmt.clock(s.paused_until)}. Sẽ tự bật lại.`),
    S.cfg && S.cfg.climate && s.climate && climateRow(s, refresh)));
  if (mapBox) { out.push(h("section", { class: "card gap" }, h("h3", {}, "Vị trí xe"), mapBox, h("p", { class: "small muted", style: "margin:0" }, `${s.location || "Vị trí"} · ${fmt.ago(s.coords.at)} · Bản đồ © OpenStreetMap`))); setTimeout(() => loadMap("home-map", s), 0); }
  if (s.device) out.push(h("p", { class: "small muted center" }, `Thiết bị: ${s.device.label} (${s.device.platform})${s.device.battery != null ? ` · pin ${s.device.battery}%` : ""}`));
  return h("div", { class: "gap" }, out);
}

// Pausing is a safety decision: the owner picks a length, reads exactly what stops and what keeps running, then confirms.
function pauseSheet(s, refresh) {
  const OPTIONS = [[10, "10 phút"], [30, "30 phút"], [60, "60 phút"], [null, "Cho đến khi tôi bật lại"]];
  return sheet((close) => {
    const body = h("div", { class: "gap" });
    const choose = () => body.replaceChildren(
      h("p", { class: "muted", style: "margin:0" }, "Dùng khi bạn đang ngồi trong xe đỗ. Không thể tạm dừng khi có sự cố mở."),
      h("div", { class: "gap-s" }, OPTIONS.map(([m, t]) => h("button", { class: "btn block", on: { click: () => confirmStep(m, t) } }, t))));
    const confirmStep = (m, label) => body.replaceChildren(
      h("h3", { style: "margin:0" }, `Tạm dừng giám sát: ${label.toLowerCase()}`),
      h("div", { class: "banner red", role: "alert" }, "Trong thời gian tạm dừng, hệ thống có thể không phát hiện hoặc cảnh báo khi trẻ em hoặc thú cưng còn trong xe."),
      h("div", { class: "gap-s" },
        h("div", {}, h("strong", {}, "Ngừng: "), "đánh giá nguy cơ, mở sự cố, thông báo (Telegram, ntfy, trình duyệt) và SMS leo thang cho xe này."),
        h("div", {}, h("strong", {}, "Vẫn chạy: "), "camera và cảm biến trên thiết bị vẫn thu thập và gửi dữ liệu về máy chủ để lưu lịch sử. Thiết bị vẫn báo khi mất kết nối hoặc camera không nhìn được."),
        h("div", {}, h("strong", {}, "Bật lại: "), m == null ? "không tự bật lại. Bạn được nhắc mỗi 6 giờ; bấm “Bật lại giám sát” ở màn hình Xe khi muốn tiếp tục." : `tự bật lại sau ${m} phút, hoặc bấm “Bật lại giám sát” sớm hơn.`)),
      h("div", { class: "row" },
        h("button", { class: "btn grow", on: { click: choose } }, "Hủy"),
        h("button", { class: "btn primary grow", on: { click: (e) => busy(e.target, async () => { try { await post(`/v1/vehicles/${s.vehicle.id}/pause`, m == null ? { until_resumed: true } : { minutes: m }); close(); await refresh(); } catch (er) { toast(er.message, "err"); } }) } }, "Xác nhận tạm dừng")));
    choose();
    return body;
  }, { title: "Tạm dừng giám sát" });
}

function climateRow(s, refresh) {
  const c = s.climate;
  return h("div", { class: "row between" }, h("div", {}, h("div", {}, `Điều hòa: ${c.status === "on" ? "đang bật" : "tắt"}`), c.status === "on" && h("div", { class: "small muted" }, `Còn ${fmt.secs(c.seconds_left)}`)),
    h("button", { class: "btn small", on: { click: async () => { try { await post(`/v1/vehicles/${s.vehicle.id}/climate`, { action: c.status === "on" ? "stop" : "start" }); await refresh(); } catch (e) { toast(e.message, "err"); } } } }, c.status === "on" ? "Tắt" : "Bật"));
}

async function camera(s) {
  try {
    const r = await get(`/v1/vehicles/${s.vehicle.id}/camera`);
    await sheet(() => h("div", { class: "gap" },
      !r.available ? h("div", { class: "banner" }, r.message)
        : [h("p", { class: "muted", style: "margin:0" }, "Bản xem từ cảm biến: chỉ có kết quả nhận diện, không có ảnh gốc (ảnh gốc không rời thiết bị)."),
          (r.detections || []).length ? h("div", { class: "card pad0 list" }, r.detections.map((d) => h("div", { class: "item" }, icon("child"), `${d.label} · ${d.kind === "pet" ? "thú cưng" : "người"} ${Math.round(d.conf * 100)}%${d.age === "child" ? " · có thể là trẻ em" : ""}`))) : h("p", { class: "muted" }, "Camera chưa thấy ai. Không có nghĩa là xe trống."),
          (r.items || []).length > 0 && h("p", { class: "small muted" }, "Đồ vật: " + r.items.map((i) => i.name).join(", "))]), { title: "Camera" });
  } catch (e) { toast(e instanceof ApiError ? e.message : "Không xem được camera.", "err"); }
}
