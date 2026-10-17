# Phương án xử lý khi theo dõi được trẻ em, người lớn, thú cưng

Ngày 17/10/2026. Tài liệu đề xuất cho PO và chủ model. Phần "đã có" là hành vi thật của demo (đã chạy, 17/10). Phần "đề xuất" chưa làm, chưa kiểm.

## 1. Các hãng làm gì (tra cứu công khai)

| Hãng | Điều tra cứu được | Mức chắc chắn |
| --- | --- | --- |
| **Tesla, Pet Mode** (trước đây Dog Mode) | Giữ điều hoà ở nhiệt độ đặt. Màn hình hiện lời nhắn lớn kèm nhiệt độ cabin cho người đi qua ("Don't worry! {tên} is chillin'"; từ bản 2026.14 có thể đặt tên và chọn chó, mèo, nhím). Cửa sổ giữ khoá. Không bật khi pin dưới 20%. Báo điện thoại khi pin còn 20%. Camp Mode giữ nhiệt độ và cấp điện USB/12V. | Có tài liệu hãng (trang hỗ trợ) và bài của Not a Tesla App |
| **Tesla, Child Left Alone Detection** | Dùng radar trong cabin. Theo hướng dẫn sử dụng: cảnh báo đầu trong khoảng 15 giây sau khi đóng cửa nếu xe khoá (2 phút nếu chưa khoá) gồm chuông ngắn, đèn nháy, thông báo ứng dụng; điều hoà bật sau khoảng 10 giây; khoảng 2 phút sau báo động tăng dần và nhắn điện thoại mỗi phút đến khi có người mở cửa. Xử lý tại chỗ, không gửi lên máy chủ. | Hướng dẫn sử dụng đọc qua bản tóm tắt tìm kiếm (trang gốc trả 403). Bài Not a Tesla App ghi bản đầu chưa có điều hoà và gọi cứu hộ, nên chi tiết khác nhau theo bản phần mềm |
| **Li Auto, chế độ thú cưng** | Điều hoà chạy liên tục giữ nhiệt độ, rèm che nắng tự đóng, khoá cửa sổ, cửa, màn hình và bàn đạp. | Một bài báo (IT之家) |
| **Lucid, Creature Comfort** | Giữ nhiệt độ, tắt chỉnh cửa sổ và bàn đạp để tránh nhầm, xem nhiệt độ và trạng thái trên ứng dụng. | Một bài báo |
| **Polestar 3** | Radar trong cabin báo cho tài xế và ngăn khoá cửa nếu còn chuyển động. | Trang Kids and Cars |
| **Euro NCAP (2026)** | Phát hiện trẻ trực tiếp (chuyển động, nhịp thở), phủ mọi vị trí ngồi, cảnh báo theo bậc có thời gian rõ ràng, hai kịch bản: trẻ bị bỏ lại và trẻ vào xe rồi bị kẹt. | Tài liệu SD 102 (tên và phạm vi đọc qua tìm kiếm) |
| **Huawei HarmonyOS Cockpit, BYD DiLink, Geely/Zeekr** | **Không tìm được mô tả công khai** về hành động khi phát hiện trẻ hay thú cưng. Chỉ thấy: Euro NCAP ghi Zeekr X và BYD Dolphin có phát hiện trẻ trực tiếp (BYD Dolphin chưa đạt yêu cầu), Zeekr 7X có camera quan sát hàng ghế sau và menu "Child Protection", báo chí có nhắc Zeekr X có "pet mode". | **Chưa xác minh.** Cần tra tài liệu tiếng Trung chính thức hoặc hỏi đại lý |

Giới hạn của lần tra cứu: trang Tesla bị chặn nên không đọc được nguyên văn; không có tài liệu chính thức của Huawei, BYD, Geely. Đừng trích các hãng này như nguồn khi chưa kiểm.

## 2. Đề xuất cho CabinSentinel theo từng đối tượng

Nguyên tắc chung giữ nguyên: cảnh báo không bao giờ tắt chỉ vì đã bật chế độ chăm sóc. Chỉ có người kiểm tra cabin mới đóng sự cố. Không tự mở khoá khi chưa có người xác nhận (HITL). Nhãn trẻ em chỉ dùng khi bộ phân loại tuổi chạy.

| Đối tượng | Ngay lập tức | Sau N giây nếu chưa ai phản hồi | Leo thang |
| --- | --- | --- | --- |
| **Trẻ em** | Cảnh báo điện thoại chủ xe, còi, tin nhắn (**đã có**). Hiện giao diện cho bé trên màn hình trong xe (**đã có** trong kế hoạch backend, chưa vẽ riêng trên cockpit). | Tự giữ nhiệt độ êm và phát nhạc ru nhỏ, nếu chủ xe đã đồng ý trước trên điện thoại (**đã có**, bật cũng được từ cockpit). | Đèn nháy, loa ngoài lặp lại, rồi gọi hỗ trợ theo chính sách (**đề xuất**, cần PO và pháp lý quyết định; số 112 đã có nút trên điện thoại). |
| **Người lớn** | Chế độ cắm trại: giữ điều hoà, chọn nhạc (nhạc không lời phát thật, ứng dụng nhạc, podcast) (**đã có**). Giao diện chọn nhạc theo kiểu thẻ Tesla (**đã có**, mô phỏng). | Không tự làm gì thêm: người lớn tự quyết. | Nếu luật xe đỗ nóng kích hoạt thì vẫn cảnh báo như bình thường (**đã có**). |
| **Thú cưng** | Chế độ thú cưng: giữ điều hoà, màn hình lời nhắn kèm tên và nhiệt độ, khoá cửa sổ (**đã có** ở dạng mô phỏng; backend giữ điều hoà). | Giữ nguyên, kèm cảnh báo xe nóng theo luật (**đã có**). | Báo điện thoại khi pin 20%, còi hoặc đèn nháy khi nhiệt độ vượt ngưỡng (**đề xuất**). |

### Nhạc dỗ bé

Bài "Baby Shark" và các bài thiếu nhi thương mại có bản quyền. Demo chỉ dùng giai điệu dân gian và Brahms 1868, tự tổng hợp trong trình duyệt. Muốn dùng bài thương mại cần giấy phép hoặc bản thu riêng (nút đã có sẵn nhưng khoá và ghi lý do). Âm lượng của demo đặt thấp cố định.

### Điều cần PO quyết

1. Có tự gọi hỗ trợ khẩn cấp không, và sau bao lâu (liên quan eCall và trách nhiệm pháp lý).
2. Có cho chạy loa ngoài và đèn nháy khi trẻ bị bỏ lại không, và quy định ở địa phương.
3. Nguồn nhạc dỗ bé có bản quyền.
4. Điều kiện bật tự động: hiện cần chủ xe đồng ý trước; không đổi nếu chưa có quyết định mới.

### Điều cần chủ model

Các hành động trên chỉ có nghĩa khi model **thấy** đối tượng. Bundle 14/10 vẫn bỏ sót trẻ ghế sau quay lưng (SR-01 mở) và nhãn tuổi dao động, nên "tự động theo dõi trẻ rồi tự dỗ" chưa nên bật mặc định. Chạy thử trong `docs/vinfast/evidence-model-2026-10-17/`.

## 3. Nguồn

- Tesla: [Summer Driving Tips](https://www.tesla.com/support/summer-driving-tips) · [Pet Mode đổi tên và tính năng mới](https://notateslaapp.com/news/3987/tesla-rebrands-dog-mode-to-pet-mode-adds-new-features) · [Child Left Alone Detection (hướng dẫn sử dụng)](https://www.tesla.com/ownersmanual/modely/en_au/GUID-61E5B0E4-3595-4D66-AA4A-188F3ED6DD49.html) · [Child Left Behind, Not a Tesla App](https://notateslaapp.com/news/2756/tesla-adds-child-left-behind-detection-to-its-vehicles) · [Drive Tesla Canada](https://driveteslacanada.ca/news/tesla-rolls-out-child-left-alone-detection-feature-in-2025-14-12-software-update/)
- Li Auto: [IT之家](https://www.ithome.com/0/919/045.htm) · Lucid: [Benzinga](https://feeds2.benzinga.com/news/24/02/37385347/lucid-introduces-creature-comfort-mode-to-rival-teslas-dog-mode-for-pets) · Leapmotor C10: [AM Online](https://www.am-online.com/news/leapmotor-c10-s-new-guard-mode-keeps-dogs-cool)
- Polestar 3: [Kids and Cars](https://www.kidsandcars.org/hot-cars/hot-cars-federal-legislation-technology/polestar-3-suv)
- Euro NCAP: [SD 102 CPD evaluation v2.0](https://cdn.euroncap.com/media/88529/sd-102-cpd-evaluation-v20.pdf) · [Zeekr X](https://www.euroncap.com/assessments/zeekr/x/1038) · [BYD Dolphin](https://www.euroncap.com/en/results/BYD/DOLPHIN/50011)
