# Cabin Noir: luồng người dùng cho mọi chức năng (v2.2)

Áp dụng cho web (`/app/`) và app iPhone. Khác biệt giữa hai bản được ghi rõ. Mọi số liệu gắn nhãn **Đo thật** (thiết bị thật) hoặc **Mô phỏng** (dữ liệu thử).

Mục lục: [0. Vai trò](#0-vai-trò) · [1. Đăng nhập](#1-đăng-nhập) · [2. Thiết lập](#2-thiết-lập-lần-đầu) · [3. Tab Xe](#3-tab-xe-theo-dõi-hằng-ngày) · [4. Có cảnh báo](#4-khi-có-cảnh-báo) · [5. Chuông](#5-chuông-thông-báo) · [6. Đưa đón](#6-tab-đưa-đón) · [7. Lịch sử](#7-tab-lịch-sử) · [8. Tài khoản](#8-tab-tài-khoản) · [9. Thiết bị trong xe](#9-thiết-bị-trong-xe-không-có-người-dùng-ngồi-trước-máy) · [10. Quy tắc an toàn](#10-quy-tắc-an-toàn-chạy-xuyên-suốt)

## 0. Vai trò
| Vai trò | Được làm |
|---|---|
| Chủ xe | Mọi thứ, gồm thêm hoặc gỡ xe, ghép thiết bị, mời người thân, xem nhật ký truy cập |
| Xác nhận (người thân) | Xem, xử lý và đóng sự cố, xem trực tiếp, tạm dừng |
| Xem | Chỉ xem trạng thái và lịch sử |
| Đưa đón | Chỉ dùng tab Đưa đón của xe đó |

## 1. Đăng nhập
1. Nhập số điện thoại (10 số, bắt đầu bằng 0), tên nếu là lần đầu, rồi bấm **Gửi mã đăng nhập**.
2. Mã 6 số đến qua Telegram nếu đã liên kết bot, nếu không thì qua kênh quản trị đã cấu hình. Mã có hiệu lực 5 phút, có giới hạn số lần gửi.
3. Nhập mã, bấm **Đăng nhập**. Nhập nhầm số thì bấm **Đổi số**.
4. Có thể bắt đầu từ bot Telegram: bot xin chia sẻ số điện thoại của chính tài khoản Telegram, sau đó gửi đường link đăng nhập dùng một lần.

## 2. Thiết lập lần đầu
1. **Tài khoản → Thêm xe**: nhập tên, chọn dòng xe, biển số, màu.
   - App hiện ảnh xe nếu có ảnh thật (VF 8, VF 6). Dòng khác hiện hình vẽ trung tính.
2. **Tạo mã ghép thiết bị**: mã dạng `ABCD-EFGH`, dùng một lần, hết hạn sau 10 phút.
3. Trên thiết bị trong xe (Raspberry Pi, điện thoại cũ, hoặc "Dùng trình duyệt này làm thiết bị trong xe") nhập mã. Thiết bị bắt đầu gửi kết quả nhận diện, **không gửi ảnh**.
4. (Tùy chọn) **Mời người thân** bằng số điện thoại và chọn quyền. Người được mời đăng nhập là thấy xe.
5. (Tùy chọn) **Người liên hệ khẩn cấp**: nhận SMS khi sự cố nghiêm trọng không ai xem. Cần máy chủ bật SMS.
6. **Thông báo**: chọn kênh (Tự động, Telegram, ntfy, Cả hai), bật hoặc tắt từng loại tin. Trên iPhone có màn hướng dẫn cài ntfy.

## 3. Tab Xe (theo dõi hằng ngày)
- **Thẻ trạng thái**:
  - **Bình thường**: thiết bị có dữ liệu mới, không thấy ai. Luôn kèm câu "không phát hiện gì không có nghĩa là xe trống".
  - **Cảnh báo** hoặc **Nghiêm trọng**.
  - **Sự cố chưa đóng**: camera không còn thấy người nhưng chưa ai xác nhận.
  - **Không coi là an toàn**: dữ liệu cũ hơn 8 giây hoặc camera bị che.
- **Ô số đếm**: người và thú cưng, đồ vật. Bấm vào để xem chi tiết.
- **Sơ đồ ghế**: ghế nào đang thấy gì, kèm độ tin cậy.
- **Ô thông tin**: cửa xe, nhiệt độ ngoài trời, camera.
- **Hành động**:
  - **Làm mới dữ liệu**.
  - **Xem camera**: chỉ có kết quả nhận diện, không có ảnh.
  - **Tạm dừng giám sát** 10, 30 hoặc 60 phút. Không tạm dừng được khi đang có sự cố.
  - **Bật lại giám sát**.
- Trên iPhone, góc phải có chuông và menu "…". Các nút nhanh gồm Ghế, Bản đồ, Thiết bị, Thêm.

## 4. Khi có cảnh báo
1. Thiết bị thấy người hoặc thú cưng ở ghế sau khi xe đỗ. Máy chủ mở **sự cố**, gửi tin tới mọi người trong gia đình (Telegram, ntfy hoặc cả hai) và nhắc lại mỗi 60 giây.
2. Trên tab Xe xuất hiện thẻ **Sự cố đang mở** với ba nút:
   - **Xử lý ngay**: mở trang sự cố.
   - **Đã xem**: dừng nhắc lặp lại nhưng không đóng sự cố.
   - **Gọi 112**: mở trình gọi điện. App không tự gọi.
3. **Trang sự cố** gồm:
   - **Xem trực tiếp**: vẽ khung bao và nhãn, cập nhật mỗi 2 giây. Quá 8 giây không có dữ liệu thì báo "Hình cũ, không dùng để kết luận xe trống".
   - **Tự kiểm tra bằng camera máy này**: nhận diện ngay trên điện thoại, không gửi ảnh.
   - **Kế hoạch xử lý**: các bước leo thang (thông báo, SMS, gọi, người liên hệ). Ở bản thật, bước nào cũng ghi đúng là đã gửi, bị bỏ qua hay lỗi.
   - **Xác nhận đã kiểm tra xe**: tick đủ 3 mục (ghế, sàn, cốp) rồi bấm **Gửi xác nhận**.
4. Nếu camera vẫn thấy người, hệ thống **từ chối** đóng sự cố. Có thể chọn **Đóng thủ công…**: cả gia đình được báo, việc này ghi vào lịch sử, và nếu camera còn thấy người thì sự cố mới sẽ mở lại.
5. Nếu camera không còn thấy người, sự cố đóng và cả gia đình nhận tin "đã kiểm tra xe". Nhật ký được niêm phong.

## 5. Chuông thông báo
- Hiện cảnh báo, sự cố đã đóng, thiết bị mới ghép hoặc kết nối lại, camera bị che, mất kết nối, và bản cập nhật app hoặc web.
- Bấm một mục để mở đúng sự cố hoặc đúng trang. Số đỏ trên chuông là số tin chưa xem.

## 6. Tab Đưa đón
1. **Thêm bé**: tên, lớp, ghế ngồi, giờ đón, giờ về, các ngày đi học. Có thể sửa hoặc xóa bé.
2. **Đặt điểm đến**: tìm địa chỉ, chọn bán kính vùng tới nơi (từ khóa tìm kiếm được gửi tới OpenStreetMap).
3. Mỗi chuyến đi theo các giai đoạn: Chờ đón → Đã lên xe → Đang trên đường → Đã tới nơi. Hệ thống tự chuyển giai đoạn theo camera và vị trí, hoặc người dùng ghi nhận thủ công:
   - **Ghi nhận bé đã lên xe**.
   - **Ghi nhận bé đã tới nơi**: phải tick "đã nhìn lại ghế và sàn xe". Nếu camera vẫn thấy người, app hỏi lại và không đóng cảnh báo đang mở.
4. **Trễ đón** và **Có thể bé còn trong xe** được tô màu cảnh báo và có nút gọi.

## 7. Tab Lịch sử
- **Thẻ đầu trang**:
  - Chọn 7, 30 hoặc 90 ngày: 7 cột, 30 cột hoặc 13 cột theo tuần. Màu mỗi cột là mức nặng nhất trong ngày hoặc tuần đó.
  - Bấm một cột để lọc theo ngày, **Bỏ lọc ngày** để bỏ.
  - **Thời gian được giám sát**: phần trăm thời gian không bị che camera hay mất kết nối. Khiên xanh từ 95%, cam từ 80%, đỏ dưới 80%.
- **Tab Cảnh báo**:
  - Lọc Tất cả, Cảnh báo hoặc Nghiêm trọng.
  - Mỗi thẻ sự cố ghi thời lượng, thời gian tới khi có người xem, và cách đóng.
  - Bấm thẻ để mở **Báo cáo sự cố** (có **In hoặc lưu PDF**).
- **Tab Hoạt động thiết bị**:
  - Lọc Camera bị che, Mất kết nối hoặc Video thử.
  - Dòng "Video thử" trên iPhone mở được video lưu sẵn trong app. Máy chủ chỉ giữ kết quả.
  - Có thêm: "Camera thấy gì trong 24 giờ" (chỉ số lượng), Dòng thời gian, Ảnh đã gửi (người dùng tự gửi, tự xóa sau 30 ngày), Nhật ký truy cập (chỉ chủ xe).
- **Chuỗi niêm phong**: dòng "Nhật ký nguyên vẹn, N dòng niêm phong" xác nhận nhật ký không bị sửa.
- **Thanh dưới**: **Tự kiểm tra cabin** và **Tải nhật ký (CSV)**.

## 8. Tab Tài khoản
- **Hồ sơ**: đổi tên.
- **Xe**: thêm, gỡ (chủ xe) hoặc rời xe (người thân), liên kết bằng mã (chế độ thử).
- **Thiết bị trong xe**:
  - Danh sách thiết bị, trạng thái trực tuyến, pin. Nút **Ngắt** thu hồi quyền của thiết bị.
  - Tạo mã ghép.
  - Dùng trình duyệt này làm thiết bị.
- **Gia đình**: mời, đổi quyền, xóa.
- **Người liên hệ khẩn cấp**: thêm, xóa.
- **Thông báo**:
  - Liên kết, gửi thử hoặc hủy Telegram.
  - Kênh ntfy dự phòng: tên chủ đề riêng, không nên chia sẻ.
  - Mức cảnh báo, thông tin chung, nhắc khi rời xe, thông báo của trình duyệt.
- **Mục đích sử dụng**: giám sát cabin, đưa đón, hoặc cả hai. Có công tắc **Chế độ dùng thử (mô phỏng)**.
- **Bảo mật**: danh sách phiên đăng nhập, **Đăng xuất mọi thiết bị**.
- **Dữ liệu của bạn**:
  - **Tải bản sao dữ liệu (JSON)**.
  - **Xóa tài khoản và dữ liệu**: xóa luôn các xe bạn là chủ và toàn bộ lịch sử.
  - Thời hạn lưu: cảm biến và hành trình 7 ngày, ảnh 30 ngày, nhật ký truy cập và sự cố 365 ngày.
- **Đăng xuất**.

## 9. Thiết bị trong xe (không có người dùng ngồi trước máy)
1. Ghép bằng mã → nhận token riêng của thiết bị. Token này không dùng được cho API của người dùng.
2. Vài giây một lần gửi kết quả nhận diện:
   - Ghế, loại (người, thú cưng, đồ vật), độ tin cậy, khung bao 0..1.
   - Camera có nhìn được không, pin, nhiệt độ máy, nhiệt độ ngoài trời.
   - **Không gửi ảnh.**
3. Máy chủ trả trạng thái và thời điểm hết tạm dừng (nếu có).
4. Máy chủ tự ghi nhật ký:
   - Camera bị che quá 15 giây.
   - Mất kết nối quá 60 giây.
   - Mỗi sự cố bỏ quên kèm thời lượng.
5. Chủ xe **Ngắt** thiết bị → token bị thu hồi ngay.

## 10. Quy tắc an toàn chạy xuyên suốt
- "Không phát hiện gì" **không** có nghĩa là xe trống (SR-01). Dữ liệu cũ hoặc camera bị che thì báo "Không coi là an toàn".
- Ảnh gốc không bao giờ rời thiết bị. Xem trực tiếp chỉ là hình vẽ từ kết quả nhận diện.
- Sự cố chỉ đóng khi có người xác nhận đã tự kiểm tra xe. Đóng thủ công luôn được ghi lại và báo cả nhà.
- App chỉ giám sát, không mở khóa hay điều khiển xe. Thấy người trong xe thì gọi 112.
