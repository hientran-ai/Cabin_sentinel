# Checklist deploy trang demo VinFast cho giám khảo

Mọi đường người dùng (`/`, `/login`, `/user`, `/app`, `/demo`, đường lạ) mở **`/cockpit/vinfast/`**. `/admin/*` là bảng điều hành, `/cockpit/` (SU7) và `/cockpit/tesla/` vẫn mở trực tiếp.

## Trước khi deploy
1. `npm ci && npm run test:worker && npm run build:web` (build cả operations-web và cockpit-web vào `dist/`).
2. `npx wrangler deploy --dry-run` đọc được cấu hình.
3. Backend (Hugging Face Space): `deploy/huggingface/deploy.sh <space> --dry-run`, rồi chạy thật. Script đã gói `services/api/src` nên có `/api/v1/e2e/*`.
4. Space: bật **Persistent storage**, giữ **một worker**, `APP_ENV=production`, không đặt `CORS_ORIGINS=*` (cùng origin qua Worker nên không cần CORS).

## Sau khi deploy (làm theo thứ tự)
```bash
B=https://<worker>.workers.dev
curl -s $B/health                       # vision: ready, privacy_model.available: true
curl -s $B/api/v1/e2e/status            # mode HOSTED_SIMULATION, model.ready: true
curl -sI $B/demo | grep -i location     # → /cockpit/vinfast/
npm run smoke:demo -- "$B/cockpit/vinfast/?debug=1"   # 14 kiểm tra, camera máy được bỏ qua trên bản online
```

## Vì sao ổn định
- **Cùng một origin**: trình duyệt chỉ gọi Worker; Worker chuyển `/api/*` sang backend. Không CORS, không lộ địa chỉ backend.
- **Keep-warm**: cron 10 phút ping `/health` để Space free không ngủ, người đầu tiên không phải chờ nạp model.
- **Mất phiên khi Space restart**: trang tự tạo phiên mới (đã kiểm), không treo.
- **Tải đồng thời**: `MAX_CONCURRENT_DEMO_REQUESTS=1` an toàn cho CPU 2 nhân; nhiều giám khảo cùng lúc sẽ bị bỏ bớt khung (hiện rõ ở "Khung ... bỏ"), không sai kết quả. Tăng lên 2 nếu Space có đủ CPU và đo lại.
- **Camera máy** tắt trên bản online (backend ở nước ngoài, DP-03/DP-07). Chỉ bật bằng `VITE_ENABLE_DEVICE_CAMERA=true` khi PO và pháp lý đồng ý.
- **Bản quyền ảnh**: logo, ảnh VF8, khung Aurora/Vimeo chưa xác minh quyền dùng. Gỡ hoặc thay trước khi công bố rộng.
- **Model**: demo chạy `yolov8n.pt`. Bundle 14/10 chưa nối; vẫn bỏ sót trẻ ghế sau (SR-01).
