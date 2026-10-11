# Bấm tay toàn bộ nút: báo cáo v2.2 (11/10/2026)

**Môi trường:** máy chủ chạy thử trên máy dev (`127.0.0.1:8765`, chế độ development, dữ liệu riêng trong `/tmp/cabin-qa`). Máy chủ thật **không bị đụng tới** trong lượt này.

**Cách làm:**
- Web: bấm trong trình duyệt ở cỡ màn hình điện thoại (375×812).
- Thiết bị trong xe: giả lập bằng `curl` (ghép bằng mã thật, gửi khung "trống", "có trẻ", "che camera").
- App iPhone: chạy trong Simulator iPhone 18 Pro Max, chụp từng tab.

Ký hiệu: ✅ chạy đúng · 🔧 có lỗi, **đã sửa** trong lượt này · ⚠️ còn tồn tại · ⛔ không thử được.

## 1. Kết quả theo màn hình (web)

### Đăng nhập
| Nút / ô | Kết quả |
|---|---|
| Gửi mã đăng nhập | ✅ Hiện màn nhập mã (chế độ thử hiện mã ngay) |
| Đăng nhập | ✅ Vào trang Xe |
| Đổi số | ✅ có nút (không bấm) |
| Bỏ trống số điện thoại rồi bấm Enter | ⚠️ Không báo gì. Nên báo "Nhập số điện thoại" |

### Xe (trang chủ)
| Nút | Kết quả |
|---|---|
| Thêm xe (khi chưa có xe) | ✅ Chuyển sang Tài khoản |
| Chuông thông báo | ✅ Mở danh sách; bấm một mục mở đúng sự cố |
| Ô "Người và thú cưng", "Đồ vật" | ✅ Mở bảng chi tiết |
| Làm mới dữ liệu | ✅ |
| Xem camera | ✅ Chỉ hiện kết quả nhận diện, không có ảnh |
| Tạm dừng giám sát 10/30/60 phút | ✅ Ẩn khi có sự cố đang mở (đúng) |
| Bật lại giám sát | ✅ |
| Điều hòa Bật/Tắt | ✅ Chỉ có ở chế độ thử; bản thật trả 404 |
| Xử lý ngay / Đã xem / Gọi 112 | ✅ `tel:112` đúng |
| Thẻ xanh "Bình thường" trong khi sự cố vẫn mở | 🔧 Nay hiện thẻ cam "Sự cố chưa đóng" |
| Thiếu ảnh xe | 🔧 Đã thêm ảnh VF 8 (trắng, đỏ, đen) và VF 6. Dòng khác hiện hình vẽ trung tính |
| Ghi "thiết bị trực tuyến" dù thiết bị im 10 phút | 🔧 Nay ghi "ngoại tuyến" (cùng quy tắc với trang Tài khoản) |
| "Cập nhật chưa có" khi xe chưa có thiết bị | 🔧 Nay ghi "Chưa nhận dữ liệu nào từ thiết bị trong xe" |
| Thanh trên khi có 2 xe: chữ xuống dòng, tên xe bị cắt | 🔧 |

### Sự cố
| Nút | Kết quả |
|---|---|
| Xem trực tiếp | ✅ Vẽ khung bao; báo "Hình cũ" sau 8 giây không có dữ liệu mới |
| Nhãn khung bao bị cắt ở mép phải | 🔧 Nhãn luôn nằm trong hình |
| Nút "Thấy người trong xe? Gọi 112" bị tràn chữ | 🔧 Thành "Gọi 112" (đọc màn hình vẫn đọc câu đầy đủ) |
| Gửi xác nhận (chưa tick đủ 3 mục) | ✅ Nút bị khóa |
| Gửi xác nhận khi camera vẫn thấy người | ✅ Bị từ chối, hiện "Đóng thủ công…" |
| Đóng thủ công → hộp xác nhận | ✅ Đóng; camera còn thấy người thì mở sự cố mới (đúng) |
| Gửi xác nhận khi người đã rời xe | ✅ "Đã đóng sự cố" |
| Bấm hụt: trang tự vẽ lại mỗi vài giây nên cú bấm rơi đúng lúc bị mất | 🔧 Hoãn vẽ lại khi ngón tay đang chạm |
| Tự kiểm tra bằng camera máy này | ✅ Mở trang; ⛔ trình duyệt thử chặn camera nên chưa thử nhận diện thật (báo lỗi quyền rõ ràng) |
| Nút quay lại từ Tự kiểm tra về "Lịch sử" dù mở từ trang sự cố | 🔧 Thành "← Quay lại" (về đúng trang trước) |

### Đưa đón
| Nút | Kết quả |
|---|---|
| Thêm bé (bỏ trống tên) | 🔧 Trước hiện "Lỗi 422", nay "Kiểm tra lại: Tên." |
| Thêm bé, chọn ghế, ngày đi học, Lưu | ✅ |
| Ghi nhận bé đã lên xe | ✅ |
| Ghi nhận bé đã tới nơi | 🔧 Trước bấm Xác nhận được mà không cần tick "đã nhìn lại ghế". Nay phải tick mới bấm được |
| Sửa / Xóa bé | ✅ Mở đúng bảng |
| Đặt điểm đến (tìm, bán kính, Lưu) | ✅ Mở bảng có bản đồ. Không lưu thử vì tìm kiếm gửi từ khóa ra OpenStreetMap |
| "Lớp 2A Ghế sau phải" dính chữ, nhãn "Chờ đón" xuống dòng | 🔧 |

### Lịch sử
| Nút | Kết quả |
|---|---|
| 7 / 30 / 90 ngày | ✅ 7 cột, 30 cột, 13 cột theo tuần |
| Bấm một cột → lọc theo ngày, Bỏ lọc ngày | ✅ |
| Tab Cảnh báo: Tất cả / Cảnh báo / Nghiêm trọng | ✅ |
| Thẻ sự cố → Báo cáo sự cố, In hoặc lưu PDF | ✅ |
| Tab Hoạt động thiết bị: Tất cả / Camera bị che / Mất kết nối / Video thử | ✅ Ghi đúng 31 giây che camera, độ phủ giám sát giảm theo |
| Icon "Camera bị che", "Mất kết nối", "Cảnh báo" hiện thành hình xe | 🔧 Thay bằng bộ icon đầy đủ |
| "Giám sát 17,5% thời gian" vẫn có khiên xanh | 🔧 Xanh ≥ 95%, cam ≥ 80%, đỏ dưới 80% (web và iPhone) |
| Camera thấy gì 24 giờ, Dòng thời gian, Ảnh đã gửi, Nhật ký truy cập | ✅ Mở/đóng được; 🔧 thêm mũi tên cho mục thu gọn |
| "gửi tin sau – (trung vị)" khi chưa có số liệu | 🔧 Ẩn phần chưa có |
| Tải nhật ký CSV | ✅ (kiểm bằng gọi API, không tải tệp về máy) |
| Gửi ảnh | ⛔ Cần chọn tệp từ máy, chưa thử |

### Báo cáo sự cố
| Mục | Kết quả |
|---|---|
| Ô "Cabin 22°C" kèm nhãn "Đo thật" dù xe không có cảm biến cabin | 🔧 **Lỗi số liệu.** Con số đến từ mô hình, không phải đo thật. Nay không lưu và không hiện (cả sự cố cũ) |

### Tài khoản
| Nút | Kết quả |
|---|---|
| Đổi tên, Thêm xe, Gỡ xe, Liên kết bằng mã thử | ✅ có nút; thêm xe chạy đúng |
| Thêm xe bỏ trống tên | 🔧 "Lỗi 422" → "Kiểm tra lại: Tên." |
| Tạo mã ghép thiết bị | ✅ Mã dùng một lần, 10 phút |
| Bảng mã ghép vẫn mở khi chuyển tab | 🔧 Tự đóng khi đổi trang |
| Ngắt thiết bị, Mời người thân, Thêm người liên hệ | ✅ có nút (không bấm để giữ dữ liệu thử) |
| Kênh thông báo, các công tắc | ✅; 🔧 ô "Kênh nhận thông báo" bị bóp thành 5 dòng → xếp chữ trên, ô chọn dưới |
| Icon sai nghĩa: "Tải bản sao dữ liệu" dùng icon gửi, "Đăng xuất mọi thiết bị" và "Xóa tài khoản" dùng dấu X | 🔧 Tải xuống, đăng xuất, thùng rác |
| Tải bản sao dữ liệu (JSON) | ✅ (kiểm bằng API) |
| Đăng xuất mọi thiết bị, Xóa tài khoản, Đăng xuất | ⛔ Không bấm (sẽ xóa phiên thử). Đã có test tự động |

### Chung
- 🔧 Thông báo nhỏ (toast) chồng lên thanh trên và lặp đôi → dời xuống dưới thanh trên, tối đa 2 cái, không lặp.
- 🔧 Câu "Xe đã gửi ảnh và cảm biến mới" sai sự thật (xe không gửi ảnh) → "…kết quả nhận diện và cảm biến mới (không gửi ảnh)".
- ⚠️ Dòng thời gian ghi "Đèn xanh dương trên thiết bị nhấp nháy khi có người xem". Chưa rõ thiết bị Pi có đèn này không, cần bạn xác nhận.

## 2. App iPhone (Simulator)
| Mục | Kết quả |
|---|---|
| Xe, Đưa đón, Lịch sử, Tài khoản | ✅ Mở được, ảnh xe đúng |
| Icon không tồn tại trong SF Symbols (hiện ô trống) | 🔧 "Hủy liên kết" và trạng thái "Trễ đón". Đã kiểm cả 95 tên icon trong app |
| VF 9, VF 3 hiện nhầm ảnh VF 8 | 🔧 Hình vẽ trung tính (cả trang thêm xe) |
| "Bé Na đã xuống xe tại trường" dù chưa đặt điểm trường | 🔧 "đã xuống xe", chỉ ghi "tại …" khi có điểm đến |
| Khung "Chưa có vị trí xe" nền đen lệch góc | 🔧 |
| Độ phủ giám sát thấp mà khiên xanh | 🔧 |
| ⛔ Chưa bấm từng nút trên iPhone thật | Simulator hay trễ thao tác; luồng nút dùng chung API với web đã thử ở trên |

## 3. Bộ icon
Web dùng **Lucide** (lucide-static 0.460.0, giấy phép ISC), nhúng sẵn 69 icon trong `backend/web/js/icons.js`, không tải từ mạng khi chạy.
- Tạo lại hoặc thêm icon bằng `scripts/build_icons.py`.
- Tên icon không có sẽ hiện dấu "?" thay vì lặng lẽ hiện hình xe như trước.

iPhone dùng **SF Symbols** của Apple (đầy đủ sẵn).

## 4. Đã kiểm sau khi sửa
- Backend 72/72 test đạt (thêm test "không có nhiệt độ cabin khi không có cảm biến").
- Bản iOS CabinNoir dựng thành công. Web không có lỗi JavaScript trên các trang đã mở.
- **Chưa đưa lên máy chủ thật, chưa cài lên iPhone 15 Pro Max.**
