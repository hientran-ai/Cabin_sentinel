# Ma trận kiểm thử: camera bị che và mất kết nối

Chạy: trình duyệt Google Chrome 155 (Playwright 1.56, headless) trên bản dev `:4187` + backend `:8012` (model thật `yolov8n.pt`, bộ phân loại tuổi tắt). Backend: 386 pytest đạt (7 mới ở `tests/test_vehicle_link.py`). Frontend: 164 vitest đạt, `tsc` sạch. Script: `apps/cockpit-web/e2e-browser/judge/scenario.e2e.mjs` (BASE=http://127.0.0.1:4187). Ảnh: `docs/scenario-fix-2026-10-17/`.

| Mã | Kết quả | Bằng chứng |
|---|---|---|
| CAM-01 mở không lỗi video | PASS | không `<video>`, xem trước mô phỏng |
| CAM-02 che + radar dương | PASS | `SUSPECTED / RADAR_FALLBACK`, không SAFE |
| CAM-03 che + radar âm | PASS | không SAFE, occupancy không `ABSENT` |
| CAM-04 che + không radar | PASS | `UNKNOWN`/không hiện tại |
| CAM-05 sự cố CRITICAL qua mất camera | PASS (backend `test_critical_incident_survives_camera_loss`); chưa có Playwright | cùng incident_id, vẫn OPEN |
| CAM-06 chuyển sang video thật | PASS | khung thật, `cameraFault` null |
| DC-01..DC-07 | PASS | RECONNECTING → DISCONNECTED → SYNCING → CONNECTED, CŨ, UNKNOWN, cùng incident OPEN |
| DC-08 telemetry cũ không đè mới | PARTIAL | backend từ chối ghi khi mất liên kết; chưa test khung cũ muộn bằng trình duyệt (backend test chỉ kiểm tra không lỗi) |
| DC-09 lặp mất/nối | PASS | `drops=4`, poll ~5/5 s |
| DC-10 cô lập phiên | PASS | phiên khác CONNECTED, ghi 200 |
| DC-11 trình duyệt offline ≠ xe offline | PASS | `conn=lost`, link CONNECTED, không banner xe |
| DC-12 backend 500 | PASS | trang vẫn render, hồi phục |
| Pi offline / cloud lost nhưng Pi chạy | NOT TESTABLE | không có phần cứng |
| Ba chế độ cắm trại/bé/thú cưng (vào, về màn hình chính, Esc, Back, Tắt chế độ) | PASS 19/19 | `regress.e2e.mjs modes`, Chrome, 1920x1080 |
| Tám video DEMO-01..08 chạy và ≥2 khung được model thật phân tích | PASS 8/8 | `regress.e2e.mjs videos`; kết quả luật backend khác nhau theo clip (xem log) |
| Mobile 390/375/768: không tràn ngang, hộp thoại cabin vừa màn hình, nút đóng dùng được | PASS 9/9 | `regress.e2e.mjs mobile`. **Đã sửa lỗi hồi quy**: dưới 1000 px hộp thoại cabin không bao giờ mở (nằm trong màn xe không được render); nay có `MobileCabinHost` |
| "Gửi lại xác nhận": bị từ chối thì xoá 3 ô tick, nút bị khoá tới khi tick lại; sự cố vẫn OPEN | PASS 2/2 | `regress.e2e.mjs resend`. Không chạy lại mã cũ để chứng minh lỗi cũ; lý do từ chối trong lần chạy này có thể là `stale` hoặc `changed` |
| Cá nhân hóa, thông báo/push thật, WebKit, Chromium bản đóng gói | CHƯA CHẠY | không có trong phạm vi lần này |
