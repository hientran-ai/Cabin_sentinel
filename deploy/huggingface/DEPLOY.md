# Deploy lên Hugging Face ZeroGPU

Space: https://huggingface.co/spaces/Khanh3636/cabinsentinel-backend · API: https://khanh3636-cabinsentinel-backend.hf.space

Trước khi mở frontend bên ngoài, cấu hình biến Space `CORS_ORIGINS` bằng origin HTTPS chính xác của frontend. `APP_ENV` mặc định là `production`; không đặt `CORS_ORIGINS=*`. Signup, demo login và remote commands vì vậy ở chế độ production mặc định vẫn tắt. UI Gradio cùng origin vẫn dùng được mà không cần mở CORS cho mọi website.

```bash
deploy/huggingface/deploy.sh
```

Script clone Space, thay nội dung bằng `src/` của repo cùng `app.py`, `requirements.txt`, `packages.txt`, `README.md` trong thư mục này, rồi push. Space tự build (khoảng 3–10 phút). Kiểm tra sau deploy: `GET /health` phải trả JSON có `"vision":"ready"`.

Cách chạy trên ZeroGPU:

- ZeroGPU chỉ hỗ trợ Gradio SDK, nên Gradio giữ server; `app.py` chuyển `/api/`, `/health`, `/docs`, `/openapi.json` sang FastAPI (đủ middleware, auth, safety timer).
- REST API chạy YOLO trên CPU, không tốn quota GPU của người gọi. Chỉ nút "Phân tích" trên Gradio dùng `@spaces.GPU` (có fallback CPU).
- `ssr_mode=False` là bắt buộc: SSR mặc định trên Spaces cho Node giữ cổng public và trả HTML cho `/health`, `/api/*`.
- `app.py` import backend trước `ultralytics`, vì ultralytics vá `PIL.Image.open`; sai thứ tự làm ảnh hỏng trả 500 thay vì 422.
- `pydantic==2.12.5` vì Spaces cài `gradio[mcp]`, gói này yêu cầu `pydantic<=2.12.5`.
- Space free không có ổ lưu bền: session mất khi Space ngủ hoặc restart.
