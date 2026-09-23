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

## 2026-09-23 — Đưa toàn bộ AI log hiện có lên P-068

- **Yêu cầu:** Đưa các AI log của project lên GitHub qua repository `P-068`.
- **Đã làm:** Sao chép `BUILD_PHASE/AI_LOG.md` vào gốc `P-068`, giữ log Gate G1 đã có, và đưa ba bản ghi JSONL từ `.ai-log/archive` vào `P-068/docs/ai-log-archive/` dưới dạng snapshot theo dõi được. Fast-forward `P-068` trước khi commit; chỉ stage các log, giữ nguyên thay đổi sẵn có của `scripts/_pyrun.sh`. Commit `9c62ea7` đã push lên `origin/main`.
- **Tệp thay đổi:** `BUILD_PHASE/AI_LOG.md`; `P-068/AI_LOG.md`, `P-068/docs/ai-log-archive/2026-09-20.jsonl`, `P-068/docs/ai-log-archive/2026-09-23.jsonl`. Không đồng bộ mã ứng dụng.
- **Kiểm tra:** Ba JSONL parse hợp lệ; rà mẫu credential không thấy secret; `git diff --cached --check` qua và push GitHub trả thành công. Hook pre-push không gửi lên grading server vì thiếu `AI_LOG_SERVER`; bước quét Antigravity của hook lỗi cú pháp Python trên môi trường hiện tại nhưng không chặn GitHub push.
- **Còn tồn đọng:** Cần cấu hình grading server nếu muốn nộp AI logs qua hook; các thay đổi mã/kiến trúc chưa được đồng bộ sang `P-068` trong yêu cầu chỉ upload log này.

## 2026-09-23 — Giải thích MQTT trong kiến trúc CabinSentinel

- **Yêu cầu:** Giải thích MQTT là gì và cách nó kết nối với các thành phần còn lại.
- **Đã làm:** Đối chiếu sơ đồ kiến trúc và luồng dữ liệu; giải thích vai trò publisher, broker Mosquitto, subscriber Backend, sensor fusion, Vision HTTP, LangGraph, action và Frontend. Không sửa mã hoặc kiến trúc.
- **Tệp thay đổi:** `BUILD_PHASE/AI_LOG.md`; không đổi `P-068`.
- **Kiểm tra:** Đọc lại phần tổng quan và data flow trong `docs/BACKEND_REASONING_ARCHITECTURE.md`; không chạy test vì chỉ giải thích.
- **Còn tồn đọng:** Không.

## 2026-09-23 — Sơ đồ kết nối thiết bị với Raspberry Pi 5

- **Yêu cầu:** Vẽ các khối thiết bị chính, cách kết nối và dữ liệu trao đổi khi dùng Raspberry Pi 5.
- **Đã làm:** Tạo sơ đồ Mermaid vật lý và luồng dữ liệu, bảng giao tiếp camera/cảm biến/vehicle gateway/MQTT/Frontend/action/modem/nguồn, cùng phạm vi demo và tích hợp xe thật. Liên kết sơ đồ từ tài liệu kiến trúc chính; đối chiếu cổng camera, GPIO, mạng và nguồn Pi 5 với tài liệu Raspberry Pi chính hãng.
- **Tệp thay đổi:** `BUILD_PHASE/docs/RPI5_DEVICE_CONNECTIONS.md`, `BUILD_PHASE/docs/BACKEND_REASONING_ARCHITECTURE.md`, `BUILD_PHASE/AI_LOG.md`; không đổi `P-068`.
- **Kiểm tra:** Kiểm tra cấu trúc sơ đồ và bảng, đường dẫn liên kết nội bộ và thông số Pi 5 theo tài liệu chính hãng. Không chạy test ứng dụng vì chỉ thay đổi tài liệu.
- **Còn tồn đọng:** Cần chọn model sensor/camera, xác nhận giao diện và quyền truy cập ECU/actuator theo xe cụ thể, đo nguồn/nhiệt khi lắp thật.

## 2026-09-23 — Đánh giá khả năng Pi 5 điều khiển HVAC và mode xe

- **Yêu cầu:** Xác định Raspberry Pi 5 gắn thêm có thể điều khiển điều hòa hoặc bật Pet/Camp Mode hay không.
- **Đã làm:** Đối chiếu tài liệu chính hãng về API lệnh HVAC/Pet/Camp của Tesla, điều hòa từ xa của VF 8 và giới hạn phần cứng Pi 5; phân biệt demo, API hãng qua mạng, gateway nội bộ được xe cho phép và đấu nối trực tiếp không phù hợp.
- **Tệp thay đổi:** `BUILD_PHASE/AI_LOG.md`; không đổi mã/tài liệu khác hoặc `P-068`.
- **Kiểm tra:** Đọc tài liệu Tesla Fleet API, hướng dẫn Tesla/VinFast và tài liệu GPIO Pi; không chạy test vì chỉ đánh giá tính khả thi.
- **Còn tồn đọng:** Cần model/năm/phần mềm xe và quyền truy cập API/gateway được hãng cho phép để kết luận có thể điều khiển offline trên xe cụ thể.

## 2026-09-23 — Xác định bước tiếp theo và nội dung cần học

- **Yêu cầu:** Đề xuất thứ tự công việc tiếp theo và kiến thức cần tìm hiểu cho CabinSentinel dùng Raspberry Pi 5.
- **Đã làm:** Đối chiếu mã hiện tại, Definition of Done Sprint 0, sơ đồ Pi 5 và các dependency xe/Vision/Frontend; lập thứ tự ưu tiên từ chốt contract, hoàn thiện backend, demo trên bàn đến tích hợp xe thật.
- **Tệp thay đổi:** `BUILD_PHASE/AI_LOG.md`; không đổi mã/tài liệu khác hoặc `P-068`.
- **Kiểm tra:** Xác nhận repo hiện có app MQTT/FastAPI/LangGraph và hai tệp test, trong khi các service fusion/persistence và test mode/latency chưa có. Không chạy test vì chỉ lập kế hoạch.
- **Còn tồn đọng:** Cần chốt model xe/gateway được phép dùng và target Pi 5 cụ thể để nghiệm thu latency, nguồn và HVAC feedback.

## 2026-09-23 — Rà soát hai thư mục project

- Yêu cầu: Đọc lại `BUILD_PHASE` và `P-068`, tóm tắt phần đã làm và các mục chủ project cần kiểm tra.
- Đã làm: Kiểm kê mã, tài liệu, bài test, Git và hồ sơ Gate G1 của hai thư mục; đối chiếu thiết kế Sprint 0 với backend hiện tại và kiểm tra các đường dẫn validator/hook được README nhắc tới.
- Tệp thay đổi: `BUILD_PHASE/AI_LOG.md` (mục rà soát này). Không thay đổi `P-068`.
- Kiểm tra: `BUILD_PHASE` chạy 32/32 test thành công. `P-068` chưa chạy được test tại máy: `.venv` thiếu `pytest`, Python hệ thống thiếu `pytest_asyncio`; các tệp Gate G1 validator/hook ghi trong README không có ở đường dẫn nêu. Git `P-068` ở `main`, có sẵn thay đổi mode của `scripts/_pyrun.sh`.
- Còn tồn đọng: Backend Sprint 0, Pet/Camp Mode, remote start, điều khiển Pi 5/HVAC và ngưỡng delay mới chỉ ở mức thiết kế; cần chủ project duyệt quy tắc và kiểm tra phần cứng/khả năng tích hợp xe trước khi triển khai. Cần sửa môi trường test và xác minh hồ sơ Gate G1 trước lần đồng bộ GitHub tiếp theo.

## 2026-09-23 — Tổng hợp kế hoạch và yêu cầu để chủ project chỉnh sửa

- Yêu cầu: Đọc lại hai thư mục, trả kế hoạch và toàn bộ nhóm yêu cầu đã đề xuất để chủ project sửa.
- Đã làm: Đối chiếu mã/test/tài liệu `BUILD_PHASE`, bốn PDF Gate G1 và template/AI log của `P-068`; lập bản kế hoạch có giai đoạn, yêu cầu đo được, Definition of Done và bảng các mâu thuẫn cần quyết định.
- Tệp thay đổi: `BUILD_PHASE/docs/PROJECT_PLAN_FOR_REVIEW.md`, `BUILD_PHASE/AI_LOG.md`. Không đổi `P-068`.
- Kiểm tra: Đã trích nội dung toàn bộ trang của bốn PDF Gate G1 và rà lại các phần liên quan trong mã/tài liệu; lượt này chỉ sửa tài liệu nên không chạy lại test ứng dụng. Kết quả gần nhất của `BUILD_PHASE`: 32/32 test qua, chưa xác nhận các yêu cầu Sprint 0 mới.
- Còn tồn đọng: Chủ project cần chốt phạm vi Pi 5/xe thật, action CRITICAL, debounce/hysteresis, ngưỡng và mẫu xe; sau đó mới đồng bộ rule matrix, code/test và tài liệu Gate G1/P-068.

## 2026-09-23 — Đối chiếu phân công Khánh và deadline Sprint 0

- Yêu cầu: Đọc Google Doc phân công, tóm tắt bài toán/app, việc của Khánh và tiến độ so với deadline.
- Đã làm: Đọc các tab Action Plan, Brief, PRD và các tab còn lại trong Google Doc; đối chiếu ba đầu ra Sprint 0 của Khánh với simulator, MQTT subscriber, FastAPI, LangGraph, test và `P-068`.
- Tệp thay đổi: `BUILD_PHASE/AI_LOG.md`; không đổi mã hoặc `P-068`.
- Kiểm tra: Chạy lại `BUILD_PHASE` test: 32/32 qua. Broker local báo kết nối trong test, nhưng test chủ yếu gọi state store/API trực tiếp, chưa chứng minh luồng publish MQTT → tự đánh giá → action. Google Doc ghi deadline Sprint 0 là 24/09/2026; ngày rà soát 23/09/2026.
- Còn tồn đọng: Cần demo và test end-to-end ba đầu ra của Khánh, nhất là MQTT tự kích hoạt đánh giá, schema/freshness và xử lý action an toàn; mã chưa chuyển sang `P-068`. Phạm vi Pi 5, HVAC và EV/ICE mode là mở rộng so với Sprint 0 trong Google Doc, cần chốt riêng.

## 2026-09-23 — Giải thích CabinSentinel cho khách hàng phổ thông

- Yêu cầu: Diễn giải mô tả MVP bằng ngôn ngữ dễ hiểu cho người không có nền tảng kỹ thuật.
- Đã làm: Viết ví dụ người/thú cưng còn trong xe, các mức cảnh báo, giới hạn của bản demo, cách hiểu mục tiêu nhận diện/độ trễ và giới hạn cảnh báo khi mất Internet.
- Tệp thay đổi: `BUILD_PHASE/AI_LOG.md`; không đổi mã hoặc `P-068`.
- Kiểm tra: Đối chiếu nội dung với PRD và hiện trạng action mock; không chạy test vì chỉ giải thích.
- Còn tồn đọng: Mục tiêu recall, độ trễ và cảnh báo thực chưa được nghiệm thu trên thiết bị/xe thật.

## 2026-09-23 — Đồng bộ AI log mới lên P-068

- Yêu cầu: Đưa các AI log phát sinh từ lần đồng bộ trước lên GitHub qua `P-068`.
- Đã làm: Đồng bộ toàn bộ `BUILD_PHASE/AI_LOG.md` vào `P-068/AI_LOG.md`, gồm các mục giải thích MQTT, Pi 5, rà soát project, kế hoạch, phân công Khánh và giải thích MVP; giữ nguyên thay đổi sẵn có không liên quan của `scripts/_pyrun.sh`.
- Tệp thay đổi: `BUILD_PHASE/AI_LOG.md`, `P-068/AI_LOG.md`; không đồng bộ mã ứng dụng hoặc log sự kiện vận hành.
- Kiểm tra: So sánh local với `origin/main` trước khi đồng bộ; rà mẫu credential trong AI log; kiểm tra diff và trạng thái Git trước/sau push.
- Còn tồn đọng: Tài liệu và mã Sprint 0 chưa được đồng bộ sang `P-068`; kết quả hook gửi log lên grading server cần kiểm tra riêng.
