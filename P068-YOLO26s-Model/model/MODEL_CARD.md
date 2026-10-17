# Model card — YOLO26s single-detector pipeline

Ngày đóng gói: 17/10/2026. Profile phục vụ tích hợp và thử nghiệm; không có kết
luận đạt chất lượng triển khai trên mọi camera.

## Nguồn và cấu hình

- Detector: trọng số gốc Ultralytics YOLO26s, SHA256
  `646f8bc3fe0a656803d95c294f7852321748cb29d13466a1af8862e2db384a1b`.
  File local khớp byte với asset chính thức `v8.4.0/yolo26s.pt` đã tải đối chiếu.
- Tuổi: `cabin-age-repair-20261015.pt`, MobileNetV3-Small, checkpoint format 3,
  58 epochs, face input 224, child_age_max=9. Checkpoint ghi dataset UTKFace và
  đã được thích nghi thêm bằng face crop development của dự án.
- Ngưỡng tuổi 0.7/0.8 được lấy từ cấu hình local đang hoạt động, không lấy từ
  các profile reviewed cũ đang bật nhiều specialist.
- YuNet: `face_detection_yunet_2023mar.onnx`, model local được ghim checksum.
- Tracking và tuổi theo stream có state riêng, hết hạn; không tạo occupancy
  mới chỉ từ track đã mất. Privacy dùng mặt và vùng dự phòng của person.
- Profile tích hợp CPU dùng `imgsz=512` và giới hạn cạnh dài YuNet full-frame ở
  768 px. A/B cục bộ trên ảnh Ultralytics bus 1080x810 giữ 4/4 person và tăng
  10.50 lên 13.69 FPS; confidence person thấp nhất giảm 0.8331 xuống 0.6427.
  `quality_imgsz=640` được giữ làm cấu hình đối chiếu.

## Bằng chứng và giới hạn

`validation/detector-benchmark.json` là phần trích có nguồn/hash từ lần đo
YOLO26s ngày 17/10 trên 560 ảnh/model, CPU FP32 4 luồng. Trên nhóm cabin thật
đã đo: person TP=64, FP=9, FN=0. Đây là metric detector theo nhóm dữ liệu đó,
không phải cam kết zero-FN của pipeline, cảnh báo hoặc camera mới. Tốc độ detector
không bao gồm tuổi/tracking/privacy và không phải tốc độ backend HTTP.
Benchmark lịch sử này không được chạy lại ở `imgsz=512`; không dùng phép đo FPS
trên một ảnh công khai để suy ra accuracy hoặc phê duyệt production.

Model tuổi dùng face crop, không có tuổi thật được xác minh cho hai clip cabin
đã thích nghi. Những clip này đã tham gia phát triển, không phải kiểm thử cabin
độc lập. Báo cáo development gốc ghi accuracy UTKFace 90.71%, child recall
85.11%, child-to-adult 17/309; số đo đó không chứng nhận accuracy của backend
đích hoặc một nhóm người mới. Mặt nhỏ, che khuất hoặc không rõ có thể unknown.

`smoke-validation.json` và các bài test xác nhận khả năng chạy/import, hợp đồng
kết quả, tracking, privacy và tính nhất quán source/weights. Không dùng smoke
test như một phép đo accuracy. Chưa benchmark lại toàn pipeline trên thiết bị
backend đích sau khi đóng gói namespace riêng.

Profile chỉ dùng YOLO26s cho pet; không kèm species verifier. Không kèm wallet
detector, specialist đồ vật, person rescue, Grounding DINO, CLIPSeg hay các bản
TensorRT/NCNN. Các nhánh tùy chọn còn trong dependency closure của source không
được public `Pipeline` bật lên. Calibration cabin phải làm cho camera thật;
polygon 2D không xác minh độ sâu vật lý. Privacy có thể bỏ sót mặt và luôn giữ
`coverage_verified=false`.
