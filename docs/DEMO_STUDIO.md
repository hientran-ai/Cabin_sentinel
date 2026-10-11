# Demo studio: thử toàn bộ luồng trên web

Mục tiêu: người nhận link chạy được cả chuỗi **thiết bị trong xe → backend → web vận hành → web chủ xe → thông báo ra điện thoại** mà không cần phần cứng.
Mọi dữ liệu do studio tạo đều mang nhãn `SIMULATED`; các luật rủi ro vẫn do `rules.py` quyết định, studio chỉ cấp đầu vào.

## Bật

| Biến | Giá trị cho môi trường demo | Ghi chú |
|---|---|---|
| `DEMO_STUDIO` | `true` | Chỉ quản trị nền tảng (admin không gắn tenant) dùng được. Tắt thì mọi endpoint trả 404 |
| `REMOTE_COMMANDS_ENABLED` | `true` | Lệnh còi/SMS/mở khóa chỉ là sổ ghi, không điều khiển xe thật. Bỏ bước này sẽ trả 423 |
| `BOOTSTRAP_ADMIN_EMAIL/PASSWORD` | secret | Tài khoản vận hành để vào `/admin` |
| `BOOTSTRAP_OWNER_EMAIL/PASSWORD` | secret | Chủ xe demo, thấy VF8-DEMO-01 và VF9-DEMO-02 |
| `PLATFORM_SIGNING_KEY` | secret cố định | Đổi khóa thì mọi phiên bị đăng xuất |
| `NTFY_TOPIC` hoặc `TELEGRAM_BOT_TOKEN`+`TELEGRAM_CHAT_ID` | tùy chọn | Bật kênh báo thật, xem bên dưới |

Một feeder trong tiến trình publish dữ liệu mô phỏng mỗi 2 giây cho 4 xe demo nên xe luôn Online; mặc định VF9 ở WARNING, còn lại SAFE.

## API (`/api/v1/admin/demo/*`, chỉ admin nền tảng)

- `GET status`: danh sách kịch bản, trạng thái từng xe, kênh thông báo và nhật ký gửi gần đây
- `POST run {vehicle_id, scenario}`: SAFE, WARNING, CRITICAL, RAMP (nóng dần), OFFLINE
- `POST reset`: xóa lịch sử, việc vận hành và lệnh của 4 xe demo, về kịch bản mặc định
- `POST notify-test`: gửi một tin thử qua kênh đã cấu hình

Mọi lần chạy ghi audit (`demo.run`, `demo.reset`, `demo.notify_test`).

## Luồng thử nghiệm

1. Admin vào Demo studio, bấm CRITICAL cho VF8-DEMO-01.
2. Sự cố mở trong Incidents; ntfy/Telegram nhận cảnh báo; trang chủ xe hiện sự cố.
3. Phân việc, ghi chú; yêu cầu và xác nhận lệnh còi.
4. Bấm SAFE; xác nhận đã kiểm tra cabin; đóng sự cố (chỉ đóng được khi bằng chứng cabin trống còn mới).
5. Thiết bị ảo: tạo mã ghép, ghép trong trình duyệt, gửi nhịp tim thật tới `POST /device/heartbeat`; Devices hiện Online.
6. Camera thật: chủ xe mở trang camera trực tiếp (ảnh xử lý trên backend, làm mờ mặt, theo cấu hình đồng ý).

OFFLINE không bao giờ hiện "xe trống": dữ liệu cũ dần rồi quyết định về UNKNOWN/ERROR (SR-01).

## Kênh thông báo thật

- **ntfy**: đặt `NTFY_TOPIC` (dài, ngẫu nhiên), cài app ntfy trên điện thoại và đăng ký topic đó. Máy chủ mặc định `https://ntfy.sh`; tự host thì đặt `NTFY_SERVER`.
- **Telegram**: tạo bot với @BotFather, đặt `TELEGRAM_BOT_TOKEN` (secret) và `TELEGRAM_CHAT_ID`.
- Tin chỉ gồm mức rủi ro, mã xe và lời nhắc kiểm tra, không có tên, số điện thoại, biển số, vị trí hay ảnh. Đây vẫn là dịch vụ nước ngoài: chỉ bật khi đã có căn cứ pháp lý cho môi trường đó (demo thì dùng mã xe giả lập).
- SMS cho người liên hệ khẩn cấp **chưa nối cổng SMS**: kết quả `send_sms` vẫn là `simulated`, nội dung leo thang được chuyển tiếp qua kênh trên và ghi chú rõ.
- Gửi nền trên luồng riêng, tối đa 5 giây mỗi kênh, lỗi không làm dừng vòng an toàn.

## Dữ liệu bền

Dữ liệu (tài khoản, sự cố, audit) nằm trong SQLite. Chỉ bền khi thư mục chứa DB là volume: Docker `-v cabinsentinel_data:/app/data` (docker-compose đã có), hoặc Hugging Face Persistent Storage (mount `/data`, `deploy/huggingface/app.py` tự dùng). `GET /health` trả `storage.persistent`; nếu `false`, trang System của vận hành hiện cảnh báo.
