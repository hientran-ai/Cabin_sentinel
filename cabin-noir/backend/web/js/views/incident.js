import { get, post, api, ApiError } from "../api.js";
import { h, icon, fmt, toast, confirmDialog, busy } from "../ui.js";
import { livePanel, stopLive } from "./live.js";

const ITEMS = [["seats", "Tôi đã nhìn tất cả ghế, kể cả ghế trẻ em"], ["floor", "Tôi đã nhìn sàn xe, dưới và giữa các ghế"], ["trunk", "Tôi đã kiểm tra cốp xe"]];
const state = { id: null, checks: new Set(), reject: null, done: null, overridden: false, error: null };
// The page repaints every few seconds; pictures are fetched once per version and kept as object URLs.
const pics = new Map();

function pic(key, path, alt, cls) {
  const img = h("img", { class: cls, alt, loading: "lazy", dataset: { pic: key } });
  const hit = pics.get(key);
  if (hit && hit.url) img.src = hit.url;
  else if (!hit) {
    const entry = { url: null };
    pics.set(key, entry);
    api("GET", path, undefined, { raw: true }).then(async (r) => { if (r.ok) { entry.url = URL.createObjectURL(await r.blob()); img.src = entry.url;
      // A repaint may have kept an earlier <img> on screen in place of this one: fill every copy.
      document.querySelectorAll("img[data-pic]").forEach((el) => { if (el.dataset.pic === key) el.src = entry.url; }); } }).catch(() => pics.delete(key));
  }
  return img;
}

function evidence(inc) {
  const cardKey = `card:${inc.id}:${inc.status}:${inc.level}:${inc.viewed_by || ""}`;
  const photos = inc.alert_photos || [];
  return h("section", { class: "card gap" }, h("h3", {}, "Thẻ cảnh báo"),
    pic(cardKey, `/v1/incidents/${inc.id}/card`, "Thẻ cảnh báo: ai đang ở trong xe, mức rủi ro, nhiệt độ", "alert-card"),
    h("p", { class: "small muted", style: "margin:0" }, "Hình vẽ từ dữ liệu cảm biến, giống tin gửi qua Telegram. Không phải ảnh camera."),
    photos.length > 0 && [h("h3", {}, "Ảnh từ camera trong xe"),
      photos.map((id) => pic(`photo:${id}`, `/v1/vehicles/${inc.vehicle_id}/photos/${id}`, "Ảnh cảnh báo có khung nhận diện, mặt người đã được che", "alert-photo")),
      h("p", { class: "small muted", style: "margin:0" }, "Khung cho biết thiết bị thấy gì (trẻ em, người, thú cưng, đồ vật). Mặt người đã được che ngay trên thiết bị. Ảnh tự xóa sau 24 giờ.")]);
}

export async function render(ctx) {
  const { S, refresh, arg } = ctx;
  if (state.id !== arg) Object.assign(state, { id: arg, checks: new Set(), reject: null, done: null, overridden: false, error: null });
  let inc;
  try { inc = state.done || await get(`/v1/incidents/${arg}`); } catch (e) { return h("div", { class: "card gap" }, h("p", {}, e.message), h("a", { class: "btn", href: "#/home" }, "Về trang chủ")); }
  const canAct = ["owner", "confirm"].includes(S.status && S.status.role);
  const resolved = inc.status === "resolved";

  if (resolved) {
    stopLive();
    return h("div", { class: "gap" }, h("a", { href: "#/home" }, "← Về trang chủ"),
      h("div", { class: "card gap center" }, h("div", { class: "pill green", style: "justify-self:center" }, "Hoàn tất"), h("h1", {}, "Đã đóng sự cố"),
        h("p", { class: "muted", style: "margin:0" }, state.overridden
          ? `${inc.resolved_by || "Bạn"} đóng sự cố lúc ${fmt.clock(inc.resolved_at)} dù hệ thống vẫn thấy có người. Cả gia đình được báo. Nếu camera còn thấy người, sự cố mới sẽ mở lại.`
          : `${inc.resolved_by || "Bạn"} xác nhận đã kiểm tra xe lúc ${fmt.clock(inc.resolved_at)}. Hệ thống không còn phát hiện người trong xe.`),
        h("a", { class: "btn primary", href: "#/home" }, "Về trang chủ"), h("a", { class: "btn", href: "#/history" }, "Xem lịch sử")));
  }

  const esc = inc.escalation;
  return h("div", { class: "gap" }, h("a", { href: "#/home" }, "← Về trang chủ"),
    h("section", { class: `verdict ${inc.level}` }, h("div", { class: "kicker" }, inc.level === "critical" ? "Nghiêm trọng" : "Cảnh báo"),
      h("h1", { style: "margin:6px 0" }, "Có thể có người trong xe"), h("p", { style: "margin:0" }, inc.reason),
      h("p", { class: "small muted", style: "margin:10px 0 0" }, `Mở ${fmt.ago(inc.created_at)}${inc.viewed_at ? ` · ${inc.viewed_by} đã xem` : ""}`)),
    h("div", { class: "actions3" }, h("a", { class: "btn danger", href: "tel:112", "aria-label": "Thấy người trong xe? Gọi 112" }, icon("phone"), "Gọi 112"),
      canAct && !inc.viewed_at && h("button", { class: "btn", on: { click: (e) => busy(e.target, async () => { try { await post(`/v1/incidents/${inc.id}/view`); toast("Đã ghi nhận bạn đã xem. Sự cố vẫn mở.", "ok"); refresh(); } catch (er) { toast(er.message, "err"); } }) } }, "Đã xem")),
    h("p", { class: "small muted", style: "margin:0" }, "“Đã xem” chỉ dừng nhắc lặp lại. Sự cố chỉ đóng khi bạn xác nhận đã kiểm tra xe và camera không còn thấy người."),
    evidence(inc),
    ["owner", "confirm"].includes(S.status && S.status.role) && livePanel(inc.vehicle_id),
    canAct && h("a", { class: "btn block", href: "#/check" }, icon("scan"), "Tự kiểm tra bằng camera máy này"),
    esc && h("section", { class: "card gap" }, h("h3", {}, "Kế hoạch xử lý"), h("div", { class: "steps" }, esc.steps.map((st) => h("div", { class: "step" }, h("i", { class: `dot ${st.state}` }),
      h("div", {}, h("div", {}, st.title), h("div", { class: "small muted" }, `${st.note}${st.state === "skipped" || st.state === "failed" ? " · " + (st.detail || st.state) : ""}`)))))),
    canAct ? h("section", { class: "card gap" }, h("h2", {}, "Xác nhận đã kiểm tra xe"),
      h("p", { class: "muted", style: "margin:0" }, "Chỉ xác nhận khi bạn hoặc người thân đang đứng cạnh xe và đã nhìn tận mắt. Hệ thống sẽ kiểm tra lại dữ liệu mới nhất trước khi đóng sự cố."),
      ITEMS.map(([k, t]) => h("label", { class: "check" }, h("input", { type: "checkbox", checked: state.checks.has(k), on: { change: (e) => { e.target.checked ? state.checks.add(k) : state.checks.delete(k); syncChecks(); } } }), t)),
      state.reject && rejection(state.reject, inc, ctx),
      h("button", { class: "btn primary block needs-checks", disabled: state.checks.size < 3, on: { click: (e) => busy(e.target, () => submit(inc, ctx, false)) } }, state.reject ? "Gửi lại xác nhận" : "Gửi xác nhận"))
      : h("div", { class: "banner" }, "Bạn chỉ có quyền xem. Chủ xe hoặc người được cấp quyền xác nhận mới đóng được sự cố."));
}

function rejection(r, inc, ctx) {
  return h("div", { class: "banner red", role: "alert" }, h("strong", {}, r.title), h("div", {}, r.message), h("div", { class: "small", style: "margin-top:6px" }, "Sự cố vẫn mở."),
    (r.code === "stale" || r.code === "changed") && h("button", { class: "btn small", style: "margin-top:8px", on: { click: async () => { try { await post(`/v1/vehicles/${inc.vehicle_id}/refresh`); await ctx.refresh(); } catch (e) { toast(e.message, "err"); } } } }, "Yêu cầu dữ liệu mới"),
    r.code === "presence" && h("button", { class: "btn small ghost needs-checks", style: "margin-top:8px", disabled: state.checks.size < 3, on: { click: async () => {
      const ok = await confirmDialog({ title: "Đóng sự cố dù hệ thống vẫn thấy người?", danger: true, ok: "Tôi xác nhận xe không có ai, đóng sự cố",
        message: "Chỉ làm khi bạn đang đứng cạnh xe và đã tự nhìn tận mắt. Cả gia đình sẽ được báo, việc này được ghi vào lịch sử, và nếu camera vẫn thấy người thì sự cố mới sẽ mở lại." });
      if (ok) await submit(inc, ctx, true); } } }, "Hệ thống nhầm? Đóng thủ công…"));
}

export function destroy() {
  stopLive();
  for (const { url } of pics.values()) if (url) URL.revokeObjectURL(url);
  pics.clear();
}

// Ticking a box only changes the buttons below it. Repainting the whole page here is what threw the reader back to the top.
function syncChecks() { document.querySelectorAll(".needs-checks").forEach((b) => { b.disabled = state.checks.size < 3; }); }

async function submit(inc, ctx, override) {
  try {
    const cur = await get(`/v1/incidents/${inc.id}`);
    const rev = state.reject ? cur.revision : inc.revision;
    const r = await post(`/v1/incidents/${inc.id}/confirm`, { revision: rev, checks: [...state.checks], override });
    if (r.result === "resolved") { state.done = r; state.overridden = override; state.reject = null; await ctx.refresh(false); }
    else state.reject = r.reject;
  } catch (e) { toast(e instanceof ApiError ? e.message : "Không gửi được.", "err"); }
  ctx.rerender();
}
