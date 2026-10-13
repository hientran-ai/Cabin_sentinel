# Setup trong xe và finetune mô hình cho cabin

Tài liệu này trả lời câu hỏi "có nên finetune lại từ đầu, gắn camera trong xe thế nào để mô hình nhận biết đúng những
thứ cần thiết". Nó cũng trả lời các câu hỏi của người góp ý: báo nhầm, báo trùng, người đứng ngoài kính, hiệu chỉnh ROI
cho từng xe, xử lý trên thiết bị hay gửi về trung tâm, và lỗi trên thiết bị edge.

## 0. Bằng chứng hiện có (đo thật, 13/10/2026)

Detector đang dùng ở production và trong demo là **YOLOv8n COCO gốc**, chưa từng train trên ảnh cabin.
Trên video nhóm tự quay có trẻ ngồi ghế an toàn phía sau:

| Model | Độ phân giải | Khung có trẻ ≥ 0,40 | Khung có trẻ ≥ 0,15 |
|---|---|---|---|
| YOLOv8n | 640 / 960 | 0/21 / 0/21 | 0/21 / 0/21 |
| YOLOv8s | 640 / 960 | 0/21 / 0/21 | 0/21 / 2/21 |

Người lớn ở ghế trước và trẻ ngồi thẳng trên ghế nâng (video do AI tạo) đều được thấy ngay ở mọi khung.
Model to hơn, ảnh lớn hơn đều không cứu được trường hợp trẻ trong ghế an toàn. Nguyên nhân: trẻ bị tựa đầu che, ngược sáng,
và COCO gần như không có ảnh trẻ trong ghế ô tô. Đây là lỗi **dữ liệu và vị trí camera**, không phải lỗi kích thước model.

## 1. Kết luận ngắn

1. **Có, cần finetune.** Nhưng finetune từ trọng số COCO đã train sẵn (transfer learning), **không train từ con số 0**.
   Train từ đầu cần hàng trăm nghìn ảnh có nhãn. Nhóm sẽ có vài nghìn, finetune từ COCO cho kết quả tốt hơn hẳn với
   lượng dữ liệu đó. `embedded/finetune/train.py` đã làm đúng việc này (giữ backbone, train lại phần head).
2. **Setup trong xe phải làm trước khi gom dữ liệu.** Model chỉ học được thứ camera nhìn thấy. Đổi vị trí camera sau khi đã
   gán nhãn thì phải gom lại dữ liệu.
3. **Chưa cần segmentation cho mỗi khung.** Phát hiện (box) cộng với phân loại theo từng ghế đủ cho bài toán "còn ai trong xe",
   rẻ hơn khi gán nhãn và chạy được trên Pi. Phần "phân vùng" cần thiết (ghế ở đâu, kính ở đâu) làm **một lần khi lắp** cho mỗi xe
   (hiệu chỉnh ROI), không cần model đoán lại mỗi khung.

## 2. Setup trong xe (làm trước tiên)

| Hạng mục | Đề xuất | Lý do |
|---|---|---|
| Vị trí | Trần xe, giữa, ngay sau gương chiếu hậu, chúc xuống 30–45° về hàng ghế sau | Thấy cả hai hàng ghế và sàn, ít bị tựa đầu che hơn khi đặt thấp |
| Ống kính | Góc rộng 120–140°, lấy nét cố định | Một camera phủ hết cabin; nét cố định thì ảnh ổn định giữa các xe |
| Ban đêm | Cảm biến không có kính lọc IR (NoIR) + đèn IR 940 nm | Không chói mắt; xe đỗ ban đêm là lúc rủi ro cao |
| Cố định | Giá bắt vít hoặc keo 3M VHB, không dùng giác hút | Camera xê dịch thì ROI sai (v3 có ước lượng độ lệch nhưng có giới hạn) |
| Ghế trẻ em quay ngược | Camera phía trước **không thấy em bé**. Khi lắp, khai báo ghế đó là `rear_facing`: hệ thống luôn coi ghế không kiểm được và nhắc kiểm tra (`BABY_SEAT_UNVERIFIED`, WARNING) cho đến khi có người xác nhận. Muốn bỏ lời nhắc an toàn thì thêm radar 60 GHz (nhịp thở qua vỏ ghế) hoặc camera thứ hai ở trần sau | Đã có trong simulator (mẫu "Ghế trẻ em quay ngược"). Pipeline v3 đã nhận tín hiệu radar theo từng ghế. Khi xe đang chạy có tài xế, lời nhắc nên tắt; việc này cần tín hiệu cửa/hành trình, chưa làm |
| Ảnh tham chiếu cabin trống | Chụp khi lắp, có người xác nhận cabin trống (SR-09) | Dùng để xác minh "ghế trống" bằng bằng chứng dương (SR-01) |
| Hiệu chỉnh ROI | Đánh dấu từng ghế và từng ô kính cho mỗi dòng xe/vị trí lắp | Mỗi xe có khoang sau khác nhau; loại người đi ngoài đường thấy qua kính |

ROI làm được gì và không làm được gì (đã có trong code: nguồn "Video mẫu" của trang thiết bị Cabin Noir, `web/js/device-video.js` và `web/js/cabinref.js`):

- Vùng **ghế**: phát hiện có tâm nằm trên ghế thì tính cho ghế đó.
- Vùng **kính**: phát hiện có tâm nằm trong vùng kính **và** không nằm trên ghế nào thì coi là người ngoài xe, chỉ hiển thị, không tính.
- Chỗ chưa đánh dấu vẫn tính. Vùng kính không được phủ quá 50 % khung hình, cũng không được che quá nửa một ghế.
  Mỗi lần lưu tăng version và ghi nhật ký kiểm toán (ai sửa, lúc nào).
- ROI **không bao giờ** biến "không thấy gì" thành "trống" (SR-01).

## 3. Mô hình cần dự đoán gì

| Thành phần | Nhãn | Chạy ở đâu | Ghi chú |
|---|---|---|---|
| Detector (finetune YOLOv8n, ảnh 320) | `person`, `child_seat`, `dog`, `cat`, đồ bỏ quên (`bag`, `phone`, `bottle`, `wallet`, `laptop`, `keys`) | Pi 5 (NCNN) | Gộp các lớp COCO gần nhau; thêm `child_seat` (v3 đã dùng) |
| Phân loại theo ghế | `empty`, `occupied_adult`, `occupied_child`, `child_seat_empty`, `child_seat_occupied`, `uncertain` | Pi 5, chỉ khi ghế thay đổi | Học "ghế trông khác ảnh tham chiếu" chứ không cần thấy rõ người, nên chịu được trường hợp bị che |
| Tuổi | Giữ model tuổi riêng của Tâm (`age_group`) | Pi/máy chủ | Không gộp tuổi vào nhãn detector khi chưa có hợp đồng an toàn |
| Segmentation | Chưa làm. Cân nhắc `YOLOv8n-seg` sau nếu trường hợp "trẻ đắp chăn" còn sót | | Nhãn polygon tốn gấp 5–10 lần nhãn box, và nặng hơn trên Pi |

## 4. Dữ liệu

### 4.1 Ma trận cảnh cần quay

Mỗi ô là một tổ hợp. Mỗi tổ hợp cần vài clip ngắn (10–30 s), lấy 2–3 khung/giây.

- **Ai:** không ai · người lớn · trẻ ngồi ghế nâng · trẻ trong ghế quay xuôi · em bé trong ghế quay ngược · chó · mèo · trẻ đắp chăn/ngủ nằm.
  Dùng búp bê em bé cỡ thật thay em bé thật.
- **Ở đâu:** từng ghế, sàn xe, cốp (nếu camera thấy).
- **Ánh sáng:** ban ngày nắng gắt · ngược sáng · chiều tối · ban đêm IR · đèn đường nhấp nháy.
- **Gây nhiễu:** người đi ngoài kính · túi/áo khoác trên ghế · ghế trẻ em không có trẻ · kính bám nước mưa.
- **Xe:** ít nhất 3 dòng xe, mỗi dòng một vị trí lắp chuẩn.

### 4.2 Nguồn

| Nguồn | Dùng cho | Lưu ý |
|---|---|---|
| Nhóm tự quay | Train + đánh giá chính | Cần đồng ý bằng văn bản của người lớn và phụ huynh; mặt làm mờ trước khi rời máy quay; thời hạn lưu và cách xóa (luật dữ liệu cá nhân, `COMPLIANCE_BASELINE.md` §2) |
| SVIRO (ảnh tổng hợp ghế sau) | Train thêm, nhiều kiểu ghế trẻ em | Giấy phép CC BY-NC-SA 4.0: chỉ phi thương mại |
| TICaM (cabin thật và tổng hợp, có mask) | Tham khảo, train thêm nếu giấy phép cho phép | Kiểm tra giấy phép trước khi dùng |
| Video do AI tạo | Chỉ để demo | Không dùng để đánh giá |

### 4.3 Quy tắc gán nhãn (rút gọn)

- Gán nhãn `person` kể cả khi chỉ thấy một phần (tay, đỉnh đầu). Người khó nhìn là trường hợp quan trọng nhất.
- `child`/`adult` ghi ở thuộc tính riêng, không phải lớp detector. Không chắc thì ghi `unknown`.
- Người ngoài kính vẫn gán nhãn `person`, kèm cờ `outside`, để kiểm tra rằng ROI loại đúng.
- Chia train/val/test **theo xe và theo buổi quay**, không chia theo khung. Chia theo khung làm số đo đẹp giả.

## 5. Train và tiêu chí chấp nhận

```bash
python embedded/finetune/train.py --data embedded/finetune/cabin.yaml --epochs 60 --imgsz 320
python embedded/finetune/export_model.py runs/cabin/edge/weights/best.pt --imgsz 320
```

Chạy trên GPU (Colab đủ), không chạy trên Pi. Train ở 320 vì Pi chạy ở 320.

Tiêu chí để một model mới được dùng (tập test độc lập, theo `COMPLIANCE_BASELINE.md` §3.1 và §5.4):

| Chỉ số | Mục tiêu |
|---|---|
| Trẻ có mặt mà cả clip không báo (M-S1) | 0 |
| Recall `person` theo từng ô ma trận (đặc biệt trẻ trong ghế, ban đêm IR) | ≥ 0,95 mỗi ô; báo riêng từng ô, không chỉ báo trung bình |
| Báo nhầm có người trên clip cabin trống | ≤ 1 lần / 8 giờ clip |
| Thời gian trên Pi 5, ảnh 320 | ≤ 150 ms / khung (đo bằng `embedded/cabin_edge/bench.py`) |
| Video `child-rear` trong simulator | Khớp (hiện tại: không khớp) |

Thay model là thay đổi ngưỡng/an toàn: hai người duyệt, ghi `COMPLIANCE_BASELINE.md` §5.3 và CHANGELOG, có cách quay về bản cũ.

## 6. Trả lời các câu hỏi của người góp ý

**Báo nhầm, báo hai lần (người mở cửa đi ra, trời mưa, người vẫn trong xe).**
Mỗi ghế có trạng thái riêng. Một phát hiện mạnh (≥ 0,40) nhận ngay; phát hiện yếu cần 3/5 khung; ghế chỉ được nhả sau 20 s
khung tốt liên tục không thấy ai. Vì vậy một khung sót không đóng sự cố, khung sau cũng không mở sự cố thứ hai.
Có test cho việc này (`test_video_frames_go_through_rules_to_an_incident`). Đo trên video cabin trống: 4 khung báo nhầm
"person" yếu đều bị chặn, không có cảnh báo. Mưa trên kính nằm trong vùng kính loại trừ; ảnh mờ hoặc tối thì báo lỗi camera.

**Khi nào reset.**
Sự cố chỉ đóng khi có dữ liệu mới cho thấy không còn ai **và** có người bấm xác nhận đã kiểm tra cabin (SR-03). Bằng chứng
trẻ em được giữ cho đến lúc đó. Hết chuyến hoặc mở cửa **không** tự reset. Ảnh tham chiếu cabin trống chỉ chụp lại khi có người xác nhận (SR-09).

**Người đi ngoài đường thấy qua kính.**
Hiệu chỉnh ROI theo xe (mục 2). Đã có ở phía người dùng: Cabin Noir → trang thiết bị trong xe → Video mẫu (vùng ghế khai báo theo từng video; xử lý ngay trên máy người dùng).

**Mỗi xe một kích thước khoang, có hiệu chỉnh ROI khi lắp không.**
Có. Hiệu chỉnh lưu theo từng xe, có version và nhật ký kiểm toán (`PUT /api/v1/admin/demo/calibration/{vehicle_id}`).
Pi hiện đọc ROI từ file cấu hình lúc lắp; việc Pi tự lấy hiệu chỉnh từ backend chưa làm.

**Xử lý video hay từng khung; xử lý trên hộp hay gửi về trung tâm.**
Xử lý từng khung, ngay trên Pi 5 trong xe (camera mua ngoài nối vào hộp). Chỉ kết quả (lớp, độ tin cậy, trạng thái ghế, nhiệt độ)
được gửi lên; ảnh gốc không rời thiết bị. Mất mạng thì xe vẫn tự đánh giá được.

**Lỗi trên hộp: phần cứng, firmware cập nhật, crash giữa chừng.**

| Tình huống | Hiện có | Còn thiếu |
|---|---|---|
| Tiến trình crash | systemd `Restart=always`, khởi động lại sau 3 s | Watchdog phần cứng (`WatchdogSec` + `sd_notify`) cho trường hợp treo mà không crash |
| Camera rút, che, đứng hình | Cổng chất lượng → UNVERIFIED/ERROR, không bao giờ "trống" | |
| Mất mạng | Uplink thử lại có backoff; backend thấy dữ liệu cũ → ERROR và offline trên dashboard | **SR-07: còi/đèn tại chỗ khi mất kết nối** chưa có |
| Cập nhật firmware hỏng giữa chừng | Backend lưu `firmware` và `target_firmware` của từng thiết bị | Cập nhật kiểu A/B (hai phân vùng), tự quay về bản cũ nếu bản mới không gửi nhịp tim trong N phút |
| Mất điện | Nhịp tim dừng → backend báo offline | Pin dự phòng/siêu tụ để kịp gửi tin cuối |
