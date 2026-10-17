# Nguồn thành phần

| Thành phần | Nguồn | Văn bản đi kèm |
|---|---|---|
| Source P-068 | Repository này, workspace BaoTam | `licenses/P068-LICENSE` |
| YOLO26s / Ultralytics | https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26s.pt | `licenses/ULTRALYTICS-LICENSE.txt` (AGPL-3.0) |
| MobileNetV3-Small implementation / torchvision | https://github.com/pytorch/vision | `licenses/TORCHVISION-LICENSE.txt` |
| YuNet | OpenCV Zoo, `face_detection_yunet_2023mar.onnx` | `licenses/YUNET-LICENSE` (MIT) |
| Age checkpoint của dự án | `models/age/cabin-age-repair-20261015.pt`; UTKFace + development adaptation | Xem provenance và model card bên cạnh |

Giấy phép source ứng dụng không thay thế giấy phép của thư viện, pretrained
weights hoặc dataset. Bộ bàn giao không bổ sung một giấy phép dataset/checkpoint
tuổi riêng chưa có trong nguồn; điều kiện dùng lại dữ liệu UTKFace và các crop
development cần được chủ sở hữu xác nhận trước khi phân phối ngoài dự án.
Không kèm dữ liệu huấn luyện hay ảnh gốc.
