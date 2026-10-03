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

## 2026-09-23 — Chẩn đoán lỗi gửi AI log theo tài liệu onboarding

- Yêu cầu: Xác định lỗi ở bước AI log khi push, đọc thêm PDF onboarding để đối chiếu.
- Đã làm: Đọc toàn bộ hướng dẫn onboarding; rà pre-push hook, Python launcher, script quét/gửi log, môi trường Python và sự hiện diện của cấu hình/log (không đọc hoặc ghi giá trị token vào nhật ký).
- Tệp thay đổi: `BUILD_PHASE/AI_LOG.md`; không đổi mã hoặc `P-068`.
- Kiểm tra: GitHub push trước đó thành công ở commit `182c86f`. Hook chọn Python 3.9, trong khi `log_antigravity.py` dùng cú pháp type hint cần Python 3.10+; Python được chọn thiếu `python-dotenv` nên không nạp `.env`, dù file có cấu hình server/key. `.ai-log/session.jsonl` hiện không có dữ liệu mới; hook cố ý trả exit 0 khi hai bước thất bại/bỏ qua.
- Còn tồn đọng: Cần sửa cách chọn Python/hook và xác minh cơ chế ghi prompt của Codex ở workspace dùng thực tế; sau đó tạo một log thử hợp lệ và kiểm tra trên Phoenix AI Logs. Chưa xác minh token/server bằng POST thật.

## 2026-09-23 — Rà soát phần Khánh và đưa backend Sprint 0 vào repo nhóm

- Yêu cầu: Kiểm tra phần Backend & Sensor đã làm, chỉnh cho phù hợp repository GitHub `P-068` của nhóm.
- Đã làm: Đối chiếu phân công và kiến trúc với mã ở `BUILD_PHASE` và template `P-068`; thêm module CabinSentinel dưới `P-068/src/cabinsentinel`, API Vision/GET, MQTT subscriber, simulator, rule LangGraph xác định, SQLite state/event, action mock, trạng thái pending unlock có hủy/hết hạn, và cảnh báo hạn remote start. Cập nhật Docker Compose Mosquitto, sơ đồ kiến trúc, README và cấu hình mẫu. Giữ route chat template để không làm hỏng phần sẵn có.
- Tệp thay đổi: `BUILD_PHASE/AI_LOG.md`; `P-068/AI_LOG.md`, `.env.example`, `README.md`, `docker-compose.yml`, `docs/architecture_diagram.md`, `mosquitto.conf`, `requirements.txt`, `scripts/cabinsentinel_sensor_simulator.py`, `src/config.py`, `src/main.py`, `src/cabinsentinel/*`, `tests/test_cabinsentinel.py`. Không chỉnh thay đổi mode có sẵn của `P-068/scripts/_pyrun.sh`.
- Kiểm tra: `P-068` qua 31/31 test, Ruff, `git diff --check`, YAML Compose parse hợp lệ; smoke test MQTT local với broker tạm và SQLite tạm cho ra CRITICAL, hai action `simulated` và unlock `pending_human_confirmation`. Chưa chạy Docker Compose vì máy này không có lệnh Docker.
- Còn tồn đọng: Chưa push/commit; cần tích hợp Vision và frontend thật, phân quyền/idempotency cho xác nhận unlock, adapter/feedback xe và kênh cảnh báo thật, test đầy đủ TC01–TC20 cùng latency/recall trên Raspberry Pi 5. Hook AI log/grading server vẫn cần xử lý riêng.

## 2026-09-23 — Tạo nhánh Khanh và push phần Backend & Sensor

- Yêu cầu: Tạo nhánh tên chính xác `Khanh` trong repo GitHub nhóm và tạm đẩy phần CabinSentinel lên đó.
- Đã làm: Xác nhận remote chỉ có `main`, tạo nhánh `Khanh` từ `main`, commit phần backend/sensor/tài liệu đã kiểm thử bằng tác giả GitHub noreply của tài khoản đăng nhập và push thành công lên `origin/Khanh`. Không stage thay đổi mode có sẵn của `scripts/_pyrun.sh`.
- Tệp thay đổi: `BUILD_PHASE/AI_LOG.md`, `P-068/AI_LOG.md`; phần CabinSentinel trong `P-068` thuộc commit `c7c5b5a` trên nhánh `Khanh`.
- Kiểm tra: Trước commit, `P-068` qua 31/31 test, Ruff và `git diff --cached --check`; push trả thành công và nhánh tracking `origin/Khanh` được thiết lập. Hook pre-push vẫn lỗi cú pháp type hint của `log_antigravity.py` dưới Python cũ và bỏ qua gửi grading AI log vì không thấy `AI_LOG_SERVER`; GitHub push không bị chặn.
- Còn tồn đọng: Cần xử lý hook/grading AI log riêng; chưa mở PR hoặc nhập `Khanh` vào `main`.

## 2026-09-23 — Kiểm kê AI log cũ trên nhánh Khanh

- Yêu cầu: Giữ mã CabinSentinel trên nhánh `Khanh` và bổ sung các AI log cũ còn thiếu, chỉ thao tác với log.
- Đã làm: Đối chiếu `BUILD_PHASE/AI_LOG.md` với `P-068/AI_LOG.md`, hai JSONL gốc trong `.ai-log/archive` với bản đã theo dõi ở `docs/ai-log-archive`, và log Gate G1 trong `submission/`. Xác nhận toàn bộ các log project cũ đã có trên nhánh `Khanh`; thêm mục kiểm kê này để theo dõi yêu cầu. Không đưa `logs/events.jsonl` hoặc `.mqtt_bus/messages.jsonl` vào AI log vì đó là dữ liệu vận hành ứng dụng.
- Tệp thay đổi: `BUILD_PHASE/AI_LOG.md`, `P-068/AI_LOG.md`; không đổi mã, các JSONL cũ hoặc `scripts/_pyrun.sh`.
- Kiểm tra: `AI_LOG.md` hai thư mục khớp trước khi thêm mục mới; SHA của hai JSONL lưu trong `docs/ai-log-archive` khớp byte với bản gốc `.ai-log/archive`; `git ls-tree` xác nhận AI log cũ và log Gate G1 đã được theo dõi từ `main` và có trên `Khanh`.
- Còn tồn đọng: Hook gửi AI log lên grading server vẫn cần sửa riêng; không cần chép trùng các log cũ đã có trong Git.

## 2026-10-02 — Cabin frontend integration + Owner V1 demo

- TASK_ID: FRONTEND-INTEGRATION-20261002; owner FRONTEND_AGENT / INTEGRATION_TEST_AGENT, current agent. User decision DECISION-20261002-OWNER-DEMO-V1: mở rộng Owner Web dùng phiên demo V1, giữ UI và bổ sung upload.
- BUILD_PHASE: đọc AGENTS/architecture/handoff, clone Cabin riêng `Cabin-frontend` SHA2ab2d21fec531fbb84254c594defebfbcbc92c5c; audit live HF REST FastAPI1.0.0, clone source snapshot0123ee55797ba34a1710ce776fc1b0673be8caf6 vào `Cabin-backend-live-snapshot` không sửa. Local Gradio/camera khác live, giữ công việc backend khác.
- Tệp sửa: dashboard client/adapter/types/store/presentation/test; Owner App/mapping/i18n/styles/env/README; script verify-live-integration.py; docs integration report/API matrix, sanitized evidence và AGENT_HANDOFF; root handoff thêm audit notice. Không đổi backend API/schema/TTL/rules/actionpolicy. Tokens memory-only, không ghi vào log/evidence.
- Kiểm thử: CODE_CHANGED=YES; TEST_EXECUTED=YES; TEST_PASSED=62 frontend/workspace +181 backend regression(source snapshot) +19 HTTP live; final build/typecheck/lint exit0. Runtime browser upload publicperson/syntheticempty, CRITICAL+SIMULATED/pending, staleUNKNOWN, invalidPNG, outage, double-submit1request, ack/resolve, Owner routes và responsive390 hết overflow. INTEGRATION_VERIFIED/RUNTIME_VERIFIED cho V1 localfrontend↔onlinebackend; no physical actuator/child-safety validation.
- Các lượt lỗi được sửa: freshness thiếu mộtnguồn/telemetry không giữcurrentSAFE; TS test enumwidening, caller scope ActionProgress và Owner longsessionIDoverflow. Test expected giữ nguyên; rerun pass. Các trạng thái planned/attempted/unknown/simulated/pending và current unlock canceled phân biệt.
- Còn tồn: product account/fleet/preferences/WebRTC/seatpositions/trends/unlockconfirmation thiếu contract; Operations/mobile runtime chưa kiểm chứng; analyze chưa Idempotency-Key, no auto retry; productionfrontend URL/CORS chưa deploy; stockYOLO childgap và npm audit(root17, dashboard2) chưa giải quyết. Phoenix cohort4/rubric không truy cập xác minh được ngày2026-10-02: UNVERIFIED, PO owner; không READY_TO_SUBMIT.
- Handoff: `Cabin-frontend/docs/BUILD_PHASE_INTEGRATION_2026-10-02.md`, `docs/AGENT_HANDOFF_FRONTEND_2026-10-02.md`; run commands tại frontend/README và apps/owner-web/README.
- P-068: không sửa, sync, commit hoặc push; chỉ thực hiện workflow sync khi user yêu cầu.
- Bổ sung bằng chứng cuối: production bundles Owner4183/dashboard5183 chạy với backend live, upload public fixture → CRITICAL + Mô phỏng + pending; receipt/screenshot production-runtime.

## 2026-10-03 — Cabin feed realtime + preview privacy decision

- TASK_ID: FRONTEND-REALTIME-20261002; OWNER: FRONTEND_AGENT. User requested realtime tracking in dashboard Cabin feed. DECISION-20261002-REALTIME-PREVIEW: làm mờ toàn khung preview, nhãn privacy đúng; frame gốc vẫn tới backend YOLO. Existing CAMERA-SOURCES/YOLO contracts reused; Owner V1 upload decision remains recorded separately.
- BUILD_PHASE: camera API client/controller, opt-in preview/blur capability fallback, bbox matched capture, frame time/latency/freshness; camera-vs-REST state/polling isolation; stop/error/disconnect invalidation and late result discard; modal stop; env/README/test scripts/docs/evidence. Imported existing local backend camera code in verification harness; no changes to backend checkout/public API/schema/rules/TTL/actions.
- VERIFIED FACT: live HF /info rechecked2026-10-03 only /analyze, camera endpoints absent; documented camera deployment differs from active REST. Local real model yolov8n.pt CPU + public fixture fake browser camera used; no private webcam frames. UI raw video hidden, preview whole-frame blur; unsupported filter yields0 visible drawImage, no face anonymization claim or persistence in web storage.
- CODE_CHANGED=YES; TEST_EXECUTED=YES; TEST_PASSED=79 frontend/workspace,28 backend camera,12 real HTTP; typecheck/lint/workspace build exit0. Native fetch Illegal invocation reproduced/fixed with red-green test; privacy filter capability red-green tests. Initial workspace build failed on Expo ~/.expo sandbox permission; cache redirected to /private/tmp then passed; test expectations not changed to hide failure.
- INTEGRATION_VERIFIED=LOCAL; RUNTIME_VERIFIED=LOCAL production5183 + actual YOLO/canonical backend. Browser normal continuousframes/bbox, hotCRITICAL with Mô phỏng/pendingunlock, outageUNKNOWN/no old bbox, permission denied, modal stopNO_FEED/ERROR and REST upload resume; HTTP auth/duplicate/conflict/stale/invalidimage/read-only/lateframe checked. Online camera and webcam/Pi/vehicle hardware NOT_VERIFIED; child/seat safety NOT_VALIDATED.
- Gaps: approved camera API not deployed to active REST HF; telemetry/eventhistory/actionledger/unlockconfirm omitted by camera contract and disclosed; Pi attachment/preview UI not implemented. BACKEND_AGENT owns additive active REST migration + authorized deploy; device owner hardware verification. Existing Owner/dashboard REST integration unchanged. No P-068 changes, commit, push or sync.
- Handoff: Cabin-frontend/docs/REALTIME_FRONTEND_INTEGRATION_2026-10-03.md; root/clone docs/AGENT_HANDOFF_REALTIME_FRONTEND_2026-10-03.md; root frontend handoff annotated. Files changed detailed there. CHECKPOINT REALTIME-VERIFICATION local pass; confidence90% scoped contract, no FPS/hardware/online promise.
- RULE-26: Phoenix Cohort4 and Demo Day checked2026-10-03; tool access unavailable, rubricUNVERIFIED, PO owner; no READY_TO_SUBMIT.
- Bổ sung cuối: header phân biệt REST health và state API reachability (không suy Internet từ localhost). Rerun dashboard63 tests + typecheck/lint/build exit0; py_compile Python3.12 pass với cache /private/tmp; git diff --check pass. Test scripts không ghi credential/frame bytes vào evidence.

- Final checkpoint bổ sung: 4 test race mới được xác nhận red→green (late camera stop sau IMAGE, control của camera cũ, REST incident trả về sau CAMERA, concurrent stop generation). CODE_CHANGED/TEST_EXECUTED=YES; TEST_PASSED=83 frontend/workspace (67 dashboard +16 workspace), typecheck/lint/full workspace build exit0. Backend28 và HTTP12 đã pass, backend source không đổi.
- Browser production kiểm phản hồi stop bị giữ20s, upload live REST hoàn tất trong lúc chờ; state giữ đúng vehicle/session REST sau stop được deliver, video released, old camera không ghi đè. Evidence browser-delayed-stop-race.json passed=true. Handoff/report đã cập nhật83 tests. P-068 không đổi.

## 2026-10-03 — Original preview and compact alerts
User requested removing whole-frame blur and fullscreen/background-blurring alerts. DECISION-20261003-RAW-PREVIEW-INLINE-ALERT supersedes prior blur decision. Changed BUILD_PHASE/Cabin-frontend dashboard video renderer/labels, CriticalModal, App/Overview placement, CSS and component tests; removed obsolete blur helper/tests. Updated README, integration report and AGENT_HANDOFF. Tests64/64, production build/typecheck and lint pass; local browser+actual YOLO fake public camera confirms original preview, inline CRITICAL, no blur/modal/focus trap, expandable details and camera stop. Evidence/report: Cabin-frontend/docs/UI_PREVIEW_ALERT_2026-10-03.md. Hardware/online camera unverified; rubric access unavailable. P-068 unchanged.

## 2026-10-03 — Backend realtime camera integration
- TASK_ID BACKEND-CAMERA-INTEGRATION-20261003; owner BACKEND_AGENT. User asked to continue backend integration across frontend. Audited active HF source snapshot SHA0123ee55797ba34a1710ce776fc1b0673be8caf6; local older Gradio source SHA080c8e746dde3daf024074f7b9cc40646b3de6c0 remains distinct.
- CHANGE INTENT: add existing approved CAMERA_API_V1 five Gradio methods to active-source entrypoint, sharing REST CabinService, safety timer and loaded YOLO; preserve REST public contract and safety/action semantics. No deployment/publication.
- CODE_CHANGED: BUILD_PHASE/Cabin-backend-live-snapshot/app.py + camera modules/tests/README/docs/evidence; Cabin-frontend camera state validator accepts ERROR/DISCONNECTED and integration docs updated. P-068 unchanged.
- TEST_EXECUTED / PASSED: live-source regression 181, camera API 25, frontend workspace 82; dashboard build/typecheck/lint and full workspace/mobile/operations/owner build pass.
- INTEGRATION_VERIFIED/RUNTIME_VERIFIED local: frontend5183 -> backend7862 Gradio → public fake camera image → real YOLO frame37/4 detections → backend CRITICAL, plus camera start session readable with same bearer from REST. NO_FEED yields ERROR/current=false, browser camera stop succeeds. Health/schema/CORS verified locally.
- Limits: HF online deployment remains unchanged; production URL CORS/API, webcam/Pi hardware unverified. Product API requirement NEED_USER_DECISION: account/roles, family/access, fleet, notification preferences/emergency contact, telemetry retention/trends, Ops/Mobile auth/session mapping. Phoenix Cohort4 and Demo Day URLs checked 2026-10-03 but inaccessible, rubric UNVERIFIED (PO).
- AGENT_HANDOFF next: PO clarifies product identity/fleet/history contracts; BACKEND_AGENT designs approved APIs; DEPLOY_AGENT publishes only when separately authorized. See Cabin-backend-live-snapshot/docs/BACKEND_CAMERA_INTEGRATION_2026-10-03.md.

## 2026-10-03 — BaoTam inference/model packaging PR candidate
- TASK_ID CABIN-BAOTAM-PR-20261003; OWNER BACKEND_AGENT. User authorized verifying latest P-068 models and creating a Cabin PR. Added offline inference modules from BaoTam f7c04a0, model manifest/setup/import checks, bundled pinned YuNet+MIT license, tests and Docker CI coverage. CLI source is isolated from current REST risk/action pipeline. Corrected earlier audit overstatement: age.py was absent from Cabin main before this patch.
- VERIFIED: 287 Python tests +11 subtests pass; focused44 +11; Ruff and YAML parse pass; actual public YOLOv8s/YuNet/H.2644-frame smoke, pinned public model checks, missing age check exits1. Six initial loopback failures were sandbox-only and unchanged cases pass after escalation. Model tests use synthetic checkpoints for format routing, not the missing trained artifact.
- Model artifacts: YuNet tracked; public YOLO n/s remain setup-time downloads under existing ignored-artifact convention. True newest age-router checkpoint/hash/license unavailable in GitHub tree, source checkouts and Releases; MISSING/complete=false retained. No production/child accuracy/hardware/age runtime claim. Docker daemon missing locally; CI container verification pending.
- Files changed in BUILD_PHASE/Cabin-models-pr only plus root BUILD_PHASE AI log; P-068 files untouched. CHANGE INTENT and evidence: docs/BAOTAM_MODEL_PACKAGE.md, docs/BAOTAM_MODEL_PACKAGE_VERIFICATION.md and docs/evidence-baotam-models/verification.json. CODE_CHANGED=YES; TEST_EXECUTED=YES; TEST_PASSED local Python; INTEGRATION_VERIFIED local offline detector/privacy/video only. AGENT_HANDOFF: VISION_AGENT supplies exact checkpoint/provenance/license, BACKEND_AGENT verifies it; future age safety mapping requires user/SAFETY_AGENT decision.
- RULE26: Phoenix C4 dashboard/Demo Day inaccessible in web tool2026-10-03; rubric UNVERIFIED, PO owner; no READY_TO_SUBMIT. CHECKPOINT: candidate ready for draft PR review; full trained model set not available.
