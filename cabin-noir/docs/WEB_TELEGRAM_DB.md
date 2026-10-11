# Web app, Telegram và nâng cấp cơ sở dữ liệu

## Triển khai (Lightsail, thư mục `~/cabin-noir`)
1. Đóng gói: `tar --exclude=.venv --exclude=.env --exclude='*.db*' --exclude=media --exclude=data --exclude=__pycache__ -czf cabin-backend.tgz backend`
2. `scp` lên máy chủ, giải nén đè vào `~/cabin-noir` (giữ nguyên `backend/.env`).
3. Thêm vào `backend/.env`:
   - `CABIN_SECRET=` chuỗi ngẫu nhiên dài (`openssl rand -hex 32`). Bắt buộc ở production để mã một lần hợp lệ qua các lần khởi động lại.
   - `TELEGRAM_BOT_TOKEN=` (từ @BotFather), `TELEGRAM_BOT_USERNAME=`
   - `WEB_BASE_URL=https://<tên miền>/app` (nút "Mở Cabin Noir" trong tin Telegram)
4. `docker compose up -d --build`. Lần chạy đầu, `migrations.py` tự nâng DB cũ lên v4 (khóa ngoại, chỉ mục, bảng mới, băm token). **Sao lưu DB trước**: `python backup_db.py /data/cabinsentinel.db /data/backups`.
5. Web chạy ở `https://<tên miền>/app/` (cùng nguồn với API, không cần CORS).

## Telegram
Tạo bot bằng @BotFather, lấy token. Người dùng vào Tài khoản → Thông báo → Liên kết Telegram, bấm Start. Mặc định dùng long polling (không cần mở cổng). Muốn dùng webhook: đặt `TELEGRAM_WEBHOOK_SECRET` rồi gọi `setWebhook` tới `/v1/telegram/webhook/<secret>`.
Kênh: `auto` (Telegram nếu đã liên kết, lỗi thì quay về ntfy), `telegram`, `ntfy`, `both`. Tin nhắn chỉ có tên xe, biển số và nội dung cảnh báo.

## Cơ sở dữ liệu (so với bản của nhóm)
| Điểm yếu đã nêu | Cách xử lý | Trạng thái |
|---|---|---|
| Sự cố không có bảng riêng | `incidents` có vòng đời đầy đủ (viewed, resolved_by, revision) + `events` có `at` và chỉ mục | đã kiểm thử |
| Hai kho SQLite | Một DB duy nhất | đã kiểm thử |
| Không khóa ngoại, không migration | `migrations.py` (PRAGMA user_version, v1→v4), khóa ngoại + cascade, WAL | đã kiểm thử, gồm nâng cấp DB cũ có dữ liệu mồ côi |
| Thiếu chỉ mục, mảng JSON | 16 chỉ mục; thành viên là bảng `members` thay mảng JSON | đã kiểm thử |
| `samples` nghèo | `observations`: người, trẻ (gợi ý), thú, đồ vật, ghế, nhiệt độ; chỉ lưu số lượng | đã kiểm thử |
| Không có sổ giao thông báo / nơi lưu Telegram | `deliveries` (chống gửi trùng, thử lại) + `telegram_links` | đã kiểm thử |
| Đưa đón, vị trí, điểm đến không có chỗ | `children`, `trips`, `locations` (hành trình), geofence trong trạng thái xe | đã kiểm thử |
| Email/mật khẩu, evidence BLOB | Giữ đăng nhập số điện thoại + OTP (băm HMAC). Ảnh lưu file + `media` (sha256, hạn 30 ngày), xóa được | OTP/ảnh đã kiểm thử; **không** thêm email/mật khẩu |
Mượn từ DB nhóm: `audit_log` (cùng cột), trần heartbeat 1000 dòng/thiết bị, hạn lưu bằng chứng. **Không** mượn: `commands` với loại `unlock` (trái quy tắc "không điều khiển xe").

## Lưu trữ và xóa
observations và locations 7 ngày, ảnh 30 ngày, events 180 ngày, deliveries 30 ngày, nhật ký truy cập 365 ngày. `history.purge` chạy mỗi giờ. Người dùng: `GET /v1/me/export`, `DELETE /v1/me` (xóa tài khoản + xe do mình làm chủ), `DELETE .../photos/{id}`.

## Bảo mật đã làm (có kiểm thử)
Token và OTP chỉ lưu dạng băm; thu hồi phiên, đăng xuất mọi thiết bị; giới hạn tốc độ theo địa chỉ (auth 12/phút, API 240/phút); trần kích thước body; CSP, X-Frame-Options, nosniff, HSTS (production), `Cache-Control: no-store` cho API; nhật ký truy cập không lưu nội dung; container chạy không phải root, hệ thống tệp chỉ đọc, bỏ mọi capability thừa. **Chưa làm / chưa kiểm chứng:** build Docker chưa chạy thử trên máy này; kiểm thử xâm nhập; xoay vòng khóa `CABIN_SECRET`; giới hạn tốc độ dùng chung nhiều tiến trình (hiện một worker).

## Hiệu năng (đo trên máy dev, 16 luồng, 1 worker, cục bộ)
Thông lượng ≈ 1.550 req/s mới so với ≈ 1.580 req/s cũ: **ngang nhau**. Endpoint chỉ đọc nhẹ (history, me) nhanh hơn ~30% độ trễ; mỗi request tốn thêm ~1–2 ms cho lớp bảo mật. `python3 scripts/bench.py http://127.0.0.1:8765 16 8`.
