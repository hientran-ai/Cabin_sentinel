# Camera bị che: nguyên nhân gốc và cách sửa

**Tái hiện (trước, `docs/scenario-fix-2026-10-17/before-blocked.png`)**: nút "Camera bị che" chỉ gọi `park(30)` + `setCameraFault('BLOCKED')`. Radar để `false`, nhiệt độ 30 °C, **không có nguồn hình** (0 `<video>`, 0 khung), nguồn hiện nhãn rỗng. Kết quả `ERROR / CAMERA_UNAVAILABLE`, không có lời giải thích trên màn hình. Không tồn tại video camera bị che hoàn toàn: `DEMO-03` chỉ là camera **che một phần** và không được dùng thay thế.

**Sau khi sửa** (`SIM-01 — Camera bị che — Mô phỏng mất tầm nhìn`, `e2e/simScenarios.ts`, `demo/scenarios.ts: runSimScenario`)
- Ba lớp tách riêng: media = *không có* (xem trước MÔ PHỎNG, không phát video khác); fixture cảm biến = đỗ, tắt máy, khoá cửa, radar dương tính, 38 °C, tất cả gắn `SIMULATED`; đánh giá an toàn = luật backend.
- Camera báo `BLOCKED` với `origin: SIMULATED_FAULT`. Backend trả `WARNING / SUSPECTED / RADAR_FALLBACK` ("Radar báo có thể có người; chưa có hình ảnh xác nhận"). React không tự tính rủi ro.
- Bản xem trước ghi "MÔ PHỎNG CAMERA BỊ CHE", nói AI Vision không xác minh được, hiện radar/nhiệt độ có nhãn SIMULATED và lý do quyết định.
- Mỗi tình huống khai báo `scenario_id, title, actual_media_source, simulation_type, telemetry_fixture, camera_state, connectivity_state, expected_behavior, cleanup_strategy`.
- Phiên demo riêng cho mỗi lần chạy; đổi tình huống dừng bộ phát, xoá lỗi camera, và phiên cũ không bị tự đóng sự cố.
- Trạng thái camera `CAMERA_OCCLUDED_SUSPECTED` được ghi là **MÔ PHỎNG**: không có bộ phát hiện che camera thật, nên không tuyên bố model phát hiện che.

**Hạn chế**: chưa có footage camera bị che hoàn toàn (cần quay thêm). Các trạng thái `CAMERA_NO_FRAMES / DISCONNECTED / PERMISSION_DENIED / UNKNOWN` đã có trong fixture/camera-status và `deviceCamera`, chưa có màn hình riêng.
