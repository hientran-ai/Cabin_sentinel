# Bằng chứng model — 17/10/2026

Hai bộ log, **hai model khác nhau**. Không gộp số của hai bộ.

| Thư mục | Model | Cách chạy | Dùng để chứng minh |
| --- | --- | --- | --- |
| `live-ui-yolov8n/` | `yolov8n.pt` (model backend demo đang nạp, sha256 `f59b3d83…`) | Bấm kịch bản trên trang `/cockpit/vinfast/`, log ghi bởi nút "Tải nhật ký" | Pipeline thật chạy từ clip → model → quyết định đã lưu; camera bị che thì không báo an toàn |
| `offline-bundle-20261014/` | Bundle thử nghiệm 14/10 trên `origin/main` (`yolov8s.pt` + age + items + YuNet), CPU | `run_vision.py` của `origin/main` trên 3 clip mẫu của trang demo | Model mới nhất làm gì trên cùng 3 clip |

## Kết quả model mới (bundle 14/10) trên 3 clip mẫu — đo thật, CPU, chưa có nhãn chuẩn

| Clip | Khung | Kết quả theo nhãn dự đoán | Nhận xét |
| --- | ---: | --- | --- |
| `ai-child.mp4` | 150 | child 112, person (chưa rõ tuổi) 23, adult 15; 1 track duy nhất | Có nhãn trẻ em, nhưng nhãn **không ổn định** (một người đổi nhãn child/unknown/adult) |
| `child-rear.mp4` (trẻ ngồi ghế sau quay lưng) | 125 | **không có person nào**; chỉ 1 khung "cell phone" | **Vẫn bỏ sót trẻ ghế sau.** Đây là SR-01, chưa được bundle mới giải quyết |
| `empty-cabin.mp4` | 188 | không có gì | Không báo nhầm trên clip này; nhưng không phát hiện ≠ trống |

Tốc độ (CPU 4 luồng, không gồm decode/ghi): trung bình 261–352 ms mỗi khung, P95 310–384 ms, 2.8–3.8 khung/giây. Không phải tốc độ trên phần cứng xe.

## Giới hạn (bắt buộc đọc)

- Không có ground truth theo khung, nên **không tính** precision, recall, độ chính xác trẻ em.
- Tần suất nhãn không phải độ chính xác. 3 clip không đại diện cho cabin thật.
- Bundle này được tác giả ghi là *thử nghiệm* (`docs/MODEL_BUNDLE_20261014.md`): chưa được xác nhận đạt yêu cầu an toàn; backend vẫn dùng `yolov8n.pt` mặc định.
- Chưa nối bundle vào backend demo trang này: cần quyết định của chủ model và Compliance (ngưỡng, SR-01).

## Tái lập

Xem `offline-bundle-20261014/run-commands.sh` (cần `services/api` và `scripts` của `origin/main`, trọng số theo `docs/MODEL_BUNDLE_20261014.json`, kiểm sha256 trước khi chạy).
