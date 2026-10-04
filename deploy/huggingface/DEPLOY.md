# Deploy lên Hugging Face ZeroGPU

Space: https://huggingface.co/spaces/Khanh3636/cabinsentinel-backend · API: https://khanh3636-cabinsentinel-backend.hf.space

Trước khi mở frontend bên ngoài, cấu hình biến Space `CORS_ORIGINS` bằng origin HTTPS chính xác của frontend. `APP_ENV` mặc định là `production`; không đặt `CORS_ORIGINS=*`. Signup, demo login và remote commands vì vậy ở chế độ production mặc định vẫn tắt. UI Gradio cùng origin vẫn dùng được mà không cần mở CORS cho mọi website.

```bash
pip install huggingface_hub   # cần token: HF_TOKEN hoặc `hf auth login`
deploy/huggingface/deploy.sh Khanh3636/backend_p068 --dry-run   # xem trước danh sách file
deploy/huggingface/deploy.sh Khanh3636/backend_p068
```

Script gom `src/`, model YuNet `models/face_detection_yunet_2023mar.onnx` (kiểm tra sha256) cùng `app.py`, `routing.py`, `requirements.txt`, `packages.txt`, `README.md` trong thư mục này, rồi đẩy bằng Hub API (git push thường bị từ chối với file nhị phân). Không để `.gitignore` của Space chứa `models/`: file bị ẩn sẽ không lên Space và `/health` báo `privacy_model.available=false`. Space tự build (khoảng 3–10 phút). Kiểm tra sau deploy: `GET /health` có `"vision":"ready"`, `privacy_model.available=true`, `camera_api=true`.

Camera trực tiếp (`camera_frame`) chạy CPU theo mặc định: trên ZeroGPU mỗi frame GPU tốn một lượt quota và khách ẩn danh hết quota sau vài frame (`frame=null`, không có preview). Đặt biến Space `CAMERA_DEVICE=gpu` để quay lại GPU. Preview trả thêm `masked_boxes` (pixel `x1,y1,x2,y2`) để frontend che mặt trên video gốc.

Cách chạy trên ZeroGPU:

- ZeroGPU chỉ hỗ trợ Gradio SDK, nên Gradio giữ server; `app.py` chuyển `/api/`, `/health`, `/docs`, `/openapi.json` sang FastAPI (đủ middleware, auth, safety timer).
- REST API chạy YOLO trên CPU, không tốn quota GPU của người gọi. Chỉ nút "Phân tích" trên Gradio dùng `@spaces.GPU` (có fallback CPU).
- `ssr_mode=False` là bắt buộc: SSR mặc định trên Spaces cho Node giữ cổng public và trả HTML cho `/health`, `/api/*`.
- `app.py` import backend trước `ultralytics`, vì ultralytics vá `PIL.Image.open`; sai thứ tự làm ảnh hỏng trả 500 thay vì 422.
- `pydantic==2.12.5` vì Spaces cài `gradio[mcp]`, gói này yêu cầu `pydantic<=2.12.5`.
- Space free không có ổ lưu bền: session mất khi Space ngủ hoặc restart.
