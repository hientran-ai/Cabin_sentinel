import { get, post, put, patch, del, api, auth } from "../api.js";
import { h, icon, carPic, fmt, toast, sheet, confirmDialog, field, switchRow, busy } from "../ui.js";
import { signedOut } from "../app.js";
import * as wp from "../webpush.js";
import { addVehicle, pairCode, openDevice } from "./setup.js";

export const live = false;      // forms live here: repaint only when an action asks for it
const ROLE = { owner: "Chủ xe", confirm: "Xem và xác nhận", view: "Chỉ xem", school: "Chỉ đưa đón" };

const section = (title, ...kids) => [h("div", { class: "sec-title" }, title), ...kids];
const list = (...kids) => h("div", { class: "card pad0 list" }, kids.flat().filter(Boolean));

export async function render(ctx) {
  const { S, refresh, rerender } = ctx;
  const vid = S.vid;
  const owner = S.status && S.status.role === "owner";
  const [me, tg, push, members, devices, contacts, sessions, alertPhoto] = await Promise.all([
    get("/v1/me"), get("/v1/me/telegram").catch(() => ({ configured: false, linked: false })), get("/v1/me/push").catch(() => null),
    vid ? get(`/v1/vehicles/${vid}/members`).catch(() => []) : [], vid && owner ? get(`/v1/vehicles/${vid}/devices`).catch(() => []) : [],
    get("/v1/contacts").catch(() => []), get("/v1/me/sessions").catch(() => []),
    vid && owner ? get(`/v1/vehicles/${vid}/alert-photo`).catch(() => null) : null,
  ]);
  S.me = me;
  const st = me.settings;
  const save = async (patchBody) => { try { await put("/v1/me/settings", patchBody); toast("Đã lưu.", "ok"); } catch (e) { toast(e.message, "err"); } };

  return h("div", { class: "gap" }, h("h1", {}, "Tài khoản"),
    list(h("div", { class: "item" }, icon("user"), h("div", { class: "grow" }, h("div", {}, me.name), h("div", { class: "sub" }, me.phone)),
      h("button", { class: "btn small", on: { click: () => rename(me, rerender) } }, "Đổi tên"))),

    section("Xe", list((S.vehicles || []).map((v) => h("div", { class: "item" }, carPic(v.vehicle, "carthumb"), h("div", { class: "grow" }, h("div", {}, `${v.vehicle.name} · ${v.vehicle.plate}`), h("div", { class: "sub" }, ROLE[v.role] || v.role)),
      h("button", { class: "btn ghost small", on: { click: async () => { if (await confirmDialog({ title: v.role === "owner" ? "Xóa xe khỏi tài khoản?" : "Rời khỏi xe này?", message: v.role === "owner" ? "Mọi người trong gia đình mất quyền truy cập xe này." : "Bạn sẽ không nhận cảnh báo của xe này nữa.", ok: "Đồng ý", danger: true })) { try { await del(`/v1/vehicles/${v.vehicle.id}`); await refresh(); rerender(); } catch (e) { toast(e.message, "err"); } } } } }, "Gỡ"))),
      h("button", { class: "item", on: { click: () => addVehicle(refresh, rerender) } }, icon("plus"), "Thêm xe"),
      S.cfg && S.cfg.simulation && h("button", { class: "item", on: { click: () => linkVehicle(refresh, rerender) } }, icon("plus"), "Liên kết xe bằng mã thiết bị (chế độ thử)"))),

    vid && owner && section("Thiết bị trong xe", list(devices.map((d) => h("div", { class: "item" }, icon(d.platform === "ios" || d.platform === "android" ? "smartphone" : d.platform === "web" ? "cam" : "cpu"), h("div", { class: "grow" }, h("div", {}, `${d.label} (${d.platform})`), h("div", { class: "sub" }, `${d.online ? "Trực tuyến" : "Ngoại tuyến"} · ${fmt.ago(d.last_seen)}${d.info && d.info.battery != null ? ` · pin ${d.info.battery}%` : ""}`)),
      h("button", { class: "btn ghost small", on: { click: async () => { if (await confirmDialog({ title: "Ngắt thiết bị này?", message: "Thiết bị sẽ không gửi dữ liệu được nữa và xe không còn được bảo vệ cho tới khi ghép lại.", ok: "Ngắt", danger: true })) { try { await del(`/v1/vehicles/${vid}/devices/${d.id}`); rerender(); } catch (e) { toast(e.message, "err"); } } } } }, "Ngắt"))),
      h("button", { class: "item", on: { click: () => pairCode(vid, rerender) } }, icon("plus"), "Tạo mã ghép thiết bị"),
      h("button", { class: "item", on: { click: () => openDevice() } }, icon("cam"), h("div", { class: "grow" }, h("div", {}, "Mở trang thiết bị trong xe"), h("div", { class: "sub" }, alertPhoto && alertPhoto.enabled ? "Tab riêng: giả lập hoặc webcam. Chỉ gửi ảnh đã làm mờ người khi có cảnh báo" : "Tab riêng: giả lập hoặc webcam. Ảnh không gửi đi")), icon("chev")),
      alertPhoto && alertPhotoRow(vid, alertPhoto, rerender))),

    vid && section("Gia đình", list(members.map((m) => h("div", { class: "item" }, icon("user"), h("div", { class: "grow" }, h("div", {}, `${m.name}${m.status === "pending" ? " (chờ đăng nhập)" : ""}`), h("div", { class: "sub" }, `${m.phone} · ${ROLE[m.role] || m.role}`)),
      owner && m.role !== "owner" && [h("button", { class: "btn ghost small", on: { click: () => roleSheet(vid, m, rerender) } }, "Quyền"),
        h("button", { class: "btn ghost small", "aria-label": `Xóa ${m.name}`, on: { click: async () => { if (await confirmDialog({ title: `Xóa ${m.name}?`, message: "Người này không còn nhận cảnh báo xe.", ok: "Xóa", danger: true })) { try { await del(`/v1/vehicles/${vid}/members/${m.id}`); rerender(); } catch (e) { toast(e.message, "err"); } } } } }, icon("trash"))])),
      owner && h("button", { class: "item", on: { click: () => invite(vid, rerender) } }, icon("plus"), "Mời người thân"))),

    section("Người liên hệ khẩn cấp", list(contacts.map((c) => h("div", { class: "item" }, icon("phone"), h("div", { class: "grow" }, h("div", {}, c.name), h("div", { class: "sub" }, `${c.rel} · ${c.phone}`)),
      h("button", { class: "btn ghost small", "aria-label": `Xóa ${c.name}`, on: { click: async () => { try { await del(`/v1/contacts/${c.id}`); rerender(); } catch (e) { toast(e.message, "err"); } } } }, icon("trash")))),
      h("button", { class: "item", on: { click: () => addContact(rerender) } }, icon("plus"), "Thêm người liên hệ")),
      h("p", { class: "small muted", style: "margin:6px 4px 0" }, "Nhận SMS khi sự cố nghiêm trọng không ai xem (cần máy chủ cấu hình SMS). Ứng dụng không tự gọi điện.")),

    section("Thông báo", telegramCard(tg, me, rerender), muteCard(me, rerender),
      list(h("label", { class: "switch stack" }, h("div", {}, h("div", {}, "Kênh nhận thông báo"), h("div", { class: "sub" }, "Tự động: Telegram nếu đã liên kết, nếu không dùng ntfy. Lỗi một kênh thì tự chuyển kênh còn lại.")),
        h("select", { "aria-label": "Kênh thông báo", style: "width:auto", on: { change: (e) => save({ notify_channel: e.target.value }) } }, [["auto", "Tự động"], ["telegram", "Telegram"], ["ntfy", "ntfy"], ["both", "Cả hai"]].map(([k, t]) => h("option", { value: k, selected: (st.notify_channel || "auto") === k }, t)))),
        switchRow("Cảnh báo mức Cảnh báo", "Mức Nghiêm trọng luôn được gửi", st.notify_warning, (v) => save({ notify_warning: v })),
        switchRow("Thông tin chung", "Kết nối lại thiết bị, đóng sự cố…", st.notify_info, (v) => save({ notify_info: v })),
        switchRow("Nhắc khi rời xe", "Nhắc kiểm tra ghế sau khi khóa xe", st.exit_reminder, (v) => save({ exit_reminder: v })),
        pushRow()),
      push && h("p", { class: "small muted", style: "margin:6px 4px 0" }, `ntfy (kênh dự phòng): chủ đề riêng ${push.topic}. Ai biết tên chủ đề đều đọc được, đừng chia sẻ.`)),

    section("Mục đích sử dụng", list(h("div", { class: "switch" }, h("div", {}, "Dùng cho"), h("select", { "aria-label": "Mục đích", style: "width:auto", on: { change: (e) => save({ purpose: e.target.value }) } },
      [["cabin", "Giám sát cabin"], ["school", "Đưa đón"], ["both", "Cả hai"]].map(([k, t]) => h("option", { value: k, selected: st.purpose === k }, t)))),
      S.cfg && S.cfg.simulation && switchRow("Chế độ dùng thử (mô phỏng)", "Hiện dữ liệu mô phỏng khi chưa có thiết bị", st.demo_mode, (v) => save({ demo_mode: v })))),

    section("Bảo mật", list(sessions.map((s) => h("div", { class: "item" }, icon("shield"), h("div", { class: "grow" }, h("div", {}, s.current ? "Phiên này" : "Phiên khác"), h("div", { class: "sub" }, `${fmt.datetime(s.created_at)} · ${(s.agent || "").slice(0, 60)}`)),
      !s.current && h("button", { class: "btn ghost small", on: { click: async () => { try { await del(`/v1/me/sessions/${s.id}`); rerender(); } catch (e) { toast(e.message, "err"); } } } }, "Thu hồi"))),
      h("button", { class: "item", on: { click: async () => { if (await confirmDialog({ title: "Đăng xuất mọi thiết bị?", message: "Bạn sẽ phải đăng nhập lại ở mọi nơi.", ok: "Đăng xuất hết", danger: true })) { try { await post("/v1/auth/logout-all"); signedOut(); } catch (e) { toast(e.message, "err"); } } } } }, icon("logout"), "Đăng xuất mọi thiết bị"))),

    section("Dữ liệu của bạn", list(
      h("button", { class: "item", on: { click: exportData } }, icon("download"), h("div", { class: "grow" }, h("div", {}, "Tải bản sao dữ liệu (JSON)"), h("div", { class: "sub" }, "Hồ sơ, bé, liên hệ, xe của bạn"))),
      h("button", { class: "item", style: "color:var(--red)", on: { click: () => deleteAccount() } }, icon("trash"), h("div", { class: "grow" }, h("div", {}, "Xóa tài khoản và dữ liệu"), h("div", { class: "sub" }, "Xóa luôn các xe bạn là chủ xe và toàn bộ lịch sử, ảnh")))),
      h("p", { class: "small muted", style: "margin:6px 4px 0" }, "Lịch sử cảm biến và hành trình tự xóa sau 7 ngày, ảnh sau 30 ngày, nhật ký truy cập sau 365 ngày. Ảnh camera gốc không rời thiết bị; ảnh kèm cảnh báo (nếu chủ xe bật) đã được làm mờ người và tự xóa sau 24 giờ.")),

    h("button", { class: "btn block", style: "margin-top:18px", on: { click: async (e) => busy(e.target, async () => { try { await wp.disable({ keep: true }); await post("/v1/auth/logout"); } catch { /* token may already be gone */ } signedOut(); }) } }, "Đăng xuất"),
    h("p", { class: "small muted center" }, "Cabin Noir chỉ giám sát, không mở khóa hay điều khiển xe và không thể đảm bảo an toàn tuyệt đối. Thấy người trong xe: gọi 112."));
}

function telegramCard(tg, me, rerender) {
  if (!tg.configured) return h("div", { class: "card small muted" }, "Telegram chưa được bật trên máy chủ này (cần TELEGRAM_BOT_TOKEN).");
  return h("div", { class: "card gap" }, h("div", { class: "row between" }, h("div", {}, h("h3", {}, "Telegram"), h("div", { class: "small muted" }, tg.linked ? "Đã liên kết. Cảnh báo gửi tới Telegram của bạn." : "Nhận cảnh báo xe qua Telegram thay cho ntfy.")), h("span", { class: `pill ${tg.linked ? "green" : "grey"}` }, tg.linked ? "Đã liên kết" : "Chưa liên kết")),
    h("p", { class: "small muted", style: "margin:0" }, "Tin nhắn chỉ có tên xe, biển số và nội dung cảnh báo, không có ảnh hay số điện thoại. Telegram là dịch vụ nước ngoài, chỉ liên kết khi bạn đồng ý."),
    h("div", { class: "row wrap" },
      !tg.linked && h("button", { class: "btn primary grow", on: { click: (e) => busy(e.target, () => linkTelegram(rerender)) } }, "Liên kết Telegram"),
      tg.linked && h("button", { class: "btn grow", on: { click: async (e) => busy(e.target, async () => { try { const r = await post("/v1/me/telegram/test"); toast(r.sent ? "Đã gửi tin thử." : "Không gửi được tin thử.", r.sent ? "ok" : "err"); } catch (er) { toast(er.message, "err"); } }) } }, "Gửi tin thử"),
      tg.linked && h("button", { class: "btn ghost grow", on: { click: async () => { try { await del("/v1/me/telegram"); rerender(); } catch (e) { toast(e.message, "err"); } } } }, "Hủy liên kết")));
}

async function linkTelegram(rerender) {
  try {
    const r = await post("/v1/me/telegram/link");
    let stop = false;
    const poll = async () => { for (let i = 0; i < 300 && !stop; i++) { await new Promise((ok) => setTimeout(ok, 2000)); try { const s = await get("/v1/me/telegram"); if (s.linked) { stop = true; toast("Đã liên kết Telegram.", "ok"); document.querySelector(".scrim") && document.querySelector(".scrim").remove(); rerender(); } } catch { /* retry */ } } };
    poll();
    await sheet(() => h("div", { class: "gap" }, h("p", { style: "margin:0" }, "Mở Telegram và bấm Start để liên kết. Mã có hiệu lực 10 phút."),
      r.deep_link ? h("a", { class: "btn primary block", href: r.deep_link, target: "_blank", rel: "noopener noreferrer" }, "Mở Telegram") : h("p", { class: "small muted" }, "Máy chủ chưa biết tên bot. Nhắn cho bot lệnh bên dưới."),
      h("div", { class: "card center", style: "font:700 20px ui-monospace,monospace" }, `/start ${r.code}`), h("p", { class: "small muted", style: "margin:0" }, "Cửa sổ này tự đóng khi liên kết xong.")), { title: "Liên kết Telegram" });
    stop = true;
  } catch (e) { toast(e.message, "err"); }
}

function rename(me, rerender) {
  return sheet((close) => { const n = h("input", { type: "text", value: me.name, maxLength: 60 });
    return h("div", { class: "gap" }, field("Tên", n), h("button", { class: "btn primary block", on: { click: (e) => busy(e.target, async () => { try { await patch("/v1/me", { name: n.value.trim() }); close(true); rerender(); } catch (er) { toast(er.message, "err"); } }) } }, "Lưu")); }, { title: "Đổi tên" });
}

function linkVehicle(refresh, rerender) {
  return sheet((close) => { const code = h("input", { type: "text", placeholder: "CS-VF8-2026", maxLength: 24 });
    return h("div", { class: "gap" }, field("Mã thiết bị", code), h("button", { class: "btn primary block", on: { click: (e) => busy(e.target, async () => { try {
      const r = await post("/v1/vehicles/link", { pair_code: code.value.trim() });
      await post("/v1/vehicles/link/confirm", { challenge_id: r.challenge_id, code: r.dev_code || "", name: r.suggested_name || "Xe của tôi" });
      close(true); await refresh(); rerender(); } catch (er) { toast(er.message, "err"); } }) } }, "Liên kết")); }, { title: "Liên kết xe" });
}

function invite(vid, rerender) {
  return sheet((close) => { const name = h("input", { type: "text", maxLength: 40 }); const phone = h("input", { type: "tel", placeholder: "09xxxxxxxx", maxLength: 12 });
    const role = h("select", {}, [["confirm", "Xem và xác nhận"], ["view", "Chỉ xem"], ["school", "Chỉ đưa đón"]].map(([k, t]) => h("option", { value: k }, t)));
    return h("div", { class: "gap" }, field("Tên", name), field("Số điện thoại", phone), field("Quyền", role),
      h("button", { class: "btn primary block", on: { click: (e) => busy(e.target, async () => { try { await post(`/v1/vehicles/${vid}/members`, { name: name.value.trim(), phone: phone.value.replace(/\s/g, ""), role: role.value }); close(true); rerender(); } catch (er) { toast(er.message, "err"); } }) } }, "Mời")); }, { title: "Mời người thân" });
}

function roleSheet(vid, m, rerender) {
  return sheet((close) => h("div", { class: "gap" }, [["confirm", "Xem và xác nhận"], ["view", "Chỉ xem"], ["school", "Chỉ đưa đón"]].map(([k, t]) => h("button", { class: `btn ${m.role === k ? "primary" : ""}`, on: { click: async () => { try { await patch(`/v1/vehicles/${vid}/members/${m.id}`, { role: k }); close(true); rerender(); } catch (er) { toast(er.message, "err"); } } } }, t))), { title: `Quyền của ${m.name}` });
}

function addContact(rerender) {
  return sheet((close) => { const name = h("input", { type: "text", maxLength: 40 }); const rel = h("input", { type: "text", value: "Người thân", maxLength: 20 }); const phone = h("input", { type: "tel", placeholder: "09xxxxxxxx", maxLength: 12 });
    return h("div", { class: "gap" }, field("Tên", name), field("Quan hệ", rel), field("Số điện thoại", phone),
      h("button", { class: "btn primary block", on: { click: (e) => busy(e.target, async () => { try { await post("/v1/contacts", { name: name.value.trim(), rel: rel.value.trim(), phone: phone.value.replace(/\s/g, "") }); close(true); rerender(); } catch (er) { toast(er.message, "err"); } }) } }, "Thêm")); }, { title: "Người liên hệ khẩn cấp" });
}

async function exportData() {
  try {
    const data = await get("/v1/me/export");
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = h("a", { href: url, download: "cabin-noir-du-lieu.json" }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) { toast(e.message, "err"); }
}

function deleteAccount() {
  return sheet((close) => { const t = h("input", { type: "text", placeholder: "XOA TAI KHOAN", autocomplete: "off" });
    return h("div", { class: "gap" }, h("p", { style: "margin:0" }, "Việc này xóa vĩnh viễn tài khoản, các xe bạn là chủ xe cùng lịch sử, ảnh và thiết bị đã ghép. Không hoàn tác được."),
      field("Gõ XOA TAI KHOAN để xác nhận", t), h("button", { class: "btn danger block", on: { click: (e) => busy(e.target, async () => { if (t.value.trim() !== "XOA TAI KHOAN") { toast("Chưa gõ đúng dòng xác nhận.", "err"); return; } try { await del("/v1/me", { confirm: "XOA TAI KHOAN" }); close(true); toast("Đã xóa tài khoản.", "ok"); signedOut(); } catch (er) { toast(er.message, "err"); } }) } }, "Xóa vĩnh viễn")); }, { title: "Xóa tài khoản" });
}

// Temporary mute for this person, on every channel (Telegram, ntfy, this browser). Ends by itself and says so.
function muteCard(me, rerender) {
  const st = (me && me.settings) || {};
  const muted = st.mute_until && st.mute_until > Date.now() / 1000, forever = muted && st.mute_indefinite;
  const save = (r) => { Object.assign(me.settings, r); rerender(); };
  const go = (minutes) => async (e) => busy(e.target, async () => {
    try { const r = await post("/v1/me/mute", { minutes }); toast(`Đã tạm tắt thông báo đến ${fmt.clock(r.mute_until)}.`, "ok"); save(r); } catch (er) { toast(er.message, "err"); }
  });
  // No end time: say plainly what stops and what keeps running before turning it off.
  const goForever = async (e) => {
    const ok = await confirmDialog({ title: "Tắt thông báo cho đến khi bạn bật lại?", danger: true, ok: "Xác nhận tắt", cancel: "Hủy",
      message: "Bạn sẽ không nhận cảnh báo có người trong xe qua Telegram, ntfy hay trình duyệt, và thông báo không tự bật lại. "
        + "Thiết bị trong xe vẫn giám sát, sự cố vẫn được mở và ghi trong ứng dụng, người thân khác trong gia đình vẫn nhận cảnh báo. "
        + "Nếu không còn ai khác nhận, sẽ không ai được báo khi trẻ em còn trong xe. Cứ 6 giờ bạn được nhắc một lần." });
    if (!ok) return;
    busy(e.target, async () => { try { const r = await post("/v1/me/mute", { until_resumed: true }); toast("Đã tắt thông báo cho đến khi bạn bật lại.", "ok"); save(r); } catch (er) { toast(er.message, "err"); } });
  };
  return h("section", { class: "card gap" },
    h("div", {}, h("h3", { style: "margin:0;display:flex;align-items:center;gap:8px" }, icon("bell"), "Tạm tắt thông báo"),
      h("div", { class: "small muted" }, forever ? "Đang tắt cho đến khi bạn bật lại. Bạn không nhận cảnh báo có người trong xe. Sự cố vẫn được ghi lại trong ứng dụng."
        : muted ? `Đang tắt đến ${fmt.clock(st.mute_until)}. Sự cố vẫn được ghi lại trong ứng dụng.`
        : "Dùng khi đang thử nghiệm hoặc thiết bị hay mất mạng. Chọn thời gian để tự bật lại và báo cho bạn, hoặc tắt cho đến khi bạn bật lại. Trong lúc tắt, bạn không nhận cảnh báo có người trong xe.")),
    muted ? h("div", { class: "row wrap" }, h("button", { class: "btn primary grow", on: { click: (e) => busy(e.target, async () => { try { const r = await del("/v1/me/mute"); toast("Đã bật lại thông báo.", "ok"); save(r); } catch (er) { toast(er.message, "err"); } }) } }, "Bật lại ngay"))
      : [h("div", { class: "row wrap" }, [[30, "30 phút"], [60, "1 giờ"], [240, "4 giờ"]].map(([m, t]) => h("button", { class: "btn grow", on: { click: go(m) } }, t))),
        h("button", { class: "btn block", on: { click: goForever } }, "Cho đến khi tôi bật lại")],
    h("p", { class: "small muted", style: "margin:0" }, "Telegram: nhắn /tamdung 60 để tạm tắt, /bat để bật lại."));
}

// Alert photos: off by default, owner only, explicit consent. The in-car device pixelates every person it detects before
// the frame leaves the phone; Telegram keeps its own copy, which Cabin Noir cannot delete.
function alertPhotoRow(vid, cur, rerender) {
  const sub = cur.enabled ? `Đang bật${cur.changed_by ? ` · ${cur.changed_by}` : ""}. Ảnh lưu 24 giờ trong Cabin Noir` : "Tắt: cảnh báo chỉ gửi thẻ vẽ từ dữ liệu, không có ảnh camera";
  return switchRow("Gửi kèm ảnh camera khi có cảnh báo", sub, cur.enabled, async (v, el) => {
    el.disabled = true;
    try {
      if (v) {
        const ok = await confirmDialog({ title: "Bật ảnh kèm cảnh báo?", ok: "Tôi đồng ý, bật", message:
          "Khi thiết bị thấy người trong xe, nó gửi tối đa 1 ảnh mỗi 30 giây kèm cảnh báo. Mọi người được phát hiện sẽ bị làm mờ ngay trên thiết bị trước khi gửi, "
          + "nhưng người mà mô hình không nhận ra thì không được làm mờ. Ảnh lưu 24 giờ trong Cabin Noir. Nếu bạn nhận qua Telegram, Telegram lưu một bản riêng "
          + "mà Cabin Noir không xóa được. Ảnh có thể có trẻ em: chỉ bật khi bạn là người giám hộ và đồng ý với điều này." });
        if (!ok) { el.checked = false; el.disabled = false; return; }
      }
      await put(`/v1/vehicles/${vid}/alert-photo`, { enabled: v, consent: v });
      toast(v ? "Đã bật ảnh kèm cảnh báo." : "Đã tắt. Không gửi ảnh camera nữa.", "ok");
      rerender();
    } catch (e) { el.checked = !v; toast(e.message, "err"); }
    el.disabled = false;
  });
}

// System notifications in this browser (Web Push): like the iPhone app, also when the tab is closed.
function pushRow() {
  const sub = wp.isIOS() && !wp.installed()
    ? "Trên iPhone: Chia sẻ → Thêm vào Màn hình chính, mở từ biểu tượng đó rồi bật"
    : "Hiện cảnh báo như ứng dụng điện thoại, kể cả khi đã đóng tab";
  const row = switchRow("Thông báo trên máy này", sub, false, async (v, el) => {
    el.disabled = true;
    try {
      if (v) { await wp.enable(); toast("Đã bật. Cảnh báo sẽ hiện trên máy này, cùng lúc với Telegram.", "ok"); }
      else { await wp.disable(); toast("Đã tắt thông báo trên máy này.", "ok"); }
      el.checked = v; testBtn.hidden = !v;
    } catch (e) { el.checked = !v; toast(e.message, "err"); }
    el.disabled = false;
  });
  const input = row.querySelector("input");
  const testBtn = h("button", { class: "btn small ghost", hidden: true, on: { click: (e) => busy(e.target, async () => { try { await wp.test(); toast("Đã gửi thông báo thử.", "ok"); } catch (er) { toast(er.message, "err"); } }) } }, "Gửi thử");
  wp.enabled().then((on) => { input.checked = on; testBtn.hidden = !on; }).catch(() => {});
  return h("div", {}, row, h("div", { class: "row", style: "justify-content:flex-end;padding:0 4px 6px" }, testBtn));
}
