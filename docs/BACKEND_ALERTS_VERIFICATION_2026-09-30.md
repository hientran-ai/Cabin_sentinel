# Backend alerts — checkpoint evidence 30/09/2026

Task BACKEND-ALERTS-20260930; owner BACKEND_AGENT; reviewer Codex với cabinsentinel-safety-review. Scope backend-only theo quyết định user, không frontend, không actuator thật.

| Yêu cầu | Bằng chứng / trạng thái |
|---|---|
| Cảnh báo cool unattended ngay; hot >=35°C CRITICAL ngay | rules + test_alert_incidents/test_cabinsentinel; HTTP script với YOLO thật: PASS2/4 |
| ≤15s target từ lock event, không bịa locked_at | SensorPayload optional/coherent; lock_timing ghi nguồn, độ trễ, unknown/target missed; test lock event; runtime nguồn SIMULATED |
| Leo thang sau cue đầu, không đổi risk theo số phút | alerts profile cue3s, deadline90s; dispatch trước deadline93s với margin1tick; test91.999/92.5 và riskWARNING; graph route đồng nhất committed risk |
| Lặp60s qua20 phút, không expirySAFE | test từng phút1–21 và1200/1260; SQLite alert state; HTTP-only lifecycle timer |
| Missing/stale/camera lỗi explicit | data_quality + ruleERROR/fallbackwarning; HTTP script dừng packet6s -> ERROR; health timer degraded khi lỗi |
| Nhiệt giảm/mất dữ liệu/restart không mất sự cố | ổn định incident_id + incidentOPEN; fakeclock/restart tests; HTTP script PASS5/6 |
| ACK khác resolution/authorization | token-authenticated ack/resolve; freshABSENT+revision+incident checks; HTTP script PASS3/7; không route unlock thực thi |
| Dedupe / GET chỉ đọc | tests packet duplicates, concurrent timer hai service, GET giữ revision, action key/SQLite BEGINIMMEDIATE |
| Hiệu ứng trace và unknown sau ngắt | action_ledger planned/attempted/outcome unknown/simulated/failed/pending + events; interrupted action test không replay |
| Model hiện có | local MODEL_PATH yolov8n.pt + TamVisionProvider CPU; ảnh cayenne0 -> actual detection, không mock model trong HTTP script |
| Người dùng tự test | Swagger có HTTPBearer; scripts/verify_alert_flow.py 7PASS; hướng dẫn backend/API/test/migration |
| Phát triển sau | VisionProvider boundary, pure rules/alerts, injectable action adapter, optional lock contract, database additive, ruleset_version; không thêm dependency |

BUILD_PHASE/safety-alert-backend: full suite157 pass ngày30/09 trước test từng phút21; test bổ sung từng phút đã pass riêng. Ruff pass. Script HTTP model thật7/7 pass trênlocalhost8002 với MQTTdisabled. Xem AI_LOG để có kết quả cuối sau sync và kiểm lại toàn suite.

Safety diff review: đã sửa các vấn đề phát hiện trong scope: incident đổi khi risk đổi; SAFE từ frame trống sau sự cố; timer chỉ sống cùngMQTT; frame_id=1 bị dedupe khi dùng cùng session; DB tạo/read session cần503; cảnh báo unattended nhầm hot attended; EV PET thiếu attendant; lock event mới không được dùng cảnh báo trướclock để giả target met; action interrupted thiếuunknown; resolve sai revision/source không được clear.

Không nghiệm thu hardware/VF6-7, tốc độ Pi, sensitivity child/occlusion, tuổi, SMS/còi/unlock thật hoặc online domain/CORS runtime online. Deadline phần mềm kiểm bằng clock giả; dispatch margin1tick; độ trễ host/downtime vẫn có thể làm quá deadline và được báo trong metadata, chưa là chứng nhận EuroNCAP. Ngưỡng35°C demo-only. Liveness Docker/CI không rebuild/run cloud ở task này; local native runtime là evidence.

RULE26: đã thử Phoenix Cohort4 dashboard và DemoDay ngày30/09/2026; công cụ web không truy cập được. Rubric BTC hiện hành UNVERIFIED, ownerPO xác minh trước submission. Không tuyên bố READY_TO_SUBMIT.

AGENT_HANDOFF: quyết định implementation/backend-only/manualcheck đã ghi trong hướng dẫn; files mapping được giữ qua sync manifest, không sửa hooks/scripts/log user có sẵn. Next owner user chạy Swagger/script; Backend/Vision xử lý sensor hoặc online khi có task riêng. Policy này là profile demo; approved production thresholds/auth/hardware/action contracts chưa tồn tại.

## Kết quả cuối đã kiểm tại P-068

- Full suite: **160 passed** (7.69s); Ruff `src/tests/scripts/verify_alert_flow.py` pass; `git diff --check` pass.
- HTTP thực từ P-068, YOLO hiện có, MQTTdisabled: 7 bước PASS và PASS5b quan sát timer thật, script exit0.
- Một lần escalation đo được **89.985847s sau cue đầu kết thúc**, <=90s; một lần repeat đúng hạn60s, lateness0. Đây là mẫu đo local, không p95/benchmark Pi/EuroNCAP certification.
- Fake clock đã chạy từng phút1–21, không tự kết thúc hoặc chuyển SAFE; source stale tiếp tục explicitERROR và giữ incident.
- Backend đang chạy trên `http://127.0.0.1:8002`; Swagger `/docs`. Mã backend/test/docs đã đồng bộ20tệp, byte equality20/20; nhánhKhanh. Không frontend, weights/.env/runtimeDB, push/commit hoặc actuator thật.
- Automatic approval review của một lượt pytest bị timeout trước khi khởi chạy; retry một lần thành công. Đây không là test failed hoặc kết luận hành động unsafe.
- Không sửa pre-existing hooks/scripts/CI/JOURNAL/WORKLOG của user.
