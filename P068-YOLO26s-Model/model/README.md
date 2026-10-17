# Bàn giao pipeline model YOLO26s cho backend

Bộ này lấy từ pipeline model đang dùng ở workspace, ngày 17/10/2026. Backend có
thể cài thư viện `p068_vision` và gọi Python trực tiếp. Thư viện dùng namespace
riêng, không import hay thay thế `src.main`, route, database hoặc logic cảnh báo.

## Thành phần được chọn

| Thành phần | File | Vai trò |
|---|---|---|
| YOLO26s | `models/selection-20261015/yolo26s.pt` | Người, chó/mèo, đồ vật cá nhân được hỗ trợ |
| MobileNetV3-Small | `models/age/cabin-age-repair-20261015.pt` | Tuổi theo mặt: child <10, adult >=10, hoặc unknown |
| YuNet | `models/face_detection_yunet_2023mar.onnx` | Phát hiện mặt cho tuổi và che mặt |
| Pipeline Python | `model/src/p068_vision/` | Inference, tracking, motion, làm mượt tuổi theo stream, che mặt |
| Cabin geometry | `model/cabin-geometry.schema.json` | Polygon do backend cấu hình riêng cho từng camera |

`profile.json` ghi cấu hình được chọn: confidence 0.25, input 640, tuổi 0.7/0.8,
CPU FP32, 4 luồng. Chỉ YOLO26s chạy nhánh detector chính. Những file Python được
giữ theo toàn bộ chuỗi import của inference; các nhánh specialist tùy chọn trong
provider không được bật bởi `Pipeline` và không có weights trong bộ bàn giao.

Không kèm dataset, clip/ảnh gốc, phiên bản model cũ, weights thử nghiệm, runtime
CUDA của laptop, `.env` riêng, credentials hay bản sao backend. Không thay cấu
hình model mặc định của backend hiện hành; bên backend chủ động nối thư viện này.

## Tải và cài

Clone repo vào một thư mục riêng hoặc tải ZIP của `main`; cần giữ cả `model/` và
ba đường dẫn dưới `models/` trong bảng trên. Ví dụ với Python 3.11:

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/AI20K-Build-Phase-Cohort-4/P-068.git P-068-model
cd P-068-model
git sparse-checkout set model models
python -m venv .venv-model
```

Kích hoạt môi trường bằng `.venv-model\Scripts\activate` trên Windows hoặc
`source .venv-model/bin/activate` trên Linux. Nếu chạy CPU, cài PyTorch CPU trước:

```bash
python -m pip install torch==2.14.0 torchvision==0.29.0 --index-url https://download.pytorch.org/whl/cpu
python -m pip install ./model
python model/verify_handoff.py
python -m p068_vision --assets-root .
```

Nếu dùng CUDA, cài cặp PyTorch/torchvision cùng phiên bản phù hợp môi trường GPU,
sau đó cài `./model`. Bộ kiểm tra ở đây dùng CPU; không kèm engine TensorRT/NCNN.
`--assets-root` và tham số Python `assets_root` luôn trỏ tới thư mục **chứa
`models/`**, không trỏ tới thư mục package. Gói wheel chỉ chứa code và manifest;
weights đi cùng repo và được xác minh SHA256 trước khi nạp.

## Nối vào backend

Tạo một instance cho mỗi worker khi ứng dụng khởi động, dùng lại cho các request,
và gọi `close()` khi tắt. Ví dụ độc lập, không cần khởi chạy server:

```python
from pathlib import Path
from p068_vision import Pipeline

repo = Path("/path/to/P-068-model")
with Pipeline(assets_root=repo, device="cpu") as pipeline:
    result = pipeline.infer(
        Path("input.jpg").read_bytes(),
        stream_id="vehicle-01:camera-01",
        include_preview=True,
    )
    detections = result["detections"]
    masked_image = result["preview"]["data_url"]
```

Wrapper mặc định dùng profile CPU `imgsz=512`, `face_max_side=768`. Khi cần
đối chiếu chất lượng với benchmark detector lịch sử, truyền `imgsz=640`; mọi
thay đổi kích thước cần được đánh giá lại trên dữ liệu cabin đích trước production.

`device="cuda:0"` chọn GPU nếu PyTorch nhận GPU. Với ảnh độc lập, bỏ `stream_id`.
Với camera live, dùng `pipeline.infer_frame(bgr_frame, stream_id=...)`; mỗi camera
cần một ID riêng để không trộn tracking/tuổi. Không tái sử dụng stream ID cho một
video replay mới. Đồng hồ của provider dành cho live: xử lý video offline nhanh
hoặc chậm không tái hiện chính xác motion theo thời gian video.

Các lần gọi trên cùng instance được tuần tự hóa để giữ nhất quán state và YuNet.
Backend tự đặt giới hạn upload/kích thước ảnh, admission/request timeout và chạy
inference ngoài event loop async. Không tạo instance mới cho từng khung hình.

Trường hợp không cần ảnh JPEG preview, đặt `include_preview=False`: metadata
che mặt vẫn có, `data_url` được bỏ. API không trả pixel gốc hoặc `_face_evidence`.

## Hợp đồng kết quả

| Trường | Backend sử dụng |
|---|---|
| `detections` | Danh sách `{class, confidence, bbox, ...}`; bbox pixel `[x1,y1,x2,y2]` |
| `age_group`, `age_scores` | Có trên person; `unknown` khi thiếu/không đủ bằng chứng mặt. Class vẫn là `person` |
| `track_id`, `moving` | Bổ sung cho đối tượng sống; motion nằm trong `motion` |
| `branches` | Trạng thái và latency từng nhánh; lỗi nhánh không đồng nghĩa cabin trống |
| `age_classifier` | Trạng thái, checksum và ngưỡng model tuổi |
| `preview` | Ảnh đã che và metadata; `coverage_verified=false` |
| `exterior_detections` | Đối tượng xác định outside khi có geometry đúng camera |

Model giữ tên nhãn tiếng Anh. YOLO26s chính hỗ trợ person/cat/dog và 10 nhóm đồ
vật trong `labels.PERSONAL_ITEM_IDS`. Đồ vật chỉ được công bố từ confidence 0.5.
Wallet không được detector COCO chính nhận diện; không xem ví là nhãn đã hỗ trợ
bởi profile này. Score là score model, chưa được hiệu chuẩn thành xác suất.

Chuyển `class` sang `class_name` nếu contract backend yêu cầu; giữ `person` cho
occupancy và dùng `age_group` riêng. Backend tiếp tục tự xử lý sensor, risk,
authentication, HTTP status, database và cảnh báo. Lỗi model chính phát sinh
exception; input không decode được phát sinh `ValueError`; lỗi tuổi trong từng
frame giữ person/unknown và có trạng thái lỗi để backend xử lý.

Cabin polygon là tùy chọn: truyền `geometry=Path("camera.json")` vào `Pipeline`,
và `camera_id` khớp khi gọi inference. Không có/sai camera thì giữ detections;
không tự giả định ngoài cabin. Xem schema đi kèm. Che mặt chạy trên toàn khung
trước khi tách exterior. Không kèm polygon của clip thử nghiệm làm calibration
chung cho mọi camera.

## Chạy CLI và kiểm tra

```bash
python -m p068_vision --assets-root . --image input.jpg --output result.json
python -m pip install "./model[test]"
python -m pytest -c model/pyproject.toml --confcutdir=model model/tests -q
```

CLI không ghi đè file output đã có. `smoke-validation.json` ghi kết quả chạy
trọng số thật; ảnh thử chỉ dùng local, không được đưa vào repo. `manifest.json`
ghi SHA256 toàn bộ bộ bàn giao. `source-provenance.json` ghi hash source gốc và
source sau khi đổi namespace; nguồn có các thay đổi model chưa commit ở workspace.

Xem [MODEL_CARD.md](MODEL_CARD.md) về phạm vi kiểm chứng và
[THIRD_PARTY.md](THIRD_PARTY.md) về nguồn/giấy phép.
