# Cabin Noir (CabinSentinel mobile) 2.2

> Thư mục này là bản mobile cho **chủ xe và người thân**: app iOS (SwiftUI), web mobile (`backend/web`, phục vụ ở `/app/`) và backend riêng (FastAPI + SQLite, đăng nhập bằng số điện thoại + mã qua Telegram).
> Bản đang chạy: https://cabin-noir.duckdns.org/app/. Trang đăng nhập chung của Cabin (`/admin/login`, tab **User**) và đường `/user/login` dẫn sang đây.
> Không nằm trong npm workspaces và không thuộc phạm vi lint Python của CI gốc. Test riêng: `cd backend && pytest`.
> Không có trong repo: `.env`, cơ sở dữ liệu, bản dựng Xcode và video thử (`ios/CabinSentinel/Noir/DemoClips/`, chỉ giữ trên máy dev vì có thể có hình người thật).
> Tài liệu: `docs/USER_FLOWS.md` (luồng người dùng), `docs/QA_BAM_TAY_V2.2.md` (bấm thử), `docs/AUDIT_V2.2.md` (bảo mật).

Ứng dụng iOS (SwiftUI) và backend (FastAPI + SQLite) cho CabinSentinel: cảnh báo người hoặc thú cưng bị bỏ lại trong xe, đưa đón con, điều hòa từ xa, gia đình, thiết bị. Chưa có phần cứng thật nên backend có **bộ mô phỏng xe**.

## Chạy

```bash
./run_backend.sh
```

Mở `ios/CabinSentinel.xcodeproj` trong Xcode, chọn một iPhone Simulator, bấm Run. Mặc định app gọi `http://127.0.0.1:8000`. Trên iPhone thật, đổi địa chỉ máy chủ trong Tài khoản › Máy chủ thành IP máy Mac (cùng Wi‑Fi).

Đăng nhập bằng bất kỳ số 10 chữ số bắt đầu bằng 0. Bản dùng thử hiện mã OTP ngay trên màn hình. Mã thiết bị thử: `CS-VF8-2026`, `CS-VF6-2026`, `CS-VF9-2026`.

## Thử luồng

Ở Trang chủ, khối **Chế độ dùng thử** đổi dữ liệu xe: Cảnh báo, Nghiêm trọng, Đã đưa người ra, Camera bị che, Mất kết nối, Pin yếu, Quên đồ, Tắt máy khi bé còn trên xe, Điều hòa lỗi. Tab Đưa đón có các nút mô phỏng chuyến đi. Tắt chế độ này trong Tài khoản.

## Kiến trúc

| Phần | Nội dung |
|---|---|
| `backend/app/logic.py` | Luật đánh giá cabin, vòng đời sự cố, leo thang 6 bước theo thời gian, điều hòa, trạng thái bảo vệ. Dữ liệu cũ hoặc mất kết nối không bao giờ thành “an toàn”. |
| `backend/app/main.py` | API: đăng nhập OTP, liên kết xe, trạng thái, sự cố (xem, xác nhận có kiểm tra revision và dữ liệu mới), lịch sử, điều hòa, camera, gia đình và quyền, các bé, người liên hệ, đưa đón, mô phỏng. |
| `ios/CabinSentinel/Core` | API client, model, phiên đăng nhập (Keychain), polling 3 giây, thông báo cục bộ. |
| `ios/CabinSentinel/Features` | Các màn: làm quen, Trang chủ, 3 bước cảnh báo, xác nhận, điều hòa, camera, sơ đồ ghế, thiết bị, nhắc khi rời xe, đưa đón, lịch sử, tài khoản, gia đình, các bé. |

Quyền: Chủ xe toàn quyền; Xem và xác nhận được xác nhận sự cố, bật điều hòa, xem camera; Chỉ xem chỉ đọc; Chỉ đưa đón chỉ thấy chuyến của bé. Ứng dụng không mở khóa xe.

## Kiểm thử

```bash
cd backend && .venv/bin/python -m pytest -q
```

## Chưa có trong bản này

- Thông báo đẩy thật (APNs) cần tài khoản Apple Developer; hiện dùng thông báo cục bộ khi app đang chạy.
- SMS và gọi tự động trong leo thang là mô phỏng.
- Camera là hình mô phỏng, chưa có luồng video thật.
- Chưa kết nối thiết bị trong xe thật.

Ảnh xe: VinFast VF 8 · Alexander-93 và VF 6 · Ethan Llamas, Wikimedia Commons (CC BY-SA 4.0); đã tách nền, đổi màu.
