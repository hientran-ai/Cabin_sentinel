# Backend alert demo — kiểm luồng và tích hợp API

Ngày: 2026-09-30. Owner: BACKEND_AGENT. Phạm vi: backend, không triển khai frontend.

## Quyết định và hành vi

- DECISION-20260930-IMPLEMENT-ALERTS: user yêu cầu đưa các cải tiến nghiên cứu vào backend, dùng model hiện có, cung cấp API tích hợp và có thể mở rộng sau. Thay thế phạm vi review-only trước đó.
- DECISION-20260930-MANUAL-CABIN-CHECK: kết thúc sự cố bằng xác nhận riêng đã kiểm tra cabin; ACK chỉ xác nhận đã đọc. Backend còn kiểm evidence mới, không có hiện diện/nghi ngờ/conflict, đúng incident/revision và quyền của phiên demo.
- DECISION-20260930-BACKEND-ONLY: chỉ làm backend và kiểm luồng; không bàn giao trang frontend.

`rules.py` đánh giá risk bằng dữ liệu hiện tại; `alerts.py` quản lý vòng đời sự cố/lịch cảnh báo. Điều kiện incident chưa resolved giữ WARNING nằm trong pure rule trước khi LangGraph phân nhánh; state có risk_route để đối chiếu. Không LLM/cloud trong hai phần này.

| Điều kiện | Kết quả |
|---|---|
| Sinh vật xác nhận/nghi ngờ không được giám sát, dữ liệu đủ | WARNING ngay; không chờ 3–5 phút |
| Xác nhận sinh vật, nhiệt >=35°C, chưa xác nhận xe di chuyển có tài xế | CRITICAL ngay |
| Cue đầu | Chu kỳ **mô phỏng** 3 giây; popup/ACK không định nghĩa thời điểm kết thúc cue |
| Leo thang | Deadline 90 giây sau cue đầu (t=93s); dispatch từ t=92s để bù một tick; `send_sms` mô phỏng, risk không tự thành CRITICAL |
| Lặp | Mỗi 60 giây khi unresolved, tiếp tục sau 20 phút; không tự SAFE khi hết thời gian |
| Nhiệt giảm, frame trống, nguồn lỗi/cũ, restart | Không xóa incident đang OPEN; frame trống mới trả UNRESOLVED_OCCUPANT/WARNING chờ cabin check |
| Thiếu/stale camera hoặc sensor | Risk ERROR hoặc fallback WARNING với data_quality UNKNOWN/STALE rõ; radar có hiện diện vẫn là SUSPECTED, không là ABSENT |
| EV PET có HVAC/SOC nhưng chưa có người giám sát | EV_PET_UNATTENDED/WARNING thay NOTICE cũ; tên mode không chứng minh có người giám sát |

35°C là tham số demo `DEMO_HOT_THRESHOLD_C`, chưa được xác nhận là ngưỡng production cho trẻ/pet. COCO YOLO chỉ person/dog/cat; không phân loại tuổi hoặc chứng minh trẻ bị che khuất được phát hiện.

Timer chạy độc lập MQTT ở vòng đời FastAPI, tick 1 Hz, health phát hiện timer lỗi hoặc quá 3 giây không hoàn thành tick. Dispatch có margin1s trước deadline; repeat giữ nhịp60s, có thể phát sớm một tick. Metadata escalation_target_met/repeat_target_met ghi rõ khi host/downtime làm trễ; không tuyên bố đạt Euro NCAP hay timing phần cứng. Phép thử clock giả kiểm logic biên; latency trên Pi/xe thật cần đo riêng.

## Chạy backend

Từ `/Users/mac/AI/P-068` sau bàn giao, dùng môi trường Python có `requirements.txt` và `requirements-vision.txt`:

```sh
MODEL_PATH=/Users/mac/BUILD_PHASE/handoff/CabinSentinel-V1-demo-assets/yolov8n.pt \
CABINSENTINEL_DB_PATH=/private/tmp/cabinsentinel-alert-user-test.db \
CABINSENTINEL_MQTT_ENABLED=false \
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false \
YOLO_CONFIG_DIR=/private/tmp/cabinsentinel-alert-yolo YOLO_AUTOINSTALL=false \
python -m uvicorn src.main:app --host 127.0.0.1 --port 8002
```

Không commit weights/ảnh/.env/database. Nếu port8002 đã có bản thử nghiệm của task này, dùng Swagger hoặc script ngay; cần restart tiến trình đó khi đổi mã. Không dừng backend khác chỉ vì trùng port.

## Kiểm nhanh bằng script — model thật

Trong terminal khác, cùng thư mục và Python environment:

```sh
python scripts/verify_alert_flow.py \
  --base-url http://127.0.0.1:8002 \
  --image /Users/mac/BUILD_PHASE/handoff/CabinSentinel-V1-demo-assets/images/cayenne-0.png
```

Kỳ vọng 7 dòng PASS: health/model/timer; ảnh -> YOLO -> WARNING; auth/ACK; HOT -> CRITICAL cùng incident; không packet -> ERROR sau 6s; cooling/frame trống không tự resolve; cabin check đúng revision -> RESOLVED có audit.

Thêm `--watch-schedule` vào lệnh để quan sát timer thật qua một lần lặp và leo thang (thêm khoảng90giây); script fail nếu quá deadline.

Script dùng ảnh cabin có detection thật và **ảnh trắng tổng hợp** để kiểm nhánh trống; không dùng kết quả này kết luận cabin thật đã trống. Xe và mọi hành động vẫn SIMULATED/pending. Script không in token. Nếu model không phát hiện sinh vật đủ confidence, script fail rõ; chọn ảnh khác và xem detections, không hạ ngưỡng để làm test xanh.

## Test thời gian, lỗi, restart và concurrency

```sh
python -m pytest -q
python -m pytest tests/test_alert_incidents.py tests/test_alert_lifecycle.py tests/test_demo_sessions.py tests/test_demo_error_boundary.py -q
python -m ruff check src tests scripts/verify_alert_flow.py
```

Fake clock kiểm: t=58.999/59.5/60 cho lặp, t=91.999/92/92.5 cho dispatch trước deadline93s, sau1200/1260s chưa resolved; restart không replay; clock lùi báo UNKNOWN_CLOCK_REGRESSION; migration V1 báo LEGACY_TIMING_UNKNOWN; hai service không gửi trùng một lần lặp; hành động bị ngắt còn attempted/outcome unknown; GET không thay revision; resolve stale/wrong revision/presence bị từ chối.

## Test thủ công trong Swagger

Mở `http://127.0.0.1:8002/docs`:

1. `POST /api/v1/demo/analyze`: chọn ảnh JPEG/PNG, scenario `parked_locked`, bỏ trống session_id. Nhận `session_id`, `session_token`, detections, reasoning và actions.
2. Bấm **Authorize**, nhập session_token vào HTTPBearer. Token chỉ dành cho phiên demo, không là quyền điều khiển xe.
3. `GET /api/v1/demo/sessions/{session_id}`: xem risk, occupancy, freshness, incident, alert và action_ledger. GET không chạy lại model hoặc gia hạn source.
4. `POST /acknowledge` với incident_id: incident vẫn OPEN. Gửi lại cùng ACK không tăng revision lần nữa.
5. Analyze lại cùng session_id và scenario `hot_locked`: phải có detection đủ confidence để CRITICAL; cùng incident. Mỗi request là một ảnh mới/model inference mới, không tự replay frame_id=1 của provider.
6. Không gửi dữ liệu 6 giây, GET lại: ERROR/STALE, decision_current=false, incident vẫn OPEN. Analyze ảnh mới để phục hồi evidence.
7. Analyze một ảnh trống mới trong cùng phiên: UNRESOLVED_OCCUPANT/WARNING. Đọc revision hiện tại rồi `POST /resolve` với `{ "incident_id": "...", "revision": 12, "cabin_checked": true }`. Sai revision, nguồn cũ, hiện diện/conflict hoặc sai token => từ chối. Request resolve không gọi unlock.
8. `GET /sessions/{session_id}/events` xem evaluation, alert, intent, attempt, result, acknowledgment và incident_resolution. `simulated` không nghĩa SMS/còi thật đã chạy.

## API contract và mở rộng

API cũ `/vision`, `/state`, `/risk`, `/events` và analyze một lần giữ được cách gọi. New fields additive: incident, alert, data_quality, ruleset_version, sensor_snapshot, action_ledger; `DemoResponse` thêm session_token. Analyze cùng session_id cần Bearer token. Token tạo một lần, lưu hash trong SQLite; client giữ token riêng, không log/đặt token vào URL.

Các route mới:

- GET `/api/v1/demo/sessions/{session_id}`
- GET `/api/v1/demo/sessions/{session_id}/events?limit=50`
- POST `/api/v1/demo/sessions/{session_id}/acknowledge` — incident_id
- POST `/api/v1/demo/sessions/{session_id}/resolve` — incident_id, revision, cabin_checked=true

Frontend sau này chỉ cần dùng contract trên và CORS_ORIGINS đúng domain; không tính risk ở frontend. Demo analyze telemetry là SIMULATED, cập nhật sensor+Vision cùng transaction. Inference chạy threadpool qua VisionProvider; không phụ thuộc tên model trong service. Camera/sensor Pi thật sau này xuất SensorPayload/VisionPayload; MQTT ingest vẫn dùng cùng CabinService.

Lock fields optional của SensorPayload: locked_at (timezone), lock_event_id và lock_event_source (`SIMULATED` hoặc `VEHICLE_TELEMETRY`). Phải đủ bộ, doors_locked=true, locked_at không sau timestamp. Nếu không có event, lock_timing UNKNOWN. Nhãn source là provenance bên gửi khai báo, chưa chứng minh xe thật đã xác thực. Event khóa mới phát nhắc lại ngay, giữ incident và không dời deadline leo thang cũ. Độ trễ >15s ghi TARGET_MISSED; clock future ghi UNKNOWN_CLOCK_SKEW.

SQLite thêm demo_sessions/action_ledger bằng CREATE IF NOT EXISTS; không xóa lịch sử hoặc schema vehicles/events. Nâng backend trước khi publisher gửi lock fields vì backend V1 cũ extra=forbid. Rule IDs/semantics mới gồm EV_PET_UNATTENDED và UNRESOLVED_OCCUPANT; consumer không hardcode EV_PET_MONITORED hoặc coi SAFE cũ là current.

Migration V1: bảo toàn incident có presence, đánh dấu LEGACY_TIMING_UNKNOWN và phát cue notification của profile mới; không bịa timing của lịch cũ vốn chưa tồn tại. State hiện tại mới chứa đầy đủ lịch; các restart sau giữ lịch. Sau downtime phát một notification đến hạn, không burst-replay cửa sổ đã bỏ lỡ hay actuator không rõ kết quả. Clock regression giữ explicit unknown; sửa/review đồng hồ trước khi xác nhận kết thúc, không tự bypass.

Action ledger ghi planned -> attempted/outcome unknown -> simulated/failed/pending trước/sau hiệu ứng. Actions mặc định MockActions; không SMS/call/horn/unlock thật. Adapter thật cần task, quyền, hợp đồng và kiểm safety/freshness/idempotency ngay trước actuator. Session token chưa là auth production cho API sensor/Vision/owner; API v1 cũ vẫn thuộc phạm vi local/demo.

Rollback: dừng writer, backup SQLite nhất quán và giữ source phiên bản cũ trước nâng cấp. Không chạy lẫn worker cũ/mới; một Uvicorn worker. Rollback code cũ mất policy/lịch mới nên chỉ dùng bản backup demo theo quyết định, không âm thầm tiếp tục incident thật bằng logic cũ.

## Evidence và giới hạn

Các kết quả chạy thực tế được ghi vào AI_LOG.md và `BACKEND_ALERTS_VERIFICATION_2026-09-30.md`. Không đồng nhất unit-tested, local-runtime-verified, online, Pi/hardware hoặc safety-validated. Online deployment, sensor/camera Pi và xe VinFast thật chưa thuộc bằng chứng của task backend này.
