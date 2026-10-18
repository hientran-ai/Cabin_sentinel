# Nối model mới (YOLO26s + tuổi + YuNet) vào backend demo

**Nguồn**: `origin/main` commit `3ca065d` (`model/` + `models/selection-20261015/yolo26s.pt` sha256 `646f8bc3…`, `models/age/cabin-age-repair-20261015.pt`, YuNet). Giải nén ở `/Users/mac/BUILD_PHASE/p068-model` (ngoài repo), cài `pip install --no-deps ./model` vào `.venv312` (torch 2.13 thay vì 2.14 ghim; `verify_handoff.py` đạt 56 file).

**Bật**: `P068_MODEL_ROOT=<thư mục chứa models/>` (+ `P068_CABIN_GEOMETRY=services/api/src/vision/geometry/demo-wide-01.json`). Không đặt thì backend dùng model cũ `MODEL_PATH`. Lỗi nạp thì ghi log và quay về model cũ.

**Adapter** (`services/api/src/vision/p068_provider.py`): không đổi luật/ngưỡng rủi ro.
- `person/dog/cat` là bằng chứng sống; `age_group` (child/adult/unknown) là trường riêng, giá trị lạ → `unknown`, không bao giờ `adult`. Class không bị đổi thành "child".
- Đồ vật chỉ vào `item_detections`. `pet_unknown/object` bị bỏ.
- Mỗi lượt phát có một `stream_id` (tracker và làm mượt tuổi riêng).
- Người ở **ngoài** cabin (`exterior_detections`) không tính là người trong xe; chỉ khi camera có hiệu chuẩn. Hiệu chuẩn tay `demo-wide-01.json` chỉ cho DEMO-01/02 (cùng một camera), **chưa kiểm chứng**.

**Sửa lỗi "màn hình không đổi"**: video phân tích bị gỡ khỏi trang khi đóng hộp thoại nên Chrome tạm dừng và phân tích dừng ngay; nay video luôn nằm trong trang (`#cs-video-host`). Kịch bản DEMO-07 đặt `parkingBrake: false` nên xe thật sự chạy 30 km/h.

**Kết quả đo trên 8 clip (UI, 12 s mỗi clip, model thật, CPU)**: DEMO-01 người ngoài cabin không còn thành người trong cabin (ext=1, p=0); DEMO-05 nhãn trẻ em dao động child/unknown giữa các khung; DEMO-06 thấy ba lô và mèo; DEMO-07 hai người (adult+unknown); **DEMO-08 vẫn không thấy ba lô**; DEMO-04 (thiếu sáng) số người 1–4 dao động. Không có ground truth nên **không tính độ chính xác**. Sau khi clip hết, camera được báo DISCONNECTED nên cabin "Chưa thể xác minh" (thiết kế sẵn).

**Kiểm thử**: pytest 391 đạt (5 mới `test_p068_provider.py`), vitest 164, Playwright `scenario` 29/29, `regress` 39/39.

## Cập nhật 18/10: che mặt và ba lô

**Che mặt (đo thật trên khung giao diện đang hiển thị):** thêm lượt YuNet thứ hai (ngưỡng 0.2) trong adapter, phủ khuôn mặt mà lượt của pipeline (0.3) bỏ sót hoặc chỉ che một phần mép; không bao giờ bỏ một mask có sẵn; lỗi thì trả lại ảnh của pipeline. Số khung còn thứ YuNet@0.15 nhìn ra: **4/21 → 2/20** (còn lại ở DEMO-06, điểm 0.19 và 0.24). Đây là tiêu chí tự đặt, không phải nhãn chuẩn: không chứng minh "không còn mặt". Vẫn `coverage_verified=false`; chưa đạt tiêu chí 0 mặt trên ≥1.000 khung của `COMPLIANCE_BASELINE.md`. Che thừa ở vài vùng không có mặt (thiếu sáng).

**Ba lô DEMO-08 — không tích hợp, đã đo:** model đồ vật `runs/items-two-cabin-20261014/weights/best.pt` thấy ba lô ở DEMO-08 với điểm tối đa 0.19, nhưng cũng "thấy ba lô" ở **20/20 khung của clip cabin trống** (tối đa 0.36) và 20/20 khung DEMO-06. Dùng nó sẽ tạo nhắc nhở đồ bỏ quên sai, nên **DEMO-08 vẫn không có bằng chứng ba lô** (YOLO26s: 0 khung ở conf 0.05).

pytest 394 đạt. Chưa deploy, chưa commit.
