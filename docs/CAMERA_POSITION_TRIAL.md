# Buổi quay thử 3 vị trí camera

Mục tiêu: chọn vị trí lắp camera **trước khi** gom dữ liệu để finetune. Đổi vị trí sau khi đã gán nhãn thì phải quay lại từ đầu.
Mỗi vị trí được chấm bằng chính Camera mô phỏng trên web, với cùng detector, cùng rules, cùng cách theo dõi từng ghế.

Thời gian ước tính: một buổi, khoảng 2–3 giờ, một xe, 3 người (một người quay, một người ngồi làm "hành khách", một người ghi chép).

## 1. Chuẩn bị

- [ ] Xe đỗ nơi có ánh sáng ban ngày bình thường; ghi giờ quay. Nếu được, quay thêm một lượt lúc chiều tối.
- [ ] Ghế trẻ em lắp **quay xuôi** ở ghế sau bên phải. Nếu có ghế quay ngược, mang theo để lắp lượt sau.
- [ ] Búp bê em bé cỡ thật (thay cho em bé thật), một balo, một điện thoại.
- [ ] Camera dự kiến dùng cho sản phẩm (hoặc Pi 5 + camera module). Đặt 1280×720, 15–30 fps.
- [ ] Giá cố định cho từng vị trí: kẹp, băng dính 3M VHB. **Không cầm tay**: camera rung thì phép so với ảnh cabin trống sai.
- [ ] Giấy đồng ý của người lớn tham gia. Nếu có trẻ thật: giấy đồng ý của phụ huynh, mặt làm mờ trước khi chia sẻ clip.

## 2. Ba vị trí cần thử

| Mã | Vị trí | Hướng |
|---|---|---|
| P1 | Trần xe, giữa, ngay sau gương chiếu hậu | Chúc xuống 30–45° về hàng ghế sau |
| P2 | Trần xe, giữa, phía trên hàng ghế trước (gần đèn trần) | Chúc gần thẳng đứng về hàng ghế sau |
| P3 | Trụ B hoặc tay nắm trần phía trên cửa sau một bên | Nhìn chéo sang hàng ghế sau |

Các clip hiện có trong repo được quay thấp, giữa hai ghế trước. Tựa đầu che hàng sau, nên lấy chúng làm mốc so sánh (P0).

## 3. Các clip quay ở MỖI vị trí (mỗi clip 15–20 giây, camera không động vào giữa các clip)

| # | Cảnh | Dùng để |
|---|---|---|
| 1 | Cabin trống, cửa đóng, **người xác nhận là trống** | Ảnh tham chiếu (lấy khung đầu) |
| 2 | Cabin trống, quay lại sau 1 phút | Kiểm tra báo nhầm |
| 3 | Búp bê/trẻ trong ghế quay xuôi, ghế sau phải | Ca khó nhất hiện tại |
| 4 | Người lớn ngồi ghế sau trái, ngả ra sau, cúi đầu | Người bị che một phần |
| 5 | Người lớn ghế trước | Ca dễ |
| 6 | Balo + điện thoại trên ghế sau, không có người | Đồ bỏ quên |
| 7 | Người đi bộ ngay bên ngoài cửa kính sau | Kiểm tra vùng kính loại trừ |
| 8 | (Nếu có) ghế quay ngược có búp bê | Xác nhận camera không thấy, phải dựa vào khai báo/radar |

Đặt tên file: `P1_03_child_forward.mp4`, `P2_01_empty_ref.mp4`…

## 4. Chấm điểm trên Camera mô phỏng

Với mỗi vị trí:

1. Lấy khung đầu của clip 1 làm ảnh cabin trống, ví dụ `ffmpeg -i P1_01_empty_ref.mp4 -frames:v 1 P1_ref.jpg`.
2. Tải clip 1 lên. Vẽ vùng ghế (4 ghế) và vùng kính, bấm **Lưu cho xe này**. Mỗi vị trí là một bộ vùng riêng
   (dùng một xe demo riêng cho mỗi vị trí để không ghi đè lên nhau).
3. Với mỗi clip 2–7: tải clip lên, chọn `P1_ref.jpg` ở ô "Ảnh cabin trống cùng vị trí camera", tick xác nhận,
   bấm **Bắt đầu mô phỏng**. Bộ vùng đã lưu của xe được dùng lại. Chạy mỗi clip 2 vòng, ghi vào bảng.
4. Chạy thêm clip 3 **không** chọn ảnh tham chiếu, để biết detector tự thấy trẻ đến đâu ở vị trí đó.

| Vị trí | Clip | Ghế có người (thật) | Backend báo | Trạng thái ghế đó | Thời gian đến cảnh báo | Báo nhầm ghế khác? | Khứ hồi p50 |
|---|---|---|---|---|---|---|---|
| P1 | 3 | rear_right (trẻ) | | | | | |
| … | | | | | | | |

**Điểm đạt cho một vị trí** (mục tiêu, chưa đo):

- Clip 3 và 4 báo WARNING trong ≤ 3 s, và **detector** thấy người (trạng thái `OCCUPIED`, không chỉ `SEAT_CHANGED`) ở ≥ 50 % khung.
- Clip 1, 2, 6: không có ghế nào `OCCUPIED` hay `SEAT_CHANGED` (riêng clip 6: chỉ NOTICE đồ bỏ quên).
- Clip 7: người ngoài kính có nhãn "ngoài xe", không có cảnh báo.
- Độ giống ảnh tham chiếu của các ghế trống ổn định ≥ 0,7. Nếu dao động mạnh thì camera chưa cố định chắc.

Chọn vị trí có nhiều clip đạt nhất. Hòa thì ưu tiên vị trí cho detector tự thấy trẻ ở clip 3, vì đó là tín hiệu không phụ thuộc ảnh tham chiếu.

## 5. Sau buổi quay

- Gửi kết quả bảng và 1 khung mỗi clip (đã làm mờ mặt) vào `eval/camera-position-<ngày>/`.
- Chốt vị trí, ghi vào `IN_CABIN_SETUP_AND_FINETUNE.md` mục 2.
- Bắt đầu gom dữ liệu finetune **ở vị trí đã chốt** theo ma trận cảnh của tài liệu đó.
