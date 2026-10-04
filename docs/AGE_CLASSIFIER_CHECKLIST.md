# Checklist: tích hợp age classifier, FPS, PR, Hugging Face

Cập nhật: 2026-10-04. Ký hiệu: ✅ xong và đã kiểm chứng · 🟡 xong nhưng chưa kiểm chứng đủ · ⛔ chưa làm / bị chặn.

## A. Chẩn đoán (có bằng chứng)
- ✅ Web backend không gọi classifier: `src/vision/provider.py` chỉ chạy YOLO; `vision_adapter.py` từng ném lỗi với `child/adult`.
- ✅ `.env` không có `MODEL_PATH` → `/health` báo `vision: unavailable`, `/analyze` trả 503.
- ✅ iOS: `AgeGuess.guess` luôn trả `unknown`; `CabinAge.mlpackage` chưa tồn tại; backend iOS chỉ chuyển tiếp `age` do app gửi.
- ✅ Lỗi làm tròn float: `child + infant` = 1.0000000152 → `unknown`. Đã tái hiện bằng test, đã sửa ở bản port.
- ⛔ Chưa truy vết được một ảnh qua local script và endpoint với checkpoint thật (thiếu checkpoint).

## B. Code web backend (P-068)
- ✅ `src/vision/age.py`: class lấy từ checkpoint, `eval()`, BGR→RGB, padding 10%, resize 224, ImageNet, ngưỡng unknown.
- ✅ Provider giữ `class=person`, thêm `age_group`, `age_scores`, `age_crop`, `bbox`.
- ✅ Thiếu checkpoint / load lỗi / crop lỗi / không chắc → `unknown`, không bao giờ `adult`.
- ✅ Tuổi không đi vào `VisionPayload`, occupancy, risk (test so sánh adult/child/unknown cho cùng risk và actions).
- ✅ Response tương thích ngược (field mới đều tùy chọn); `/health` có `age_classifier`.
- ✅ Cấu hình: `AGE_CLASSIFIER_PATH`, `AGE_CHILD_THRESHOLD`, `AGE_ADULT_THRESHOLD`.
- ✅ `pytest`: 183 passed; `ruff`: sạch.
- 🟡 Test dùng checkpoint tổng hợp (chỉ chứng minh plumbing, không chứng minh độ chính xác).
- ⛔ Chạy `scripts/compare_age_pipeline.py` với ảnh + checkpoint thật.

## C. iOS (CabinSentinel-iOS)
- ✅ `CoreMLAgeClassifier` + nối vào `PhoneSensor`; thiếu model → `unknown`.
- ✅ Build Simulator: `BUILD SUCCEEDED`.
- ⛔ Chưa chạy với model thật (thiếu `CabinAge.mlpackage`); chưa có test target.
- ⛔ Cần Vision/Tâm export CoreML: chuẩn hóa ImageNet nhúng sẵn, nhãn `adult`/`child`/`infant`.

## D. FPS ≥ 30 trên demo web
- ✅ Đo thực tế (Mac, 8 luồng, YOLOv8n CPU, ảnh `cayenne-0.png`): trung bình 80 ms, p50 58 ms → trần ~12–17 fps, chưa tính upload/mạng/classifier.
- ✅ Kết luận: 30 fps suy luận qua HTTP từng frame trên backend CPU **không đạt được** (cần ≤33 ms/frame). Trên Space CPU yếu hơn sẽ thấp hơn.
- ⛔ Chưa tối ưu: nguyên nhân giật chưa được xác định (frontend nằm repo `hientran-ai/Cabin`, chưa đo trên trình duyệt).
- ⛔ Hướng khả thi (cần duyệt): tách hiển thị video (RAF, 30 fps cục bộ) khỏi suy luận (5–10 fps, bỏ frame cũ, chỉ 1 request đang bay); hạ `imgsz`; đo lại.

## E. Pull request
- 🟡 P-068: PR gộp toàn bộ thay đổi hiện tại (gồm cả alerts/timer/sessions chưa commit trước đó theo quyết định của chủ repo) vào `main` từ nhánh `feat/age-classifier-integration`.
- ✅ CabinSentinel-iOS: giữ local theo quyết định (dự án nghiên cứu riêng, không remote); thay đổi chưa commit trong working tree.

## F. Hugging Face
- ⛔ Chưa deploy theo quyết định "để sau". Space hiện có: `Khanh3636/cabinsentinel-backend` (`deploy/huggingface/deploy.sh` ở nhánh `feat/backend-demo-scenarios-actions`, chưa vào `main`). Cần `hf` CLI/token, checkpoint ngoài Git và biến `AGE_CLASSIFIER_PATH`; sau deploy kiểm `/health`: `vision: ready`, `age_classifier: ready`.

## G. Việc cần người khác cung cấp
- Checkpoint age classifier (sha256 `259a2bbb…5075` cho bản ba lớp) và ảnh mẫu.
- URL remote GitHub của repo iOS.
- Quyết định safety: ý nghĩa `child/adult/unknown` trong cảnh báo; validation trên cabin thật.
