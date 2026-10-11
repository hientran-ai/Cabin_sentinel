# Nhật ký cabin, báo cáo sự cố, tổng quan quản lý

Trả lời góp ý của mentor: ghi lại **mỗi lần bỏ quên và mỗi lần camera bị che, có thời lượng**, để ban giám khảo, doanh nghiệp và khách hàng xem lại được.
Phần admin (quản trị hệ thống) làm riêng, không nằm ở đây.

## Ghi gì
Bảng `cabin_log` (migration v6), một dòng cho mỗi lần xảy ra:

| `kind` | Khi nào | Bỏ qua nếu ngắn hơn |
|---|---|---|
| `left_behind` | Có sự cố (người, thú, đồ) khi xe đỗ. Là chính sự cố, mở và đóng cùng sự cố | không |
| `camera_blocked` | Xe đỗ, dữ liệu còn mới, camera không nhìn được ghế sau | 15 giây (tay lướt qua camera là nhiễu) |
| `device_offline` | Thiết bị đã từng báo dữ liệu thật rồi im quá 120 giây | 60 giây |

Mỗi dòng có: bắt đầu, kết thúc, thời lượng, ghế, mức độ, kết quả (`confirmed` / `manual_close`), nguồn số liệu (`measured` / `simulated` / `unknown`),
số giây tới khi có người xem (`ack_s`) và tới khi gửi được tin (`notify_s`).
Camera bị che hoặc mất dữ liệu **không bao giờ** được coi là xe trống (SR-01); chúng là sự kiện riêng và không hạ mức cảnh báo.

## Niêm phong
Khi một dòng đóng, nó nhận `hash = sha256(các trường chính + hash dòng trước của cùng xe)`. `GET /v1/vehicles/{id}/log/verify` tính lại chuỗi;
sửa một dòng bằng tay sẽ làm chuỗi gãy. Dòng đầu còn lại sau khi dọn dữ liệu cũ là mốc neo.
Chuỗi chỉ phát hiện sửa sau khi đã niêm phong. Nó **không** chống được người có toàn quyền ghi cả DB (họ có thể tính lại toàn bộ chuỗi).

## Endpoint (vai trò `owner`, `confirm`, `view`; `school` bị từ chối)
- `GET /v1/vehicles/{id}/log?days=&kind=` danh sách, thống kê, trạng thái chuỗi
- `GET /v1/vehicles/{id}/log.csv?days=` tệp CSV (cột tiếng Việt không dấu)
- `GET /v1/incidents/{id}/report` dòng thời gian, thông báo đã gửi và độ trễ, quan sát trong sự cố, sự kiện liên quan
- `GET /v1/me/overview?days=` số liệu gộp theo xe, xe cần chú ý xếp trước

## Xem trực tiếp khi xử lý sự cố, tự kiểm tra cabin
- `GET /v1/vehicles/{id}/live` (vai trò `owner`, `confirm`): các hộp nhận diện hiện tại, mỗi hộp là `[x, y, w, h]` trong khung hình (0..1), nhãn ghế, loại, độ tin cậy.
  Màn xử lý sự cố (web và app) gọi mỗi 2 giây và vẽ lên khung. **Server không có ảnh**: ảnh chụp từ camera không rời thiết bị trong xe (baseline P-068); `box` chỉ là vị trí.
- Dữ liệu cũ hơn 8 giây hiện "Hình cũ"; mất kết nối trên 120 giây ghi rõ "Không coi là xe an toàn". `age_s` tính từ lần cuối thiết bị báo, không phải lúc xem.
- Mỗi người chỉ để lại một dòng "đang xem trực tiếp" trong dòng thời gian mỗi 5 phút, dù tải liên tục.
- **Tự kiểm tra cabin** (web `#/check`, app: Lịch sử hoặc menu Thêm): camera của máy đang cầm nhận diện ngay trên máy, không gửi gì đi. Muốn lưu ảnh phải bấm riêng, có xem trước, tự xóa sau 30 ngày.
- Chưa làm: truyền hình ảnh thật theo thời gian thực. Việc đó đưa ảnh camera ra khỏi thiết bị, phải có quyết định riêng về quyền riêng tư và cách bật (mặc định tắt, bật thủ công, làm mờ mặt, tự tắt).

## Lịch sử chia hai ngăn, chuông thông báo
- Trang Lịch sử (web và app) có hai ngăn. **Cảnh báo**: các lần bỏ quên và sự cố, thứ cần có người xử lý. **Hoạt động thiết bị**: camera bị che, mất kết nối, video thử, dòng thời gian, ảnh, nhật ký truy cập. Mặc định là Cảnh báo, có chấm đỏ khi đang có sự cố mở.
  Camera bị che và mất kết nối nghĩa là "không được giám sát", nên ngăn Cảnh báo luôn có một dòng nhắc kèm nút chuyển sang Hoạt động. `GET /v1/vehicles/{id}/log?kind=activity` trả mọi thứ trừ `left_behind`.
- Chuông ở góc trên bên phải mở một danh sách: cảnh báo đang mở, sự cố đã đóng, thiết bị mới ghép hoặc kết nối, camera bị che, mất kết nối, thông báo cập nhật. `GET /v1/me/notifications` dựng từ bảng đã có (không lưu thêm gì, theo hạn lưu của các bảng đó). Số trên chuông đếm những gì mới kể từ lần mở trước, lưu trên chính thiết bị.
- Thông báo cập nhật: **web** tự báo khi máy chủ được triển khai bản mới (so mã bản `web_build` với lúc mở trang). **App iPhone** chỉ báo khi đặt `APP_LATEST_IOS` (ví dụ `2.1`) và tuỳ chọn `APP_UPDATE_URL`, `APP_UPDATE_NOTE` trong `.env`; để trống thì không báo gì.

## Giao diện Lịch sử (bản thiết kế lại)
- Đầu trang là một thẻ kính tóm tắt: câu trả lời ("1 sự cố đang mở, 1 đã xử lý"), dải 7 ngày (mỗi cột là một ngày, màu theo mức nặng nhất; bấm để lọc theo ngày) và dòng "Giám sát N% thời gian".
  Hai ngăn bên dưới: **Cảnh báo** (thẻ sự cố có bước gửi tin, xem, đóng) và **Hoạt động thiết bị** (thanh giám sát nhiều màu, danh sách nhóm theo ngày, chỉ dòng không phải đo thật mới gắn nhãn nguồn).
  Nút "Tự kiểm tra cabin" và tải CSV nằm trong thanh hành động ở cuối. Dùng chất liệu kính, góc bo liền mạch, vùng bấm tối thiểu 44 pt theo HIG của Apple.
- `GET /v1/vehicles/{id}/log/summary?days=&tz=` cấp dữ liệu cho dải 7 ngày và `coverage`. **Giám sát N%** = 100% trừ thời gian camera bị che và mất kết nối, tính từ lúc thiết bị đầu tiên được ghép (hoặc đầu khoảng chọn).
  Xe chưa có thiết bị thì không có phần trăm (thay vì hiện 100% cho đẹp). Mất kết nối kéo dài làm phần trăm thấp là đúng: đó là thời gian xe không được trông.

## Nguồn số liệu và giới hạn (phải nói rõ khi trình bày)
- `measured`: từ điện thoại hoặc thiết bị trong xe thật. `simulated`: bộ mô phỏng. `unknown`: sự cố cũ trước khi có nhật ký (nhập vào lúc nâng cấp).
- Độ trễ gửi tin (`notify_s`) lấy từ bảng `deliveries`; bảng này chỉ lưu 30 ngày nên báo cáo sự cố cũ hơn sẽ không có phần "Thông báo đã gửi".
- Nhật ký quan sát chi tiết trong báo cáo lấy từ `observations` (7 ngày).
- Chưa có số liệu doanh nghiệp thật: các con số trên màn hình đo từ chính hệ thống này, không phải khảo sát thị trường.

## Lưu trữ và xóa (SR, baseline P-068)
- `cabin_log`: 365 ngày (`history.RETENTION["cabin_log"]`, dọn mỗi giờ cùng các bảng khác). Dòng đang mở không bị xóa.
- Xóa xe hoặc xóa tài khoản chủ xe xóa luôn nhật ký (khóa ngoại `ON DELETE CASCADE`). `GET /v1/me/export` có kèm nhật ký của các xe mình là chủ.
- Chỉ lưu loại sự kiện, nhãn ghế, thời gian, kết quả và nguồn. Không lưu ảnh, không lưu tên bé. Tổng quan quản lý không hiện tên bé.
