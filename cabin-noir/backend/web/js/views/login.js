import { post, auth } from "../api.js";
import { h, field, toast, busy } from "../ui.js";

export function render({ onDone }) {
  const box = h("div", { class: "box gap" });
  const phoneIn = h("input", { type: "tel", inputMode: "numeric", autocomplete: "tel", placeholder: "09xxxxxxxx", maxLength: 12 });
  const nameIn = h("input", { type: "text", autocomplete: "name", placeholder: "Tên của bạn (nếu lần đầu)", maxLength: 40 });
  const codeIn = h("input", { type: "text", inputMode: "numeric", autocomplete: "one-time-code", placeholder: "6 chữ số", maxLength: 6 });
  let phone = "";
  let tg = null;

  const stepPhone = () => {
    box.replaceChildren(
      h("div", { class: "center gap-s" }, h("img", { src: "logo.png", class: "logo-big", alt: "" }), h("h1", {}, "Cabin Noir"),
        h("p", { class: "muted", style: "margin:0" }, "Giám sát người, thú cưng và đồ vật bỏ quên trong xe. Chỉ giám sát, không điều khiển xe.")),
      field("Số điện thoại", phoneIn), field("Tên", nameIn),
      h("button", { class: "btn primary block", on: { click: (e) => busy(e.target, send) } }, "Gửi mã đăng nhập"),
      h("p", { class: "small muted center", style: "margin:0" }, "Mã gửi qua Telegram (hoặc kênh máy chủ cấu hình). Không chia sẻ mã cho ai."));
  };
  async function send() {
    phone = phoneIn.value.replace(/\s/g, "");
    try {
      const r = await post("/v1/auth/otp", { phone }, { anon: true });
      tg = r.telegram && r.telegram.deep_link ? r.telegram : null;
      if (r.dev_code) toast(`Chế độ thử: mã là ${r.dev_code}`, "ok");
      stepCode();
    } catch (e) { toast(e.message, "err"); }
  }
  const stepCode = () => {
    box.replaceChildren(...[h("h2", {}, "Nhập mã"), h("p", { class: "muted", style: "margin:0" }, `Mã có hiệu lực 5 phút. Số ${phone}.`),
      tg ? h("a", { class: "btn block", href: tg.deep_link, target: "_blank", rel: "noopener" }, "Mở Telegram để nhận mã") : null,
      tg ? h("p", { class: "small muted", style: "margin:0" }, "Đã liên kết Telegram thì mã tự gửi vào đó. Lần đầu: mở bot, bấm Start rồi chia sẻ số điện thoại để xác nhận số này là của bạn.") : null,
      field("Mã đăng nhập", codeIn),
      h("button", { class: "btn primary block", on: { click: (e) => busy(e.target, verify) } }, "Đăng nhập"),
      h("button", { class: "btn ghost block", on: { click: stepPhone } }, "Đổi số")].filter(Boolean));
    codeIn.focus();
  };
  async function verify() {
    try {
      const r = await post("/v1/auth/verify", { phone, code: codeIn.value.trim(), name: nameIn.value.trim() || undefined }, { anon: true });
      auth.set(r.token);
      await onDone();
    } catch (e) { toast(e.message, "err"); }
  }
  stepPhone();
  return h("div", { class: "login" }, box);
}
