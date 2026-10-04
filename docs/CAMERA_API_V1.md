# Camera API V1 — browser và Raspberry Pi

Task: CAMERA-API-20261002. Owner: BACKEND_AGENT. Ngày: 2026-10-02.

## Quyết định và phạm vi

DECISION-20261002-CAMERA-SOURCES: User chọn hỗ trợ **cả trình duyệt và Raspberry Pi**. Scope: camera capture client và API nhận frame trong demo HF. Quyết định này không phê duyệt sensor/actuator thật, safety policy mới hoặc FPS tối thiểu.

Thiết kế mở rộng entrypoint Gradio hiện có. Backend quản lý phiên nhận frame; client browser/Pi mới là thành phần mở, chụp và giải phóng camera thật. `requested=STOPPED` chỉ là trạng thái yêu cầu của backend. Chỉ `device_reported=STOPPED` mới là phản hồi client đã đóng camera, không phải xác nhận độc lập của phần cứng.

Vision dùng model inference; trạng thái xe theo scenario `normal`, `parked_locked`, `hot_locked` tiếp tục **SIMULATED**. Kết quả action có thể là `simulated` hoặc `pending_human_confirmation`; không gọi actuator thật hoặc tự xác nhận mở cửa.

DECISION-20261002-CAMERA-YOLO: User yêu cầu backend nhận diện liên tục từ camera bằng **YOLO đã có sẵn**. Adapter tái sử dụng model tại `MODEL_PATH`, không train thêm; luồng camera chọn CUDA device `0` trong GPU allocation khi có CUDA, CPU khi không có. Default CPU của lời gọi adapter cũ được giữ. Các nhãn/threshold hiện có không được thay. Với cấu hình hiện tại, detection là `person`, `dog`, `cat`; không tự nhận là phân loại tuổi/trẻ em.

## Contract mở rộng và migration

Giữ `/gradio_api/call/test_analyze_ui` và schema ảnh đơn hiện tại. Thêm các hàm dưới đây; gọi bằng POST `{ "data": [...] }`, lấy `event_id`, rồi GET SSE tại cùng đường dẫn `/{event_id}`. `GET /gradio_api/info` mô tả tham số sau khi deployment mới chạy.

| API name | `data` theo thứ tự | Ý nghĩa |
|---|---|---|
| `camera_start` | `[scenario, source]` | Tạo phiên mới; `source`: `browser` hoặc `raspberry_pi`. Trả `session_id` và `session_token` một lần. |
| `camera_status` | `[session_id, session_token]` | Đọc snapshot đã commit + freshness hiện tại; không tăng revision. |
| `camera_frame` | `[session_id, session_token, image, sequence, captured_at]` | Ảnh Gradio FileData như upload hiện tại; sequence là số nguyên dương tăng dần; captured_at là ISO8601 có timezone tại lúc chụp. |
| `camera_stop` | `[session_id, session_token]` | Dừng nhận frame, commit NO_FEED và yêu cầu client đóng camera; gọi lặp không phát action/revision mới. |
| `camera_report` | `[session_id, session_token, device_status]` | Client báo `ERROR`, `DISCONNECTED` hoặc `STOPPED`; không dùng lỗi camera làm evidence cabin trống. |

Kết quả có các field ảnh đơn (`risk_level`, `reason`, `rule_id`, `occupancy_state`, `actions`, `vision_detections`) và thêm `revision`, `incident_id`, `camera_status`, `decision_current`, `freshness`, `camera`, `frame`, `simulation`. `vision_detections[].bbox` là `[x1,y1,x2,y2]` theo pixel ảnh gửi lên; `frame` gồm `sequence`, `captured_at`, `width`, `height`, `latency_ms`. Không có frame hợp lệ thì `frame=null`, detection không được xem là negative evidence. `simulation.vision_source=UNAVAILABLE` khi source không OK; `MODEL_INFERENCE` khi có model frame. Bounding box dùng cho hiển thị, không thay risk rules/schema VisionPayload đã có.

Token là credential của phiên, phải giữ trong memory/file mode 0600; không ghi vào URL, console, AI log hoặc commit. Status/stop/frame/report đều kiểm quyền phiên. Mỗi lần bắt đầu mới tạo session riêng; sau stop không resume session cũ. Sau Space restart, control session không phục hồi: trả `SESSION_NOT_FOUND`, client giải phóng camera và yêu cầu bắt đầu phiên mới. SQLite vẫn giữ audit/state theo cơ chế sẵn có; không thay schema persistence.

Không dùng các FastAPI route có trong source như thể đã được expose trên HF. Đây là migration additive: frontend cũ dùng ảnh đơn; client camera chuyển sang API mới và giữ cùng session qua nhiều frame. Rollback: dừng client camera rồi quay lại entrypoint trước; dữ liệu SQLite không cần destructive migration.

## Client chạy thử

Source trong `BUILD_PHASE/deploy/huggingface/clients/`:

- `camera-browser.mjs`: `GradioCameraAPI` và `CameraController`, dùng `getUserMedia`, upload ảnh rồi nhận SSE, chỉ một frame đang xử lý. `stop()` đóng track ngay trước khi chờ mạng. Không dùng frontend timer để tạo một queue ảnh cũ.
- `camera-demo.html`: nút Bật/Tắt, preview, ảnh snapshot với bbox YOLO và kết quả; tự ẩn kết luận khi quá TTL. Serve thư mục `clients` qua HTTPS hoặc localhost (không mở bằng file://); có thể copy module vào frontend hiện tại. API mới phải được deploy trước khi dùng live URL.
- `camera_pi.py`: capture CSI với Picamera2 hoặc USB với OpenCV; backend chạy YOLO. Một job gửi ảnh đang chạy, còn control/status polling độc lập để nhận stop ngay cả khi inference còn pending. Poll/network latency vẫn ảnh hưởng thời điểm thiết bị biết lệnh dừng.

Pi Raspberry Pi OS với CSI cần `python3-picamera2` và `python3-httpx`; USB cần thêm `python3-opencv`. Picamera2 không cài trên máy dev macOS. Tham chiếu API capture buffer: https://github.com/raspberrypi/picamera2/blob/main/examples/capture_to_buffer.py .

```bash
# Chạy trên Pi sau khi API mới đã deploy:
python3 camera_pi.py --camera csi --scenario hot_locked
python3 camera_pi.py --camera usb --index 0 --scenario hot_locked
```

Pi tạo `.camera-session.json` mode 0600 (đã gitignore). Frontend muốn đọc/dừng phiên Pi cần được owner cấp đúng credential của phiên đó; tạo `camera_start` mới không tự điều khiển một Pi bất kỳ. Browser/Pi không gửi raw camera URL để backend tự truy cập thiết bị. Không có camera Pi thật trong môi trường kiểm local.

Luồng liên tục là gửi frame mới → YOLO backend → detections/bbox/risk → nhận SSE → gửi frame mới. API không nhận RTSP/WebRTC video stream trong patch này. Interval mặc định client là 1 giây và không phải FPS cam kết; điều chỉnh interval không thay Vision TTL 3 giây. Queue/cold start có thể vượt TTL, phải báo STALE_FRAME rồi thử frame mới. Hướng dẫn ZeroGPU: https://huggingface.co/docs/hub/spaces-zerogpu .

## Freshness, thứ tự và dừng camera

- Dùng thời điểm **capture** trong VisionPayload, không thay bằng thời điểm inference xong. Capture time không hợp lệ, thiếu timezone hoặc nằm trong tương lai bị từ chối explicit; client cần đồng bộ clock.
- Kiểm tuổi frame trước và sau inference theo Vision TTL **3 giây** hiện có. Frame quá tuổi trả `STALE_FRAME`, không tạo quyết định SAFE từ ảnh cũ. Cold start/queue có thể làm request đầu thất bại; client chụp frame mới để thử lại.
- Sequence lặp cùng ảnh/thời điểm được trả `DUPLICATE` và không tăng revision/action. Sequence cũ hoặc capture time không tăng bị từ chối. Cùng sequence nhưng payload khác trả `FRAME_CONFLICT`.
- Mỗi phiên chỉ có một inference đang chạy. Frame mới khi busy bị từ chối; client gửi tuần tự và không giữ queue ảnh cũ.
- Stop/report lỗi được phép chạy khi inference còn đang xử lý; kết quả inference phải kiểm lại trạng thái trước commit và không hồi sinh phiên đã stop.
- `decision_current=false` thì UI không trình bày risk lịch sử là quyết định hiện tại. Timer đánh giá lại các phiên camera khi mất frame; GET status chỉ đọc.
- Nếu evidence điều khiển không commit (ví dụ clock không tiến), trả `STATE_NOT_COMMITTED`; lệnh stop vẫn chặn frame và timer thử lại, không báo đã có state mới.
- Camera ban đầu chưa có ảnh: `NO_FEED`, không phải cabin trống. Không reset incident hoặc xóa pending confirmation để làm UI xanh.

## Đối chiếu BTC và bằng chứng

Đã thử https://phoenix.note.transformerlabs.ai/dashboard?cohort=cohort-4 và https://phoenix.note.transformerlabs.ai/demo-day ngày 2026-10-02; công cụ web không truy cập được. Rubric hiện hành **UNVERIFIED**; owner PO xác minh nếu thay scope nộp. Camera streaming là phần user yêu cầu, không tự coi là requirement BTC. Kiểm checklist luồng upload/frame → YOLO → VisionPayload + scenario SIMULATED → CabinService → rules/LangGraph → risk → action result → frontend; safety evaluator vẫn deterministic/offline.

Kiểm camera thật/browser permission/CORS trên domain frontend, latency/FPS, Pi CSI và URL Space online cần bằng chứng riêng; test local không thay các bằng chứng đó. Chưa có điều kiện READY_TO_SUBMIT từ task này.

## Additive preview extension — 2026-10-03

Accepted `camera_frame` responses may include `preview` with a frame-bound JPEG processed by BaoTam YuNet (`PROCESSED` or `UNAVAILABLE`). Missing/invalid/stale preview must not fall back to raw video. Camera state/risk/action fields keep their existing meaning; privacy failure hides the image independently of the backend verdict. See [contract migration, source SHA, run instructions and evidence](BAOTAM_REALTIME_INTEGRATION_2026-10-03.md). Hosted deployment is unchanged.
