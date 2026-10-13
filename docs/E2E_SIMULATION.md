# Kiểm thử đầu-cuối: Real Mode và Simulation Mode

Trả lời câu hỏi gửi mentor ngày 11/10/2026: hai chế độ dùng chung backend và logic cảnh báo, chỉ khác nơi chạy AI,
có được xem là E2E hợp lệ không, và cần tiêu chí gì. Mentor trả lời (12/10): **được phép và khuyến khích**; ngoài
upload nên có vài video mẫu; thiết bị thật là cơ sở cho số liệu thực tế, kèm video demo trên Pi.

Mọi con số trong tài liệu này ghi rõ là **đo thật**, **mô phỏng** hay **mục tiêu**.

## 1. Hai chế độ khác nhau ở đâu

| Bước | Real Mode (Pi 5 trong xe) | Simulation Mode (web) |
|---|---|---|
| Nguồn hình | Camera trong xe | Video mẫu hoặc video tải lên, phát trong trình duyệt |
| Phát hiện | YOLO NCNN trên Pi (`embedded/cabin_edge/v3`) | YOLO trên máy chủ backend (`video_sim.py` gọi đúng provider của demo) |
| Vùng cabin (ROI) | `SeatSpec.roi` lúc lắp | Hiệu chỉnh theo từng xe, lưu ở backend (`cabin_calibration`) |
| Theo dõi theo ghế | `SeatTracker`: ≥ 0,40 nhận ngay, 0,15–0,40 cần 3/5 khung, nhả sau 20 s | `SeatSmoother`, cùng thông số |
| Ảnh hỏng | `QualityGate` → UNVERIFIED | Tối/đứng hình → `camera_status` BLOCKED/ERROR |
| Gửi lên | Uplink → `ingest_vision` | `POST /api/v1/admin/demo/video/frame` → **cùng `ingest_vision`** |
| Rules, sự cố, thông báo, dashboard | `rules.py` → incident → ntfy/Telegram → web | **Y hệt** |
| Ảnh | Không rời thiết bị | Từng khung xử lý trong bộ nhớ, không lưu |

Mọi kết quả của Simulation Mode đều gắn nhãn `SIMULATED` (API, nguồn dữ liệu của xe, nhật ký kiểm toán `demo.video_*`).

## 2. Cách dùng (web vận hành → Demo studio → Camera mô phỏng)

1. Chọn xe demo và nhiệt độ cabin (30 °C: đỗ, khóa cửa; 38 °C: nóng).
2. Chọn một trong 4 video mẫu, hoặc tải video của bạn (cần tick đồng ý).
3. Kiểm tra vùng cabin: ghế (xanh) và vùng kính loại trừ (đỏ). Mỗi video mẫu có sẵn vùng; video tải lên dùng hiệu chỉnh đã lưu
   của xe, hoặc tự vẽ rồi bấm **Lưu cho xe này**.
4. Bấm **Bắt đầu mô phỏng**. Bên phải hiện mức rủi ro, rule, trạng thái từng ghế, kỳ vọng so với kết quả, và số đo.
5. Thử sự cố camera: **Che ống kính** (ảnh tối) hoặc **Đứng hình** (lặp một khung). Hệ thống phải báo lỗi camera, không bao giờ coi là xe trống.
6. Sự cố mở ở trang Sự cố; kênh ntfy/Telegram nhận tin nếu đã cấu hình.

| Video mẫu | Nguồn | Thực tế (người xem) |
|---|---|---|
| `child-rear` | Nhóm tự quay, mặt đã làm mờ | Có trẻ trên ghế an toàn phía sau bên phải |
| `empty-cabin` | Nhóm tự quay, cùng xe | Không có ai |
| `adult-front` | Nhóm tự quay, mặt đã làm mờ | Người lớn ghế trước bên trái |
| `ai-child` | Video do AI tạo (Gemini), không có người thật | Trẻ trên ghế nâng, cửa kính thấy đường |

## 3. Tiêu chí và kết quả hiện tại

### 3.1 Latency

| Chỉ số | Mục tiêu | Mô phỏng: localhost, CPU Mac M-series, YOLOv8n 640 (đo thật 13/10/2026) | Real Mode (Pi 5) |
|---|---|---|---|
| Model / khung | ≤ 150 ms (máy chủ) | p50 36–39 ms, p95 42–116 ms | Đo bằng `embedded/dev/pi_sim/bench_stages.py`; chưa có bảng đo trên Pi thật trong repo |
| Khứ hồi / khung (trình duyệt ↔ backend) | ≤ 500 ms | p50 45–54 ms, p95 55–176 ms | Không áp dụng |
| Từ khung có người đến cảnh báo | ≤ 3 s | 0,0–0,1 s sau khi bắt đầu, với người thấy rõ | Cần đo |
| Trên HF Space (CPU dùng chung, từ Việt Nam) | ≤ 1,5 s khứ hồi | **Chưa đo**: cần đo sau khi deploy | |

### 3.2 Reliability

| Chỉ số | Mục tiêu | Mô phỏng (đo thật) |
|---|---|---|
| Khung xử lý / khung gửi | ≥ 99 % | 346/346 qua 3 lượt đo bằng script, 0 lỗi; lượt chạy trên giao diện: 0 khung muộn, 0 lỗi |
| Khung đến muộn | Bị bỏ, không ghi đè khung mới (409) | Có test `test_video_frames_go_through_rules_to_an_incident` |
| Detector sót vài khung giữa chừng | Không đóng sự cố, không mở sự cố thứ hai | Có test; số sự cố mở cho một lần có người = 1 |
| Che ống kính / đứng hình | ERROR, không bao giờ SAFE (SR-01, SR-02) | Đo thật trên giao diện: ERROR / CAMERA_UNAVAILABLE, bỏ che thì về WARNING |
| Ngừng gửi khung | Dữ liệu thị giác cũ sau 3 s → ERROR | Theo `rules.py` (TTL thị giác 3 s) |

### 3.3 Detection performance (đo thật, YOLOv8n COCO gốc, chưa finetune)

| Video | Kết quả backend | Đúng? |
|---|---|---|
| `adult-front` | WARNING `COOL_OCCUPANT` 40/40 khung, 1 sự cố | Đúng |
| `ai-child` 30 °C | WARNING 50/50 khung | Đúng |
| `ai-child` 38 °C | CRITICAL `HOT_OCCUPANT` 50/50 khung | Đúng |
| `empty-cabin` | SAFE 62/62; 4 khung có "person" yếu bị bộ lọc 3/5 chặn | Đúng (nhưng xem SR-01 dưới đây) |
| `child-rear` | **SAFE `EMPTY_CABIN` 42/42 khung** | **Sai: sót trẻ** |

Với `child-rear`, mình đã thử YOLOv8n và v8s ở 640 và 960, ngưỡng 0,05. **0/21 khung** có khung người ≥ 0,40 tại ghế của trẻ
(v8s 960: 2/21 khung ≥ 0,15). Model lớn hơn không giải quyết được. Đây là lỗi dữ liệu, cần finetune trên ảnh cabin
(xem `IN_CABIN_SETUP_AND_FINETUNE.md`).

Kết quả này cũng cho thấy vi phạm SR-01 đang mở ở `rules.py` (ghi trong `COMPLIANCE_BASELINE.md` §4): không phát hiện được
gì thì backend trả `SAFE / EMPTY_CABIN`. Với trẻ bị sót, màn hình báo an toàn. Simulator hiển thị trường hợp này là **Không khớp**,
và ghi rõ SAFE chỉ nghĩa là "không thấy bằng chứng". Sửa SR-01 là thay đổi luật an toàn, phải theo quy trình §5.4.

### 3.4 Tính nhất quán giữa mô phỏng và thực tế

Mục tiêu: cùng một clip cho **cùng phán quyết theo ghế** ở cả hai môi trường. Quy trình đề xuất (chưa chạy):

1. Quay clip bằng chính camera trên Pi, lưu kèm `seats_*.json` (đã có cho video1–3 trong `embedded/dev/pi_sim`).
2. Chạy clip qua pipeline Pi (`embedded/dev/pi_sim/simulate.py`) và qua simulator (cùng vùng ghế), ghi trạng thái từng ghế mỗi giây.
3. Chỉ số: tỷ lệ giây có trạng thái ghế giống nhau ≥ 95 %; không có giây nào Pi báo có người mà simulator báo SAFE (và ngược lại).
4. Khác biệt chấp nhận được: model khác (NCNN 320 trên Pi, PyTorch 640 trên máy chủ). Khác biệt phải ghi lại, không được giấu.

### 3.5 Sau khi thêm ảnh tham chiếu, ghế trẻ em quay ngược và quét chi tiết (YOLO26n, đo thật 13/10/2026)

Hai clip của cùng một xe (`child-rear`, `empty-cabin`) được căn về một góc camera như khi bắt vít cố định
(`embedded/dev/pi_sim/stabilise.py`). Ảnh tham chiếu là khung đầu của clip cabin trống.

| Mẫu | Không có ảnh tham chiếu | Có ảnh tham chiếu |
|---|---|---|
| Trẻ ghế sau | SAFE 42/42 (sót) | **WARNING sau 1,9 s**, `rear_right` = `SEAT_CHANGED`, 1 sự cố |
| Cabin trống | SAFE | SAFE 62/62, 0 báo nhầm |
| Ghế sau phải khai báo là ghế quay ngược (dùng video cabin trống) | WARNING `BABY_SEAT_UNVERIFIED` từ khung đầu | như cột bên |
| Người lớn ghế trước | WARNING ngay | (không có ảnh tham chiếu cho xe này) |
| Trẻ (video do AI tạo) | WARNING ngay | (không có ảnh tham chiếu cho xe này) |

- **Quét chi tiết** (cắt các ghế đánh dấu, chạy detector lần hai) không giúp gì trên các clip này. Không có ảnh tham chiếu thì trẻ ghế sau
  vẫn bị sót, mà thời gian model mỗi khung tăng từ ~38 ms lên ~80 ms. Lần thử đầu, quét chi tiết còn tạo một khung "person" 0,47
  giả ở ghế trống. Vì vậy kết quả quét chi tiết giờ chỉ được tính là ứng viên (cần 3/5 khung), và khi có ảnh tham chiếu thì
  chỉ được tính trên ghế đã khác ảnh trống. Mặc định bật cho hai ghế sau của xe mẫu; tắt được theo từng ghế.
- Ghế xe hay bị detector gọi là `chair`/`couch`: chỉ hiển thị, không tính là đồ bỏ quên.
- Giới hạn: ghế `front_right` của clip trẻ có độ giống ảnh trống dao động 0,37–0,62 vì clip quay cầm tay vẫn rung sau khi căn.
  Camera bắt vít thật sẽ ổn định hơn. Kiểm tra lại ở buổi quay thử (`CAMERA_POSITION_TRIAL.md`).
- Khi trời nóng, nghi có người (`possible_occupant`) vẫn chỉ ra WARNING. Rules chỉ nâng lên CRITICAL khi chắc chắn có người.
  Muốn nghi có người cũng được CRITICAL thì phải đổi luật an toàn theo quy trình §5.4.

## 4. Còn thiếu

- Đo trên HF Space và trên Pi 5 thật; video demo trên Pi (mentor yêu cầu).
- Video mẫu có thú cưng và đồ bỏ quên (chưa có video hợp lệ).
- Sửa SR-01 và finetune detector cho trẻ ở ghế sau.
- Pi lấy hiệu chỉnh ROI từ backend (hiện Pi đọc từ file cấu hình).
