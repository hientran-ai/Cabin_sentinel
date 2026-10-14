// First-run setup: add a car, pair the in-car device, turn alerts on. Shared by Home (checklist) and Account (the same actions).
import { get, post } from "../api.js";
import { h, icon, toast, sheet, field, busy } from "../ui.js";
import * as wp from "../webpush.js";

export const deviceUrl = (code) => new URL(code ? `device/#code=${encodeURIComponent(code)}` : "device/", location.href).href;

/** Open (or reuse) the in-car device page in its own tab. It talks to the same server, so the two tabs stay in sync through it. */
export function openDevice(code) {
  const w = window.open(deviceUrl(code), "cn-device");
  if (!w) toast("Trình duyệt chặn cửa sổ mới. Cho phép cửa sổ bật lên rồi bấm lại.", "err");
}

export function addVehicle(refresh, rerender) {
  return sheet((close) => {
    const name = h("input", { type: "text", maxLength: 40, placeholder: "Ví dụ: SUV gia đình" });
    const model = h("select", {}, ["VinFast VF 8", "VinFast VF 6", "VinFast VF 9", "VinFast VF 3", "Khác"].map((m) => h("option", {}, m)));
    const plate = h("input", { type: "text", maxLength: 16, placeholder: "30A-123.45" });
    const color = h("select", {}, [["white", "Trắng"], ["black", "Đen"], ["red", "Đỏ"]].map(([k, t]) => h("option", { value: k }, t)));
    return h("div", { class: "gap" }, field("Tên xe", name), field("Dòng xe", model), field("Biển số", plate), field("Màu", color),
      h("button", { class: "btn primary block", on: { click: (e) => busy(e.target, async () => {
        try {
          await post("/v1/vehicles", { name: name.value.trim(), model: model.value, plate: plate.value.trim(), color: color.value });
          close(true); toast("Đã thêm xe. Bước tiếp theo: ghép thiết bị trong xe.", "ok"); await refresh(); rerender && rerender();
        } catch (er) { toast(er.message, "err"); }
      }) } }, "Thêm xe"));
  }, { title: "Thêm xe" });
}

/** One-time pairing code. The sheet closes by itself when the device on the other tab finishes pairing. */
export async function pairCode(vid, onPaired) {
  try {
    const before = (await get(`/v1/vehicles/${vid}/devices`).catch(() => [])).map((d) => d.id);
    const r = await post(`/v1/vehicles/${vid}/devices/pairing`);
    let stop = false;
    const poll = async () => {
      for (let i = 0; i < 300 && !stop; i++) {
        await new Promise((ok) => setTimeout(ok, 2000));
        const now = await get(`/v1/vehicles/${vid}/devices`).catch(() => null);
        if (now && now.some((d) => !before.includes(d.id))) { stop = true; toast("Thiết bị trong xe đã ghép xong.", "ok"); document.querySelector(".scrim") && document.querySelector(".scrim").remove(); onPaired && onPaired(); }
      }
    };
    poll();
    await sheet(() => h("div", { class: "gap center" },
      h("p", { class: "muted", style: "margin:0" }, `Nhập mã này trên thiết bị trong xe trong ${Math.round(r.expires_in / 60)} phút. Dùng một lần.`),
      h("div", { class: "card", style: "font:700 32px ui-monospace,monospace;letter-spacing:.1em" }, r.code),
      h("a", { class: "btn primary block", href: deviceUrl(r.code), target: "cn-device" }, "Mở trang thiết bị ↗"),
      h("button", { class: "btn block", on: { click: async () => { try { await navigator.clipboard.writeText(r.code); toast("Đã chép mã.", "ok"); } catch { toast("Không chép được. Hãy nhập tay.", "err"); } } } }, "Chép mã"),
      h("p", { class: "small muted", style: "margin:0" }, "Cửa sổ này tự đóng khi thiết bị ghép xong.")), { title: "Mã ghép thiết bị" });
    stop = true;
  } catch (e) { toast(e.message, "err"); }
}

/** Home checklist for an owner who has not finished setup. Disappears once every step is done. */
export function setupCard(s, { refresh, rerender }) {
  if (s.role !== "owner") return null;
  const hasDevice = s.source === "device" || !!s.device;
  const pushOn = wp.wanted() && typeof Notification !== "undefined" && Notification.permission === "granted";
  const steps = [
    ["Thêm xe", true, null],
    ["Ghép thiết bị camera trong xe", hasDevice, h("button", { class: "btn small primary", on: { click: () => pairCode(s.vehicle.id, refresh) } }, "Tạo mã ghép")],
    ["Bật thông báo trên máy này", pushOn, h("a", { class: "btn small", href: "#/account" }, "Mở Tài khoản")],
  ];
  if (steps.every(([, done]) => done)) return null;
  return h("section", { class: "card gap setup" }, h("h2", {}, "Hoàn tất thiết lập"),
    h("div", { class: "list" }, steps.map(([t, done, act], i) => h("div", { class: `item ${done ? "done" : ""}` },
      h("span", { class: `stepno ${done ? "ok" : ""}` }, done ? icon("check") : String(i + 1)), h("div", { class: "grow" }, t), !done && act))),
    !hasDevice && h("p", { class: "small muted", style: "margin:0" }, "Chưa ghép thiết bị thì app không có dữ liệu thật và sẽ không coi xe là an toàn."));
}
