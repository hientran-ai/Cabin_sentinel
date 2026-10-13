# Chính sách bảo mật

CabinSentinel là hệ thống cảnh báo trẻ em bị bỏ quên trong xe. Một lỗ hổng ở đây có thể ảnh hưởng đến an toàn, không chỉ dữ liệu.
Tài liệu này nói rõ cách báo lỗi, phạm vi, những gì đã được bảo vệ và những gì **chưa**.

## Báo cáo lỗ hổng

**Không** mở public issue cho lỗ hổng bảo mật.

Dùng [GitHub Security Advisories](https://github.com/AI20K-Build-Phase-Cohort-4/P-068/security/advisories/new)
của repository này để báo cáo riêng tư. Mô tả: loại lỗ hổng, endpoint hoặc file liên quan, các bước tái hiện, tác động bạn đánh giá.
Không gửi dữ liệu cá nhân thật hoặc ảnh người thật trong báo cáo.

- Phản hồi xác nhận trong 3 ngày làm việc, đánh giá và hẹn thời gian sửa trong 7 ngày làm việc.
- Lỗi có thể làm **mất cảnh báo cho xe đang có người** (bỏ qua luật, giả dữ liệu thiết bị, vượt quyền lệnh từ xa) được xử lý trước mọi lỗi khác.
- Bạn có thể thử trên môi trường demo công khai nhưng đừng làm gián đoạn dịch vụ, đừng truy cập dữ liệu của người khác, không tải tự động hàng loạt.

## Phạm vi

Trong phạm vi: backend FastAPI (`src/`), Cloudflare Worker (`workers/`), web chủ xe và web vận hành (`apps/`), thiết bị edge (`embedded/`).
Ngoài phạm vi: lỗi của dịch vụ bên thứ ba (Cloudflare, Hugging Face, ntfy, Telegram), tấn công vật lý lên thiết bị, DoS khối lượng lớn.

## Đã có (kiểm chứng bằng test, xem `tests/`)

| Vùng | Biện pháp |
|---|---|
| Tài khoản | Mật khẩu băm scrypt; khóa 15 phút sau 5 lần sai; access token 15 phút; refresh token xoay vòng, dùng lại token cũ thì thu hồi cả phiên; cookie HttpOnly + CSRF |
| Phân quyền | 4 vai trò + thiết bị; quyền sửa được và có audit; tài khoản staff theo tenant chỉ thấy tenant của mình; backend là nguồn quyết định mọi quyền (UI chỉ ẩn nút) |
| Lệnh từ xa | Yêu cầu, xác nhận, thiết bị nhận, thiết bị báo lại; mở khóa chỉ khi đang CRITICAL và cần người thứ hai nếu không phải chủ xe; tắt mặc định ở production (`REMOTE_COMMANDS_ENABLED`) |
| Thiết bị | Mã ghép dùng một lần, token riêng từng thiết bị chỉ ghi được cho một xe, thu hồi được |
| Ảnh và quyền riêng tư | Ảnh gốc không rời thiết bị; ảnh bằng chứng đã làm mờ mặt, truy cập qua URL ký 10 đến 300 giây, có thời hạn lưu và xóa |
| Audit | Mọi thay đổi ghi nhật ký, xuất CSV/JSONL, có xóa theo thời hạn |
| Bề mặt | `/docs`, `/redoc`, `/openapi.json` đóng ở production (`DOCS_ENABLED=true` để mở có chủ đích); CORS chỉ nhận origin liệt kê, không nhận `*` ở production; đăng ký công khai tắt ở production |
| Thông báo ra ngoài | ntfy/Telegram là tùy chọn, tắt mặc định; tin chỉ có mức rủi ro và mã xe, không có tên, số điện thoại, biển số hay ảnh; token Telegram không bao giờ ghi log hay trả về qua API; ntfy qua HTTP chỉ được phép với localhost |
| Worker (Cloudflare) | Tiêu đề bảo mật trên mọi phản hồi (HSTS, CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy); proxy `/api/*` không cache |

## Giới hạn đã biết (chưa làm, đừng coi là an toàn)

- Chưa có SSO/OIDC, chưa có 2FA cho tài khoản quản trị, chưa có quên mật khẩu hay xác minh email.
- SMS và push cho chủ xe chưa nối; kênh báo thật hiện là ntfy/Telegram. Lệnh còi/SMS/mở khóa là sổ ghi mà thiết bị xác nhận, chưa điều khiển xe thật.
- Việc làm mờ ảnh do thiết bị khai báo, server chưa kiểm lại.
- Số liệu giám sát nằm trong bộ nhớ tiến trình, mất khi khởi động lại.
- SQLite một nút. Dữ liệu chỉ bền khi database nằm trên volume (Docker `/app/data`) hoặc Persistent Storage của Hugging Face (`/data`); `/health` báo `storage.persistent`.
- Mô hình thị giác (YOLOv8n) chưa được đánh giá riêng cho trẻ em trong cabin; tuổi chỉ là bằng chứng, không đi vào luật rủi ro.
- Chế độ Demo studio (`DEMO_STUDIO=true`) tạo dữ liệu **mô phỏng** có nhãn SIMULATED. Chỉ bật trên môi trường demo, không bật trên hệ thống phục vụ xe thật.

## Cấu hình bí mật

- Bí mật chỉ nằm trong biến môi trường hoặc secret của nền tảng (Hugging Face Secrets, Cloudflare Secrets, GitHub Secrets), không bao giờ trong Git:
  `PLATFORM_SIGNING_KEY`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_OWNER_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `NTFY_TOPIC` (tên topic ntfy công khai hoạt động như mật khẩu của kênh).
- Đổi `PLATFORM_SIGNING_KEY` sẽ đăng xuất mọi phiên; đặt cố định để phiên sống qua lần khởi động lại.
- Tạo khóa: `python -c "import secrets; print(secrets.token_urlsafe(32))"`.

## Nếu bạn lỡ commit một API key

Xoá key khỏi file rồi commit tiếp là **chưa đủ** — giá trị cũ vẫn nằm trong git
history và trong mọi bản clone/fork đã tồn tại. Coi như key đã lộ hoàn toàn.

Làm theo thứ tự này:

1. **Xoay key ngay (rotate).** Đây là bước duy nhất thật sự vô hiệu hoá key cũ.
   Mọi bước còn lại chỉ là dọn dẹp.
2. Thay bằng placeholder trong file, commit.
3. Nếu cần xoá khỏi history, dùng
   [git-filter-repo](https://github.com/newren/git-filter-repo) rồi force-push.
   Lưu ý việc này viết lại history, mọi người phải re-clone.
4. Báo maintainer để kiểm tra fork và cache của GitHub.

## Bảo mật khi dùng template này

- **Không bao giờ** đặt key thật vào `.env.example` — file đó được commit.
  Key thật đặt trong `.env` (đã có trong `.gitignore`).
- `AI_LOG_API_KEY` là key **riêng của từng đội**, lấy từ link mời của BTC.
  Không chia sẻ, không commit.
- Trước khi push, tự kiểm tra nhanh:
  ```bash
  git diff --cached | grep -iE "api[_-]?key|secret|token|password"
  ```
- Thư mục `.ai-log/` chứa nội dung prompt của bạn. Kiểm tra trước khi public
  một repo có sẵn log — prompt có thể vô tình chứa dữ liệu nhạy cảm.
