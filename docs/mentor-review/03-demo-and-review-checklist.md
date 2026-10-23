# Demo và mentor review checklist

## A. Kịch bản demo 3–5 phút

### Cảnh 1 — Đặt bối cảnh (20 giây)

Nói rõ đây là technical demo. Telemetry và actions đang mô phỏng; không điều khiển xe thật.

### Cảnh 2 — Owner/Cabin flow (60–90 giây)

1. Mở Cabin Noir.
2. Chọn nguồn camera hoặc video mẫu đã chuẩn bị.
3. Chạy scenario xe tắt/khóa/nhiệt độ cao.
4. Chỉ vào ba lớp thông tin riêng biệt:
   - evidence từ Vision;
   - sensor/freshness;
   - verdict từ backend rules.
5. Chỉ ra `CRITICAL`, `rule_id`, revision và decision timestamp.

### Cảnh 3 — Operations flow (90–120 giây)

1. Đăng nhập Operations bằng tài khoản admin/operator phù hợp.
2. Mở incident queue.
3. Chọn incident, assign cho operator.
4. Thêm note hoặc escalate.
5. Tạo horn/SMS/unlock request và nói rõ trạng thái simulated/pending.
6. Mở Commands để cho thấy lifecycle và four-eyes rule cho unlock.
7. Mở Audit hoặc System health để chứng minh traceability.

### Cảnh 4 — Kết thúc trung thực (30 giây)

Hiện slide “What is not proven yet”: child recall, Pi 5 measurements, real vehicle actions và production readiness.

## B. Checklist kỹ thuật trước buổi demo

- [ ] Chốt dùng live backend hay mock demo; không đổi mode giữa buổi.
- [ ] Kiểm tra `/health` và ghi lại model/runtime đang load.
- [ ] Kiểm tra API base URL và Operations URL.
- [ ] Dùng dữ liệu demo, không hiển thị token, secret, email cá nhân hoặc ảnh nhạy cảm.
- [ ] Đăng nhập thử cả admin và operator.
- [ ] Chuẩn bị ít nhất một CRITICAL incident và một trạng thái stale/error.
- [ ] Kiểm tra polling không tạo request lỗi liên tục.
- [ ] Kiểm tra command policy đang enabled hay disabled để lời nói khớp UI.
- [ ] Chuẩn bị video dự phòng nếu camera/model/backend live lỗi.
- [ ] Tắt notification cá nhân và các tab không liên quan.
- [ ] Phóng to trình duyệt đủ để mentor đọc status/reason/audit.
- [ ] Không dùng ảnh/video người thật chưa được phép.

## C. Lệnh kiểm tra nhanh

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q
.\.venv\Scripts\ruff.exe check .
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

Không dùng kết quả `pytest -q` toàn root làm gate hiện tại cho đến khi sửa collision giữa `tests/` và `cabin-noir/backend/tests/`.

## D. Năm câu hỏi xin mentor review

### 1. Safety architecture

“Ranh giới giữa evidence, verdict, incident và action intent đã đúng chưa? Có responsibility nào đang đặt sai giữa edge và cloud?”

### 2. Model evaluation

“Với false negative ở ghế sau, bộ dữ liệu và metric nào mentor muốn thấy trước khi cho phép pilot? Có nên tối ưu recall theo từng vị trí ghế thay vì aggregate accuracy?”

### 3. Fallback strategy

“Reference-image comparison, radar và temporal voting nên kết hợp theo policy nào để giảm false negative mà không gây quá nhiều false alarm?”

### 4. Readiness gate

“Ngoài model recall, cần gate nào về latency, offline duration, restart recovery, clock skew và device acknowledgement?”

### 5. Sprint priority

“Nếu chỉ chọn một mục tiêu trong sprint tới, mentor ưu tiên: đo Pi 5 thật, finetune model, hoàn thiện device command contract hay tách Safety Plane?”

## E. Cách ghi nhận review

| Quyết định/câu hỏi | Ý kiến mentor | Evidence cần bổ sung | Owner | Deadline |
|---|---|---|---|---|
| Safety Plane boundary |  |  |  |  |
| Model evaluation gate |  |  |  |  |
| Reference-image fallback |  |  |  |  |
| Pi 5 readiness |  |  |  |  |
| Device command contract |  |  |  |  |

Sau buổi review, chuyển từng nhận xét thành một trong ba loại: decision, experiment hoặc implementation task. Mỗi task cần exit criterion đo được.

## F. Những câu tuyệt đối tránh

- “Hệ thống nhận diện trẻ em chính xác.”
- “Đã sẵn sàng dùng trên xe thật.”
- “AI tự quyết định khi nào xe nguy hiểm.”
- “Đã gửi SMS/mở khóa thật.”
- “Đã benchmark trên Raspberry Pi 5.”
- “Không detect thấy nghĩa là cabin trống.”

Thay bằng:

- “Detector tạo evidence; rules engine tạo verdict.”
- “Kết quả hiện tại là integration/benchmark evidence trong phạm vi đã ghi.”
- “Action đang simulated hoặc pending confirmation.”
- “Pi 5 hiện là ước lượng; cần đo trên target hardware.”

