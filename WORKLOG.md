# Worklog — Team T068 - GradFlow

> Ghi lại tất cả công việc đã làm theo ngày. Ai làm gì, kết quả gì.

---

## 2026-09-30

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Nguyễn Khánh | Hoàn thiện Backend Alerts & Incident Lifecycle (Task BACKEND-ALERTS-20260930) | ✅ Done | `src/cabinsentinel/alerts.py`, `timer.py`, `service.py`, `models.py` | 4.5h |
| Nguyễn Khánh | Viết bộ kiểm thử chuyên sâu cho vòng đời cảnh báo và timeout leo thang | ✅ Done | `tests/test_alert_incidents.py`, `tests/test_alert_lifecycle.py` (Full 157 tests PASS) | 2.5h |
| Nguyễn Khánh | Xây dựng script kiểm thử HTTP tích hợp YOLO v8 thật không qua mock | ✅ Done | `scripts/verify_alert_flow.py` (7/7 PASS trên localhost:8002) | 1.5h |
| Nguyễn Khánh | Soạn tài liệu kiểm chứng an toàn và hướng dẫn chạy kiểm thử backend | ✅ Done | `docs/BACKEND_ALERTS_VERIFICATION_2026-09-30.md`, `docs/BACKEND_ALERTS_TEST_GUIDE.md` | 1.5h |
| Thu Hiền | Rà soát tiêu chí đánh giá rubric BTC và chuẩn bị hồ sơ checkpoint | 🔄 WIP | Bảng rà soát yêu cầu và kế hoạch submission | 2h |
| Bảo Tâm | Thử nghiệm độ chính xác mô hình YOLO với bộ dữ liệu cabin thực tế | 🔄 WIP | Báo cáo đánh giá false negative trên mẫu ảnh trẻ em | 2.5h |
| Anh Tú | Rà soát contract API V1 và setup môi trường UI nhận dữ liệu cảnh báo | 🔄 WIP | Wireframe code và cấu hình mock endpoint | 2h |

**Tổng kết ngày:** Hoàn thành toàn diện hệ thống quản lý cảnh báo an toàn và sự cố (Backend Alert Lifecycle) với SQLite persistence, cơ chế leo thang cảnh báo (escalation 3s/90s/60s), ràng buộc ≤15s từ lock event, xử lý mất tín hiệu explicit, 157 unit tests và script kiểm thử HTTP thực tế 7/7 kịch bản đều PASS.

---

## 2026-09-29

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Nguyễn Khánh | Họp daily standup & lập kế hoạch triển khai API V1 online | ✅ Done | Mục tiêu horizon đến 05/11 trong `AI_LOG.md` | 1.5h |
| Nguyễn Khánh | Đánh giá kiến trúc deploy: VPS/Render/Docker, phân tích CORS & HTTPS | ✅ Done | Tài liệu phương án hosting online demo | 2h |
| Nguyễn Khánh | Chuẩn bị tích hợp cơ chế bảo vệ sự cố & state machine cảnh báo độc lập | ✅ Done | Phác thảo module `alerts.py` và thiết kế timer | 2.5h |
| Thu Hiền | Quản lý tiến độ dự án, điều phối việc review PR #1 và thống nhất mốc bàn giao | ✅ Done | Merge PR #1 checkpoint V1 vào luồng chính | 1.5h |
| Bảo Tâm | Nghiên cứu tích hợp mô hình phân loại độ tuổi (age classifier) và SVIRO dataset | ✅ Done | Báo cáo đánh giá độ phù hợp (tạm hoãn tích hợp vào V1 để bảo đảm an toàn) | 3h |
| Anh Tú | Khảo sát thư viện đồ họa & UI dashboard cho Web App tích hợp API V1 | 🔄 WIP | Lựa chọn template Next.js / Tailwind CSS | 2h |

**Tổng kết ngày:** Chốt kế hoạch đưa API V1 online phục vụ demo liên tục đến 05/11, thống nhất giữ V1 gọn nhẹ với YOLO stock và dồn trọng tâm vào độ tin cậy của Backend Safety Alerts.

---

## 2026-09-28

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Nguyễn Khánh | Giới hạn tải đồng thời cho demo upload (admission control) | ✅ Done | Commit `d9f6faa` (`src/cabinsentinel/demo_api.py`) | 2h |
| Nguyễn Khánh | Đóng gói và kiểm chứng Docker CPU container local, fix lỗi Pillow & healthcheck | ✅ Done | Commit `c327bad`, `2203041` (Docker Compose + CI workflow) | 3h |
| Nguyễn Khánh | Soạn thảo tài liệu bàn giao Frontend MVP V1 chi tiết | ✅ Done | `docs/FRONTEND_HANDOFF_V1.md`, commit `c327bad` | 2h |
| Nguyễn Khánh | Tạo nhánh `feat/v1-online-integration`, hoàn thiện tích hợp vision và CI smoke test | ✅ Done | Nhánh `feat/v1-online-integration` (commit `d09a099`, `2203041`) | 2.5h |
| Thu Hiền | Review kiến trúc tổng thể, kiểm tra quy ước PR #1 và kế hoạch demo khách hàng | ✅ Done | Biên bản review & xác nhận checklist bàn giao | 2h |
| Bảo Tâm | Cung cấp thông số cấu hình YOLO CPU (conf=0.25, imgsz=640) và quy ước lớp nhận diện | ✅ Done | `src/vision/provider.py` | 2h |
| Anh Tú | Tiếp nhận tài liệu Handoff V1, chuẩn bị layout trang demo giám sát cabin xe | ✅ Done | Thiết kế khung dashboard và luồng tương tác người dùng | 2.5h |

**Tổng kết ngày:** Đạt cột mốc bàn giao MVP V1 kỹ thuật cho Frontend với đầy đủ tài liệu API, Docker CPU container đã qua kiểm chứng, cơ chế phòng vệ nghẽn tải, và bộ CI smoke test tự động.

---

## 2026-09-27

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Nguyễn Khánh | Xây dựng pipeline tích hợp Vision Online V1 (WIP) | ✅ Done | Commit `a9a1f54` (`src/cabinsentinel/demo_api.py`, `src/vision/`) | 4h |
| Nguyễn Khánh | Viết bộ chuyển đổi dữ liệu Vision Adapter sang cấu trúc chuẩn SensorPayload | ✅ Done | `src/cabinsentinel/vision_adapter.py` | 2h |
| Bảo Tâm | Hỗ trợ cấu hình detector inference trên môi trường CPU không GPU rời | ✅ Done | Hướng dẫn tải weights YOLOv8n chuẩn và checklist checksum | 2h |
| Thu Hiền | Cập nhật tiến độ tuần 3, kiểm tra các kịch bản demo: normal, parked_locked, hot_locked | ✅ Done | Danh sách kịch bản thử nghiệm MVP | 1.5h |
| Anh Tú | Nghiên cứu giao tiếp HTTP multipart/form-data upload ảnh và xử lý mã lỗi 503 | ✅ Done | Skeleton fetch API phía client | 2h |

**Tổng kết ngày:** Hoàn thành khung kết nối luồng phân tích thị giác vào backend API, cho phép tải ảnh lên trực tiếp và nhận phân tích trạng thái an toàn cabin xe.

---

## 2026-09-26

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Nguyễn Khánh | Tăng cường logic suy luận ghế ngồi và bằng chứng phát hiện (seat evidence reasoning) | ✅ Done | Commit `3b7db30` (`src/cabinsentinel/rules.py`, `service.py`) | 4h |
| Nguyễn Khánh | Viết test case xử lý xung đột cảm biến và chống báo động giả khi có tài xế | ✅ Done | Bổ sung test suites trong `tests/test_cabinsentinel.py` | 2.5h |
| Thu Hiền | Rà soát quy tắc an toàn xe điện (EV Pet Mode, Camp Mode) và xe xăng đề nổ từ xa | ✅ Done | Bổ sung safety rule specs vào tài liệu kiến trúc | 2h |
| Bảo Tâm | Thu thập và phân loại tập ảnh cabin thử nghiệm ban đầu | ✅ Done | Thư mục mẫu ảnh cayenne và test samples | 2h |
| Anh Tú | Phác thảo giao diện cảnh báo các cấp độ SAFE, NOTICE, CRITICAL, ERROR | ✅ Done | Bản vẽ wireframe chi tiết các trạng thái badge | 2h |

**Tổng kết ngày:** Hoàn thiện và củng cố logic suy luận trung tâm (reasoning engine) của CabinSentinel, giải quyết bài toán chống báo động giả khi xe đang vận hành hoặc có người lớn đi kèm.

---

## 2026-09-23

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Nguyễn Khánh | Hiện thực hóa mã nguồn Backend Sprint 0: FastAPI, MQTT ingest, Sensor Fusion, SQLite | ✅ Done | Commit `c7c5b5a`, tạo và push nhánh `Khanh` | 5h |
| Nguyễn Khánh | Đồng bộ và chuẩn hóa toàn bộ AI logs vào repo P-068 theo quy định BTC | ✅ Done | Commit `9c62ea7`, `1711063`, `182c86f` trên `main` | 2h |
| Nguyễn Khánh | Thiết lập các script hỗ trợ ghi log và submission hooks | ✅ Done | Commit `a2d5854`, `de4a7fd` | 1.5h |
| Thu Hiền | Họp phân công nhiệm vụ Sprint 0 & rà soát tiến độ nhánh `Khanh` | ✅ Done | Kế hoạch phân chia module backend, vision, frontend | 2h |
| Bảo Tâm | Khởi tạo nhánh `BaoTam`, nghiên cứu tích hợp YOLOv8 trên Raspberry Pi | ✅ Done | Nhánh `remotes/origin/BaoTam`, tài liệu nghiên cứu Pi 5 | 2h |
| Anh Tú | Khởi tạo nhánh `Anh-Tu`, đồng bộ mã nguồn ban đầu từ `main` | ✅ Done | Nhánh `remotes/origin/Anh-Tu` | 1.5h |

**Tổng kết ngày:** Đưa toàn bộ mã nguồn Backend Sprint 0 lên nhánh `Khanh`, đồng bộ đầy đủ AI Log lịch sử lên nhánh `main`, và phân tách nhánh làm việc độc lập cho từng thành viên trong team.

---

## 2026-09-20

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Thu Hiền | Hoàn thiện hồ sơ nộp Gate G1: Brief, PRD, Checklist và cấu hình GitHub Actions | ✅ Done | Commit `6eddb27`, `8cb5670` (`submission/DEV03_CabinSentinel_GateG1/`) | 6h |
| Thu Hiền | Thiết lập pre-commit hook và script xác thực hồ sơ nộp bài tự động | ✅ Done | `scripts/validate_submission.py`, `.github/workflows/gate-g1.yml` | 2h |
| Nguyễn Khánh | Đóng góp phản biện kỹ thuật cho PRD: kiến trúc Edge AI, cảm biến, ngưỡng nhiệt 35°C | ✅ Done | Đóng góp nội dung cho `02_CabinSentinel_PRD.pdf` | 3h |
| Bảo Tâm | Khảo sát phần cứng camera góc rộng và bộ xử lý Raspberry Pi 5 cho bài toán in-cabin | ✅ Done | Báo cáo đề xuất phần cứng trong PRD | 2h |
| Anh Tú | Thiết kế Wireframe và UI Flow cho ứng dụng giám sát an toàn xe hơi | ✅ Done | `03_CabinSentinel_Wireframe_UI_Flow.pdf` | 3.5h |

**Tổng kết ngày:** Toàn đội hoàn thành xuất sắc mốc Gate G1 đúng hạn, đẩy đủ 4 tài liệu bắt buộc, thiết lập pipeline kiểm tra tự động và đạt trạng thái sẵn sàng cho giai đoạn Sprint 0.

---

## 2026-09-10

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Thu Hiền | Tiếp nhận repository dự án từ Ban tổ chức, họp kickoff nhóm T068 - GradFlow | ✅ Done | Commit `5ff83ab` (Initial commit repository P-068) | 2h |
| Cả nhóm | Đọc hiểu tài liệu định hướng DEV-03 CabinSentinel, phân tích yêu cầu cuộc thi | ✅ Done | Biên bản họp khởi động dự án | 2h |
| Nguyễn Khánh | Khảo sát khung mã nguồn mẫu, boilerplate cấu hình môi trường và tài liệu hướng dẫn | ✅ Done | Ghi chú kỹ thuật về Docker, CI/CD, Python template | 2h |
| Bảo Tâm | Tìm hiểu các mô hình phát hiện đối tượng nhẹ (YOLOv8 nano, MobileNet) | ✅ Done | Danh sách mô hình ứng viên | 1.5h |
| Anh Tú | Tìm hiểu kiến trúc ứng dụng giám sát ô tô thời gian thực | ✅ Done | Tài liệu tham khảo UX/UI | 1.5h |

**Tổng kết ngày:** Khởi tạo dự án, phân định vai trò thành viên trong nhóm T068 - GradFlow, xác định rõ bài toán CabinSentinel: Giám sát an toàn trẻ em và thú cưng bị bỏ quên trong xe.
