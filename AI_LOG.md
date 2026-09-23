# AI log — BUILD_PHASE

Nhật ký các yêu cầu dành cho AI và kết quả thực hiện trong project. Mỗi yêu cầu được thêm thành một mục mới.

## 2026-09-23 — Thiết lập AI log cho project

- **Yêu cầu:** Ghi AI log cho các prompt trong project BUILD_PHASE.
- **Đã làm:** Tạo `AGENTS.md` để hướng dẫn AI cập nhật log sau mỗi yêu cầu; tạo `AI_LOG.md` và ghi mục đầu tiên.
- **Tệp thay đổi:** `AGENTS.md`, `AI_LOG.md`.
- **Kiểm tra:** Xác nhận project chưa có AI log; `logs/events.jsonl` là log sự kiện ứng dụng.
- **Còn tồn đọng:** Không.

## 2026-09-23 — Quy ước BUILD_PHASE và P068

- **Yêu cầu:** Xác định `BUILD_PHASE` là nơi làm việc và thử nghiệm; `P068` là thư mục GitHub cần push 2 ngày một lần.
- **Đã làm:** Ghi quy ước vai trò hai thư mục và nhịp push vào `AGENTS.md`.
- **Tệp thay đổi:** `AGENTS.md`, `AI_LOG.md` trong `BUILD_PHASE`.
- **Kiểm tra:** Chưa tìm thấy thư mục `P068` tại `/Users/mac/P068` hoặc trong Desktop, Documents, Downloads và `BUILD_PHASE`.
- **Còn tồn đọng:** Chưa xác định đường dẫn thực tế của `P068`.

## 2026-09-23 — Xác định thư mục P-068

- **Yêu cầu:** Làm rõ thư mục GitHub nằm trong folder `AI` và có tên `P-068`.
- **Đã làm:** Cập nhật `AGENTS.md` với đường dẫn chính xác `/Users/mac/AI/P-068`.
- **Tệp thay đổi:** `AGENTS.md`, `AI_LOG.md` trong `BUILD_PHASE`.
- **Kiểm tra:** Đã xác nhận thư mục tồn tại và là Git repository.
- **Còn tồn đọng:** Không.

## 2026-09-23 — Thiết kế Backend và Reasoning Agent cho CabinSentinel

- **Yêu cầu:** Rà soát repository và chốt kiến trúc Sensor Fusion, FastAPI, MQTT, LangGraph, safety rules, action/HITL, log và triển khai offline cho Sprint 0.
- **Đã làm:** Đọc mã và test trong `BUILD_PHASE`, đối chiếu `P-068` hiện là template; viết tài liệu kiến trúc triển khai được, nêu rõ gap hiện tại, hợp đồng dữ liệu, thứ tự rule, failure handling, test matrix và Definition of Done. Không triển khai lại backend trong lượt này.
- **Tệp thay đổi:** `BUILD_PHASE/docs/BACKEND_REASONING_ARCHITECTURE.md`, `BUILD_PHASE/AI_LOG.md`; không đổi tệp trong `P-068`. Lệnh test hiện tại có phát sinh event vận hành trong `BUILD_PHASE/logs/events.jsonl`.
- **Kiểm tra:** Chạy `.venv/bin/python -m pytest -q` trong `BUILD_PHASE`: 32 passed. Kiểm tra các mục chính của tài liệu. Test hiện có chưa bao phủ toàn bộ contract và safety gap mới nêu.
- **Còn tồn đọng:** Sprint 0 cần sửa ingest MQTT tự đánh giá, freshness/ordering, rule radar, GET read-only, pending HITL có xác thực, action idempotency/persistence và đồng bộ kết quả sang `P-068` theo kế hoạch của chủ project.

## 2026-09-23 — Bổ sung kiểm thử thời gian và ngữ cảnh EV/ICE

- **Yêu cầu:** Thêm delay/latency và ngưỡng đạt cho test Sprint 0; xử lý EV Pet/Camp Mode và xe xăng đề nổ từ xa.
- **Đã làm:** Cập nhật architecture trong `BUILD_PHASE` với telemetry nguồn/HVAC/mode/SOC/remote deadline/driver/gear, rule deterministic theo xe đỗ hoặc đang chạy, policy TTL/dwell/hysteresis, 20 test scenario và benchmark latency. Đối chiếu hành vi mode và remote start bằng tài liệu chính hãng Tesla, Hyundai; ghi rõ các ngưỡng là mục tiêu MVP cần hiệu chuẩn theo xe.
- **Tệp thay đổi:** `BUILD_PHASE/docs/BACKEND_REASONING_ARCHITECTURE.md`, `BUILD_PHASE/AI_LOG.md`; không đổi `P-068`.
- **Kiểm tra:** Kiểm tra cấu trúc tài liệu, 20 test ID liên tiếp, 12 rule có thứ tự và ba ví dụ JSON hợp lệ. Không chạy lại test code vì lượt này chỉ sửa tài liệu; kết quả 32 test trước đó chưa xác nhận các rule mới.
- **Còn tồn đọng:** Cần cập nhật simulator, adapter và code/test theo contract mới; cần chọn target edge hardware để nghiệm thu latency và hiệu chuẩn ngưỡng nhiệt/SOC theo model xe.

## 2026-09-23 — Rà soát rules, skills và workflow cho CabinSentinel

- **Yêu cầu:** Đánh giá các thư viện rules/skills/workflow được chia sẻ và tìm thêm lựa chọn phù hợp với project.
- **Đã làm:** Đọc cấu trúc `BUILD_PHASE`, kiến trúc Sprint 0, cấu hình AI/CI của `P-068` và đối chiếu nguồn công khai. Đề xuất ưu tiên rule riêng cho an toàn và ranh giới hai thư mục, skill LangGraph và quy trình kiểm thử/đánh giá; chỉ ra link thư viện skills chưa xác minh được và các nguồn chỉ nên dùng tham khảo.
- **Tệp thay đổi:** `BUILD_PHASE/AI_LOG.md`; không đổi mã hay cấu hình trong `BUILD_PHASE` hoặc `P-068`.
- **Kiểm tra:** Kiểm tra các tệp project và trang nguồn; không chạy test vì chỉ phân tích và ghi log.
- **Còn tồn đọng:** Chưa cài skill/rule; cần chọn bộ ngắn để triển khai, rồi xác minh nội dung từng skill trước khi cài.

## 2026-09-23 — Cài bộ rules, skills và workflow thiết yếu

- **Yêu cầu:** Cài những thành phần cần thiết từ đề xuất rules/skills/workflow cho CabinSentinel.
- **Đã làm:** Trong `BUILD_PHASE`, cài 5 skill được chọn (`langgraph-fundamentals`, `langgraph-human-in-the-loop`, `systematic-debugging`, `test-driven-development`, `verification-before-completion`), tạo skill riêng `cabinsentinel-safety-review`, bổ sung quy tắc an toàn vào `AGENTS.md` và hai workflow cho thay đổi safety và chuẩn bị đồng bộ. Không sửa `P-068` vì repo đó hiện còn template và chưa đến bước chuyển mã.
- **Tệp thay đổi:** `BUILD_PHASE/AGENTS.md`, `BUILD_PHASE/.agents/skills/**`, `BUILD_PHASE/.agents/workflows/safety-change.md`, `BUILD_PHASE/.agents/workflows/sync-to-p068.md`, `BUILD_PHASE/AI_LOG.md`; không đổi tệp trong `P-068`.
- **Kiểm tra:** Xác nhận 6 skill có frontmatter, tên khớp thư mục và description; kiểm cú pháp shell của tệp đi kèm. Validator chính thức chưa chạy vì Python môi trường thiếu `PyYAML`; dùng kiểm tra cấu trúc độc lập. Không chạy test ứng dụng vì không sửa mã.
- **Còn tồn đọng:** Skill mới có hiệu lực trong lượt làm việc tiếp theo; chưa đồng bộ sang `P-068` hoặc push GitHub.
