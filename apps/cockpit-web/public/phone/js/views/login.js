// Demo sign-in in the iOS style: phone number, then a one-time code. There is no SMS and no real account behind it: the bridge hands the
// code back and it is shown on screen, so a judge can sign in in two taps. Nothing typed here leaves this page (the bridge answers locally).
import { post, auth } from "../api.js";
import { h, toast, busy } from "../ui.js";

const DEMO_PHONE = "0900000068", DEMO_NAME = "Chủ xe demo";

export function render({ onDone }) {
  const box = h("div", { class: "box gap login-box" });
  const phoneIn = h("input", { type: "tel", inputMode: "numeric", autocomplete: "tel", placeholder: "09xx xxx xxx", maxLength: 12, "aria-label": "Số điện thoại" });
  const nameIn = h("input", { type: "text", autocomplete: "name", placeholder: "Không bắt buộc", maxLength: 40, "aria-label": "Tên" });
  const codeIn = h("input", { type: "text", class: "otp", inputMode: "numeric", autocomplete: "one-time-code", placeholder: "••••••", maxLength: 6, "aria-label": "Mã đăng nhập" });
  let phone = "", code = "";

  const hero = (title, sub) => h("div", { class: "login-hero" }, h("img", { src: "logo.png", class: "logo-big", alt: "" }), h("h1", {}, title), h("p", { class: "muted", style: "margin:0" }, sub));
  const row = (label, input) => h("label", { class: "frow" }, h("span", {}, label), input);

  const stepPhone = () => {
    box.replaceChildren(
      hero("Cabin Noir", "Giám sát người, thú cưng và đồ vật bỏ quên trong xe. Chỉ giám sát, không điều khiển xe."),
      h("div", { class: "group-form" }, row("Số điện thoại", phoneIn), row("Tên", nameIn)),
      h("button", { class: "btn primary block", on: { click: (e) => busy(e.currentTarget, send) } }, "Tiếp tục"),
      h("button", { class: "btn tinted block", on: { click: (e) => busy(e.currentTarget, async () => { phoneIn.value = DEMO_PHONE; nameIn.value = DEMO_NAME; await send(); }) } }, "Dùng tài khoản demo"),
      h("p", { class: "small muted center", style: "margin:0" }, "Bản demo: không gửi SMS và không có tài khoản thật. Mã đăng nhập hiện sẵn trên màn hình."));
  };

  async function send() {
    phone = phoneIn.value.replace(/\s/g, "");
    if (!/^0\d{9}$/.test(phone)) { toast("Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.", "err"); return; }
    try { const r = await post("/v1/auth/otp", { phone }, { anon: true }); code = r.dev_code || ""; stepCode(); } catch (e) { toast(e.message, "err"); }
  }

  const stepCode = () => {
    codeIn.value = code;
    box.replaceChildren(
      hero("Nhập mã", `Mã gồm 6 chữ số cho số ${phone}.`),
      h("div", { class: "group-form" }, codeIn),
      h("p", { class: "demo-note" }, code ? `Demo: mã ${code.slice(0, 3)} ${code.slice(3)} đã được điền sẵn.` : "Nhập mã đã nhận."),
      h("button", { class: "btn primary block", on: { click: (e) => busy(e.currentTarget, verify) } }, "Đăng nhập"),
      h("button", { class: "btn plain block", on: { click: stepPhone } }, "Đổi số điện thoại"));
  };

  async function verify() {
    try {
      const r = await post("/v1/auth/verify", { phone, code: codeIn.value.trim(), name: nameIn.value.trim() || undefined }, { anon: true });
      auth.set(r.token);
      location.hash = "#/home";                         // a new sign-in always starts on Home, never on the last user's page
      await onDone();
    } catch (e) { toast(e.message, "err"); }
  }

  stepPhone();
  return h("div", { class: "login" }, box);
}
