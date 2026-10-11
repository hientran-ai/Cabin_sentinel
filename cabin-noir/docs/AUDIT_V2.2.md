# Báo cáo kiểm tra v2.2: luồng đầu cuối, bảo mật, chức năng

Ngày: 11/10/2026. Phạm vi: backend + web trên máy chủ Lightsail, app iOS "Cabin Noir 2.2". Phần nào chạy thật, phần nào chỉ đọc mã đều ghi rõ.

## 1. Kết quả tóm tắt
| Hạng mục | Kết quả | Cách kiểm |
|---|---|---|
| Test tự động backend | 71/71 đạt (68 cũ + 3 mới) | chạy thật |
| Luồng đầu cuối (thiết bị → cảnh báo → xem → nhật ký → báo cáo → CSV) | Đạt | test `test_end_to_end_then_...` |
| Chặn truy cập chéo (người lạ, token thiết bị, không token) | Đạt trên 18 đường dẫn của xe + 3 đường của tài khoản | test chạy thật |
| Dò máy chủ thật (chỉ đọc) | 1 lỗi đã sửa; còn 4 điểm nhỏ | `curl`, `openssl` |
| Rà mã iOS | Không thấy log lộ token, ATS chặt, token trong Keychain | đọc mã |
| Bấm thử từng nút trên giao diện | **Chưa làm** trong lượt này | xem mục 5 |

## 2. Luồng đầu cuối (đã chạy trong test)
1. Đăng nhập bằng OTP (mã đi qua kênh riêng, không trả về trong phản hồi).
2. Tạo xe → mã ghép thiết bị dùng một lần → ghép thiết bị.
3. Thiết bị gửi khung hình có trẻ ở ghế sau → sinh sự cố mức nghiêm trọng, gửi thông báo.
4. Chủ xe xem trực tiếp: chỉ nhận **khung bao (box) 0..1**, không có ảnh.
5. Chủ xe xem sự cố → người trong xe biến mất → xác nhận 3 mục kiểm tra → đóng "confirmed".
6. Nhật ký cabin: dòng mở rồi niêm phong, chuỗi băm toàn vẹn, thời lượng đo được, nguồn "đo thật".
7. Báo cáo sự cố, CSV, thống kê, tổng quan, chuông thông báo đều đọc được đúng dữ liệu.
8. Xóa xe → xóa luôn nhật ký (test `deleting_the_vehicle_deletes_its_log`).
9. Video thử: luôn ghi nhãn **mô phỏng**, không bao giờ là "đo thật".

## 3. Bảo mật
### Đã kiểm trên máy chủ thật (không ghi dữ liệu)
- TLS 1.3, chứng chỉ hợp lệ đến 04/01/2027; HTTP chuyển hướng 308 sang HTTPS.
- Tiêu đề: HSTS, CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, COOP.
- Mọi đường dẫn `/v1/...` đã thử đều trả 401 khi không có token hoặc token giả.
- `/.env`, `/app/.env`, thử vượt thư mục (`..`, `%2e%2e`) → 404. `TRACE` → 405.
- CORS: nguồn lạ (`evil.example`) không được cấp header cho phép; không dùng cookie.
- Body 3 MB → 413 (giới hạn kích thước hoạt động).

### Phát hiện và xử lý
| # | Mức | Phát hiện | Trạng thái |
|---|---|---|---|
| 1 | Trung bình | `/docs`, `/redoc`, `/openapi.json` công khai trên production, lộ bản đồ toàn bộ API | **Đã sửa và triển khai.** Production trả 404; có test riêng |
| 2 | Thấp | `/health` công khai cho biết chế độ OTP (`ntfy_admin`), địa chỉ dịch vụ đẩy, bản build | Còn. Nên rút gọn chỉ còn `status` và `version` |
| 3 | Thấp | CSP cho phép `style-src 'unsafe-inline'` | Còn. Cần chuyển style nội tuyến ra tệp mới bỏ được |
| 4 | Thấp | App tin vào chứng chỉ hệ thống, chưa ghim chứng chỉ | Chấp nhận được ở giai đoạn này |
| 5 | Cần bạn làm | Token bot Telegram từng dán vào chat | **Nên thu hồi**: BotFather `/revoke`, rồi cập nhật `.env` trên máy chủ |
| 6 | Cần bạn làm | `CABIN_SECRET` bị in ra trong nhật ký thao tác của mình (lúc kiểm container) | Không chia sẻ ảnh phần đó; có thể đổi khóa (mọi phiên đăng nhập sẽ mất) |

### Đã kiểm bằng test (chạy thật, trong môi trường production giả lập)
- Người dùng khác không đọc, sửa, xóa hay mời vào xe của người khác. Phản hồi là 403 hoặc 404, không tiết lộ id có tồn tại.
- Token thiết bị không dùng được ở API người dùng và ngược lại.
- Đăng xuất làm token hết hiệu lực. Token và mã OTP không lưu dạng rõ (HMAC).
- OTP có giới hạn tần suất, trả lời không tiết lộ số đã đăng ký hay chưa. Webhook Telegram cần mã bí mật trong đường dẫn.
- Đầu vào xấu: box sai, chuỗi SQL, thẻ script, chuỗi 5000 ký tự, tham số lạ → bị từ chối hoặc lưu an toàn, bảng vẫn còn nguyên.
- Sản xuất không có mô phỏng, không có lối tắt dev.

### Đọc mã
- SQL: toàn bộ giá trị người dùng đi qua tham số. Chỗ nối chuỗi chỉ có tên bảng và cột cố định trong mã (xóa theo hạn lưu, di chuyển schema).
- Web: chỉ dùng `textContent`, không có `innerHTML`/`eval`, nên dữ liệu từ máy chủ không chèn được mã.
- iOS: token ở Keychain (`AfterFirstUnlockThisDeviceOnly`); bản sao trong UserDefaults chỉ có ở **Simulator**, không có trên máy thật. ATS chỉ cho phép mạng cục bộ. Không có `print` lộ token (chỉ có trong công cụ đo Bench và một dòng lỗi Live Activity).
- Ảnh: app chỉ tải ảnh khi người dùng tự chụp và xác nhận (`PhotoCaptureView`); video thử phát từ bản sao trong app, không qua máy chủ.

## 4. Tuân thủ SR-01…SR-10 (phần liên quan)
- Ảnh gốc không rời thiết bị: đạt. Live view chỉ gửi box.
- Dữ liệu mới có hạn lưu và cách xóa: nhật ký cabin lưu 365 ngày, nằm trong xuất dữ liệu và xóa tài khoản.
- Số liệu có nhãn đo thật, mô phỏng, hoặc không rõ: đạt (video thử là "Mô phỏng").
- Chưa kiểm: checklist §8 của PR (chưa có PR).

## 5. Chức năng và nút
Kiểm bằng **kiểm kê trong mã** và test API. Chưa bấm tay từng nút trên iPhone và web trong lượt này.

App iOS (Noir): khoảng 29 nút ở màn hình Xe, 7 ở Lịch sử, 4 ở chuông, 2 ở xem trực tiếp, 2 ở nhật ký, 1 bộ chia sẻ CSV, 4 tab (Xe, Đưa đón, Lịch sử, Tài khoản).
Đã xác minh bằng Simulator hoặc ảnh bạn gửi: Lịch sử (hai tab, 7/30/90 ngày), chuông, cặp nút góc phải, dòng nhật ký.
Mới sửa nhưng chưa tự bấm: chi tiết dòng "Video thử" có phát video, thanh 30/90 ngày, icon chọn xe.
Web: khoảng 85 điểm bấm trong các màn hình. Đã kiểm trước đó trong trình duyệt: lịch sử, chuông, xem trực tiếp, báo cáo, CSV, thông báo cập nhật.

## 6. Việc nên làm tiếp
1. Thu hồi token bot Telegram, đổi `CABIN_SECRET` (mục 3, #5 và #6).
2. Rút gọn `/health` (mục 3, #2).
3. Một lượt bấm tay toàn bộ nút trên iPhone và web, ghi kết quả.
4. Mở PR và điền checklist §8 khi đưa vào nhánh chính.
