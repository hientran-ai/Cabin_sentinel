// Guide shown beside the phone frame on a computer. Left: the five steps to try the whole system, ticked off from the real state.
// Right: what the screen you are looking at does, plus the live state of the car. Nothing here changes data except the
// one "create pairing code and open the device tab" shortcut.
import { post } from "./api.js";
import { h, fmt, toast } from "./ui.js";
import { side } from "./frame.js";
import { deviceUrl, pairCode } from "./views/setup.js";
import * as wp from "./webpush.js";

const HELP = {
  login: ["Đăng nhập", ["Nhập số điện thoại, bấm Gửi mã. Mã đến qua Telegram (bản thử nội bộ có thể điền sẵn trên màn hình).", "Lần đầu: nhập thêm tên. Lần sau chỉ cần số điện thoại, mọi thứ đã thiết lập vẫn còn.", "Đăng nhập xong luôn vào màn hình Xe."]],
  home: ["Xe", ["Thẻ lớn: kết luận của máy chủ (An toàn / Cảnh báo / Nghiêm trọng / Chưa có dữ liệu). “Chưa có dữ liệu” không bao giờ được hiểu là an toàn.", "Trong xe: camera đang thấy bao nhiêu người, trẻ em, thú cưng (cả khoang, không chia ghế). Không thấy gì không có nghĩa là xe trống.", "Làm mới dữ liệu: bắt thiết bị gửi ngay. Xem camera: chỉ có khung nhận diện, không có ảnh.", "Tạm dừng giám sát: tối đa 60 phút, tự bật lại, không dùng được khi có sự cố mở."]],
  incident: ["Sự cố", ["Mở khi camera thấy người hoặc thú trong xe đỗ. Sự cố chỉ đóng khi có người xác nhận đã tự kiểm tra xe.", "Đã xem chỉ ghi nhận, không đóng sự cố. Gọi 112 mở bàn phím gọi, app không tự gọi.", "Dòng thời gian cho biết thông báo nào đã gửi, thông báo nào bị bỏ qua và vì sao."]],
  school: ["Đưa đón", ["Dành cho phụ huynh đưa đón: chọn bé, đặt giờ, bấm các bước lên xe và tới trường.", "Phải bấm “Đã tới nơi” và “Đã xuống xe” thì chuyến mới đóng."]],
  history: ["Lịch sử", ["Dải ngày 7 / 30 / 90 ngày: chọn một ngày để xem các lần xe có người hoặc thú.", "Độ phủ dữ liệu cho biết thiết bị có mặt bao lâu. Khoảng không có dữ liệu không phải khoảng “trống”.", "Báo cáo và Nhật ký truy cập nằm cuối trang."]],
  check: ["Kiểm tra xe", ["Xác nhận bạn đã tự kiểm tra các ghế, sàn xe và cốp trước khi đóng sự cố."]],
  report: ["Báo cáo", ["Bản tóm tắt để in hoặc lưu. Số liệu ghi rõ đo thật hay mô phỏng."]],
  account: ["Tài khoản", ["Xe, Thiết bị trong xe, Gia đình, Người liên hệ khẩn cấp: mọi thiết lập nằm ở đây.", "Thông báo: bật “Thông báo trên máy này” rồi Gửi thử. Telegram dùng cùng lúc nếu đã liên kết.", "Đăng xuất chỉ thoát phiên này. Thiết bị trong xe vẫn chạy bình thường vì có khóa riêng.", "Xuất dữ liệu và Xóa tài khoản nằm cuối trang."]],
};

const card = (...k) => h("div", { class: "pcard" }, ...k);
const kv = (a, b) => h("div", { class: "kv" }, h("span", {}, a), h("b", {}, b));

async function quickPair(S, refresh) {
  const w = window.open("", "cn-device");
  if (!w) { pairCode(S.vid, refresh); return; }                    // pop-ups blocked: show the code with a link to open instead
  try {
    const r = await post(`/v1/vehicles/${S.vid}/devices/pairing`);
    w.location.href = deviceUrl(r.code);
    toast("Đã mở tab thiết bị với mã ghép. Bấm Ghép nối ở tab đó.", "ok");
    setTimeout(refresh, 6000);
  } catch (e) { w.close(); toast(e.message, "err"); }
}

function steps({ S, refresh }) {
  const st = S.status, owner = st && st.role === "owner";
  const paired = !!st && (st.source === "device" || !!st.device);
  const pushOn = wp.wanted() && typeof Notification !== "undefined" && Notification.permission === "granted";
  const list = [
    ["Đăng nhập", "Bằng số điện thoại và mã. Đăng nhập lại sau này không mất thiết lập.", !!S.me, null],
    ["Thêm xe", "Tài khoản → Thêm xe (hoặc nút ở màn hình Xe).", S.vehicles.length > 0, null],
    ["Ghép thiết bị trong xe", "Mở một tab riêng đóng vai camera trong xe. Hai tab nối với nhau qua máy chủ.", paired,
      S.vid && owner ? [h("button", { class: "gbtn", on: { click: () => quickPair(S, refresh) } }, "Tạo mã và mở thiết bị ↗"), paired && h("a", { class: "gbtn", href: deviceUrl(), target: "cn-device", style: "margin-left:6px" }, "Mở lại tab thiết bị")] : null],
    ["Bật thông báo", "Tài khoản → Thông báo trên máy này → Gửi thử.", pushOn, null],
    ["Thử một tình huống", "Ở tab thiết bị bấm “Có trẻ trong xe”. Tab này sẽ báo ngay, kèm banner như trên iPhone.", !!(st && st.incident), null],
  ];
  const firstTodo = list.findIndex((x) => !x[2]);
  return card(h("h3", {}, "Thử nhanh trong 5 bước"), ...list.map(([t, d, done, act], i) =>
    h("div", { class: `gstep ${done ? "done" : i === firstTodo ? "now" : ""}` }, h("div", { class: "gno" }, done ? "✓" : String(i + 1)),
      h("div", {}, h("div", { class: "gt" }, t), h("p", {}, d), act))));
}

const roles = () => card(h("h3", {}, "Ba vai trò, một máy chủ"),
  h("ul", {}, h("li", {}, h("b", {}, "Người dùng"), ": khung điện thoại ở giữa. Nhận cảnh báo, xử lý sự cố."),
    h("li", {}, h("b", {}, "Thiết bị trong xe"), ": ", h("a", { href: deviceUrl(), target: "cn-device", style: "color:#f5c518" }, "tab riêng"), ". Gửi nhãn, độ tin cậy, vị trí khung. Không gửi ảnh, trừ khi chủ xe bật ảnh kèm cảnh báo (mặt người được che ngay trên máy)."),
    h("li", {}, h("b", {}, "Quản trị"), ": bảng điều hành vận hành, ở dịch vụ riêng của nhóm.")),
  h("p", {}, "Mở nhiều tab cùng lúc được: mỗi tab giữ phiên của mình, mọi thay đổi đi qua máy chủ."));

function live(S) {
  const st = S.status;
  if (!st) return null;
  const on = st.connection === "online";
  const inc = st.incident;
  return card(h("h3", {}, "Trạng thái xe (trực tiếp)"),
    kv("Xe", `${st.vehicle.name}`),
    kv("Thiết bị", h("span", {}, h("i", { class: `dot ${on ? "on" : "bad"}` }), st.device ? `${st.device.label}${st.device.battery != null ? ` · pin ${st.device.battery}%` : ""}` : "chưa ghép")),
    kv("Kết nối", st.last_seen ? `${on ? "trực tuyến" : "ngoại tuyến"} · ${fmt.ago(st.last_seen)}` : "chưa có dữ liệu"),
    kv("Camera", st.camera === "blocked" ? "bị che" : st.camera === "ok" ? "bình thường" : "không rõ"),
    kv("Kết luận", h("span", {}, h("i", { class: `dot ${inc ? "bad" : st.verdict && st.verdict.level === "safe" ? "on" : "warn"}` }), (st.verdict && st.verdict.title) || "–")),
    inc && kv("Sự cố", inc.level === "critical" ? "Nghiêm trọng" : "Cảnh báo"),
    st.paused_until && st.paused_until > Date.now() / 1000 && kv("Giám sát", `tạm dừng tới ${fmt.clock(st.paused_until)}`));
}

export function update({ route, S, refresh }) {
  if (!side.left || !side.right) return;
  // Rebuilding under the pointer would swallow a click on a guide button; the next refresh catches up.
  if (side.left.matches(":hover") || side.right.matches(":hover")) return;
  const name = S.me ? (route && HELP[route.name] ? route.name : "home") : "login";
  const [title, bullets] = HELP[name];
  side.left.replaceChildren(S.me ? steps({ S, refresh }) : card(h("h3", {}, "Cách hoạt động"),
    h("p", {}, "Thiết bị camera trong xe → máy chủ → điện thoại của bạn."), h("p", {}, "Camera chỉ nhận diện ngay trên thiết bị. Máy chủ nhận nhãn và độ tin cậy, không bao giờ nhận ảnh.")), roles());
  side.right.replaceChildren(card(h("h3", {}, "Đang xem"), h("h4", {}, title), h("ul", {}, bullets.map((b) => h("li", {}, b)))),
    live(S),
    card(h("h3", {}, "Nhớ khi thử"), h("ul", {},
      h("li", {}, "Thấy trẻ, người hoặc thú trong xe khi máy tắt: cảnh báo ngay. Có cảm biến nhiệt ≥ 35°C: Nghiêm trọng."),
      h("li", {}, "Thiết bị im lặng quá 2 phút: app báo ngoại tuyến, không coi là an toàn."),
      h("li", {}, "Số liệu từ tab thiết bị ở chế độ Giả lập luôn ghi nhãn MÔ PHỎNG."))));
}
