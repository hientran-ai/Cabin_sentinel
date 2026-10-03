# Weekly Journal — Team T068 - GradFlow

> Ghi lại mỗi tuần: học được gì, khó khăn gì, quyết định gì, kế hoạch tiếp.

---

## Week 1: 2026-09-10 - 2026-09-16

### Mục tiêu tuần này
- [x] Khởi tạo và thiết lập repository dự án P-068 theo chuẩn của Ban tổ chức.
- [x] Phân tích đề bài DEV-03 CabinSentinel: Hệ thống bảo vệ trẻ em và thú cưng bị bỏ quên trong khoang xe (In-Cabin Safety Agent).
- [x] Họp kickoff đội ngũ, phân chia vai trò thành viên (Leader/PO: Thu Hiền, Backend/Edge: Khánh, Vision: Tâm, Frontend: Tú).
- [x] Khảo sát công nghệ, lựa chọn tech stack chủ đạo (FastAPI, SQLite, MQTT Mosquitto, YOLOv8 nano, Docker).

### Đã hoàn thành
- Thiết lập cấu trúc repo ban đầu với đầy đủ tooling: git hooks, ruff linting, docker compose, hướng dẫn dự án.
- Hoàn thành biên bản họp định hướng kỹ thuật và phân chia trách nhiệm.
- Xác định mục tiêu trọng tâm của sản phẩm: Hệ thống Edge AI hoạt động offline, bảo mật quyền riêng tư không truyền hình ảnh thô ra ngoài, suy luận an toàn mang tính tất định (deterministic).

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Đề bài CabinSentinel yêu cầu xử lý thời gian thực nhưng phần cứng cạnh (Raspberry Pi) tài nguyên hạn chế. | Thống nhất phân tách rõ ranh giới: mô hình thị giác chỉ trích xuất bounding box/tọa độ, logic an toàn do Backend Engine xử lý riêng biệt. | Giảm thiểu độ trễ, tối ưu hóa mức tiêu thụ CPU trên thiết bị nhúng. |
| Các thành viên sử dụng hệ điều hành khác nhau (macOS, Windows, Linux). | Chuẩn hóa môi trường thông qua virtualenv Python 3.11 và Docker container đồng nhất. | Tránh lỗi xung đột môi trường và thư viện phụ thuộc. |

### Bài học
- Trong các ứng dụng liên quan đến an toàn tính mạng (Automotive Safety), LLM không được phép đưa ra quyết định cảnh báo trực tiếp (non-deterministic). Hệ thống cần các Rule-based Safety Checks chặt chẽ làm chốt chặn cuối cùng.
- Phải thiết lập kỷ luật ghi log (AI Log, Worklog) ngay từ tuần đầu tiên để đảm bảo tính minh bạch theo tiêu chí chấm điểm của cuộc thi.

### Kế hoạch tuần sau
- [x] Tập trung toàn lực hoàn thành gói hồ sơ Gate G1: Brief, PRD, Wireframe/UI Flow, Gate G1 Checklist.
- [x] Thiết lập CI pipeline kiểm tra tự động hồ sơ nộp bài.
- [x] Bắt đầu thiết kế kiến trúc chi tiết Backend Sprint 0.

---

## Week 2: 2026-09-17 - 2026-09-23

### Mục tiêu tuần này
- [x] Hoàn thiện 100% hồ sơ nộp Gate G1 trước hạn chót 20/09/2026.
- [x] Thiết kế kiến trúc tổng thể Backend & Reasoning Agent (FastAPI + MQTT + Sensor Fusion + SQLite).
- [x] Phân nhánh Git theo từng thành viên (`Khanh`, `BaoTam`, `Anh-Tu`) và thiết lập cơ chế đồng bộ AI Log.
- [x] Xây dựng khung mã nguồn Backend Sprint 0 trên nhánh `Khanh`.

### Đã hoàn thành
- Nộp hồ sơ Gate G1 thành công (`submission/DEV03_CabinSentinel_GateG1/` gồm 4 tài liệu PDF chuẩn chỉnh và kịch bản validate tự động).
- Hoàn thành tài liệu thiết kế kiến trúc chi tiết: Hợp đồng dữ liệu `SensorPayload`, luồng MQTT ingest, thứ tự đánh giá quy tắc an toàn.
- Đẩy mã nguồn Backend Sprint 0 lên nhánh `Khanh` (commit `c7c5b5a`), thiết lập database SQLite cục bộ lưu trữ telemetry và sự kiện.
- Đồng bộ toàn bộ lịch sử AI Log lên nhánh `main` và nhánh cá nhân.

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Xung đột giữa dữ liệu camera và cảm biến môi trường (ví dụ: nhiệt độ cao nhưng không phát hiện người, hoặc camera bị che khuất). | Thiết kế trạng thái `data_quality` và trạng thái `ERROR` hiển thị rõ ràng, không bao giờ coi việc thiếu tín hiệu là `SAFE`. | Hệ thống phòng thủ an toàn kiểu fail-safe (an toàn khi có sự cố). |
| Tránh báo động sai khi chủ xe sử dụng các tính năng hiện đại như EV Pet Mode, Camp Mode hoặc nổ máy từ xa. | Bổ sung các telemetry về trạng thái xe (`vehicle_state`: HVAC, Remote Start deadline, Pet Mode active) vào luồng suy luận. | Loại trừ trường hợp cảnh báo sai khi điều hòa đang chủ động làm mát. |

### Bài học
- Thiết kế hệ thống an toàn đòi hỏi tư duy bao quát các tình huống bất thường (edge cases) và trạng thái thiếu dữ liệu chứ không chỉ tập trung vào happy path.
- Phân tách nhánh sớm giúp các thành viên phát triển song song mà không dẫm chân lên mã nguồn của nhau.

### Kế hoạch tuần sau
- [x] Tích hợp mô hình thị giác YOLOv8 vào Backend thông qua Vision Adapter.
- [x] Xây dựng API demo upload ảnh phục vụ kiểm thử và bàn giao Frontend V1.
- [x] Đóng gói Docker CPU container và thiết lập kiểm thử tự động trên GitHub Actions CI.

---

## Week 3: 2026-09-24 - 2026-09-30

### Mục tiêu tuần này
- [x] Xây dựng và hoàn thiện luồng tích hợp Vision Online V1 (Demo API synchronous upload).
- [x] Tăng cường logic suy luận ghế ngồi (`seat evidence reasoning`) và cơ chế chống nghẽn tải (admission control).
- [x] Đóng gói Docker CPU container hoàn chỉnh, viết tài liệu bàn giao Frontend Handoff V1.
- [x] Hoàn thiện hệ thống quản lý sự cố và vòng đời cảnh báo (Backend Alert & Incident Lifecycle) độc lập, bền bỉ.
- [x] Viết bộ kiểm thử toàn diện (unit tests + HTTP live script với YOLO thật) đạt chuẩn an toàn.

### Đã hoàn thành
- Tích hợp thành công mô hình YOLOv8 CPU qua `src/vision/provider.py` và bộ chuyển đổi `vision_adapter.py`.
- Tạo nhánh `feat/v1-online-integration`, xử lý cơ chế healthcheck degraded và thêm CI smoke test tự động.
- Soạn thảo tài liệu bàn giao chi tiết `docs/FRONTEND_HANDOFF_V1.md` và hướng dẫn chạy kiểm thử `docs/BACKEND_ALERTS_TEST_GUIDE.md`.
- Triển khai module quản lý cảnh báo độc lập `src/cabinsentinel/alerts.py` và background lifecycle timer `timer.py`:
  - Giữ vững mã sự cố `incident_id` qua nhiều chu kỳ quét, không bị mất khi nhiệt độ hạ hoặc tạm thời mất tín hiệu.
  - Cơ chế leo thang nghiêm ngặt: phát hiện tức thì cảnh báo nguy cấp khi nhiệt độ $\ge 35^\circ\text{C}$ có người bị bỏ lại, lặp lại thông báo mỗi 60s qua 20 phút.
  - Phân định rõ ràng giữa ACK (xác nhận tạm thời) và RESOLVE (giải quyết sự cố với bằng chứng khoang xe trống).
  - Kiểm soát độ trễ khóa cửa $\le 15\text{s}$, ghi nhận minh bạch nguồn dữ liệu thời gian.
- Đạt mốc kiểm thử xuất sắc: 157 unit tests PASS toàn diện, script kiểm thử HTTP thực tế `verify_alert_flow.py` vượt qua 7/7 kịch bản an toàn.

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Khi nhiều người dùng upload ảnh cùng lúc trong buổi demo, server CPU có thể bị treo hoặc tràn RAM. | Áp dụng cơ chế Semaphore admission control (`MAX_CONCURRENT_DEMO_REQUESTS=1`), trả về ngay HTTP 503 kèm header `Retry-After: 1` trước khi đọc multipart body. | Bảo vệ an toàn tiến trình API, tránh crash dịch vụ khi tải tăng đột biến. |
| Nếu chỉ dựa vào sự kiện MQTT, khi không có packet mới gửi tới thì vòng đời cảnh báo và timeout leo thang không thể tự kích hoạt. | Xây dựng Background Lifecycle Timer chạy độc lập với SQLite transaction an toàn (`BEGIN IMMEDIATE`), tự động quét và leo thang cảnh báo theo thời gian thực. | Hệ thống cảnh báo tự vận hành liên tục ngay cả khi luồng dữ liệu cảm biến bị gián đoạn. |
| Nguy cơ chuyển nhầm sang trạng thái `SAFE` khi camera gặp sự cố trả về khung hình rỗng sau khi đã xảy ra sự cố. | Thiết lập quy tắc chốt: Một sự cố đang mở (`incident OPEN`) chỉ được resolve khi có bằng chứng xác thực người lái trở lại hoặc khoang xe hoàn toàn trống với dữ liệu camera hợp lệ (`fresh ABSENT`). | Loại bỏ hoàn toàn lỗ hổng an toàn nghiêm trọng trong logic cảnh báo. |

### Bài học
- Bền vững dữ liệu (Persistence) là yếu tố sống còn: Trạng thái cảnh báo an toàn ô tô không được phép lưu tạm bợ trong bộ nhớ RAM mà phải lưu ngay vào SQLite để không mất dấu sự cố khi tiến trình khởi động lại.
- Tự động hóa kiểm thử bằng script giả lập kịch bản thực tế với model AI thật giúp phát hiện các sai sót logic mà unit test đơn thuần dễ bỏ qua.

### Kế hoạch tuần sau
- [ ] Phối hợp cùng Frontend (Anh Tú) kết nối giao diện Web Dashboard với Backend API V1.
- [ ] Triển khai phiên bản Demo Online lên hạ tầng cloud (Render / VPS) với HTTPS và cấu hình CORS đầy đủ.
- [ ] Tiếp tục tối ưu hóa mô hình Vision với bộ dữ liệu SVIRO/trẻ em từ Bảo Tâm khi có weights custom đã được kiểm định an toàn.
- [ ] Chuẩn bị kịch bản demo và slide thuyết trình Pitch Deck cho buổi bảo vệ sắp tới.
