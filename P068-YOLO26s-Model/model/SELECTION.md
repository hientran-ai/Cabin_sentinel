# Phạm vi đã rà và lựa chọn để bàn giao

| Khu vực workspace | Quyết định |
|---|---|
| `.env` đang chạy, `.env.example`, `configs/` | Chỉ đọc các khóa model; lấy YOLO26s đơn và tuổi 0.7/0.8. Không chép private `.env`. Các profile reviewed bật nhiều detector là thử nghiệm cũ, không chọn |
| `src/vision/` | Đi theo chuỗi import từ provider, age, preview, geometry, overlay, video; giữ 21 module inference/helper cần để các import không bị thiếu. Không lấy prepare/train/bootstrap/acceptance và các nhánh nghiên cứu không thuộc closure |
| `models/selection-20261015/` | Giữ đúng YOLO26s hiện hành, đã có trên main; bỏ YOLOv10s, YOLO26n và baseline YOLOv8 |
| `models/age/` | Chỉ `cabin-age-repair-20261015.pt`; bỏ các checkpoint tuổi cũ |
| `models/face_detection_yunet_2023mar.onnx` | Giữ đúng YuNet đã ghim SHA256, đã có trên main |
| `models/belongings`, `open-vocabulary`, `person`, `pets`, `experimental`, `segmentation` | Không lấy weights specialist/rescue/verifier/segmenter vì cấu hình đang chọn YOLO26s đơn |
| `models/optimized`, `pi5`, `pi5-candidates` | Không lấy engine riêng thiết bị hoặc bản build theo model cũ |
| `scripts/` | Không mang launcher phụ thuộc runtime CUDA trong `tmp/`; thay bằng CLI portable và public Python API trong thư viện model |
| `tests/` | Lấy 9 suite chỉ phụ thuộc model; bổ sung test hợp đồng handoff, checksum, shutdown và che exterior trước khi lọc |
| `model/`, `eval/`, `runs/`, `docs/` | Dùng báo cáo để kiểm tra lựa chọn, provenance và giới hạn; chỉ đưa model card, benchmark tóm tắt và kết quả smoke liên quan vào handoff |
| `submission/` | Không dùng ZIP candidate cũ chứa bản sao backend và nhiều weights không còn bật |
| `src/cabinsentinel`, `src/main.py`, frontend, DB, alerts | Không chép hay sửa trong commit handoff |
| `data/`, `output/`, `outputs/`, `.runtime/`, `tmp/`, `.venv/` | Không push ảnh/video gốc, datasets, runtime, cache, log hoặc thư mục máy phát triển |

Source có phần cập nhật local chưa nằm trong lịch sử Git. Hash từng module gốc
và module xuất ra được ghi ở `source-provenance.json`. Các chỉnh sửa khi xuất:
namespace độc lập `p068_vision`, đường dẫn YuNet truyền tường minh, thứ tự import
và wrapper tích hợp. Không ghi đè source backend ở `services/api/src/vision/`.
