# Deploy web và mobile độc lập

Web và mobile dùng chung backend API nhưng có pipeline phát hành riêng. Không dùng
`npm run build` ở root cho dịch vụ Cloudflare vì lệnh đó build toàn bộ workspace,
bao gồm cả bundle mobile.

## 1. Owner Web trên Cloudflare Workers

Website chính dùng giao diện trong `apps/owner-web/`. Cloudflare cần build từ gốc
repository để npm workspaces resolve được các package dùng chung. Cấu hình Workers
Static Assets nằm trong `wrangler.jsonc` và đã bật SPA fallback.

Thiết lập Workers Builds:

| Mục | Giá trị |
| --- | --- |
| Root directory | để trống (repository root) |
| Build command | `npm ci && npm run build:web` |
| Deploy command | `npm run deploy:web` |
| Output directory | Không cần nhập; `wrangler.jsonc` dùng `apps/owner-web/dist` |

Biến môi trường lúc build:

```dotenv
VITE_API_BASE_URL=https://<backend-domain>
VITE_VEHICLE_ID=CAR_1
```

Deploy thủ công từ root:

```powershell
npm run deploy:web
```

App demo cũ trong `frontend/` đã được xóa khỏi repository. Owner Web là giao
diện web duy nhất được phát hành.

## 2. Mobile bằng Expo EAS

Mobile nằm ở `apps/mobile/`; Cloudflare không build và không phát hành app này.
Tạo `apps/mobile/.env` từ `.env.example` và khai báo:

```dotenv
EXPO_PUBLIC_API_BASE_URL=https://<backend-domain>
EXPO_PUBLIC_VEHICLE_ID=CAR_1
```

Chạy local:

```powershell
npm run start:mobile
```

Đăng nhập Expo một lần bằng `npx eas-cli@latest login`, sau đó khởi tạo/liên kết
project bằng `npx eas-cli@latest init` trong `apps/mobile`. Build bản cài thử:

```powershell
npm run build:mobile:preview:android
npm run build:mobile:preview:ios
```

Build bản đưa lên store:

```powershell
npm run build:mobile:production:android
npm run build:mobile:production:ios
```

Android và iOS là hai artifact riêng. iOS cần Apple Developer account; Android
cần Google Play Console account khi submit. Các biến `EXPO_PUBLIC_*` được nhúng
vào app nên không được chứa secret.

## 3. Backend dùng chung

Web và mobile cùng gọi một backend HTTPS. Backend phải cho phép origin web trong
`CORS_ORIGINS`; native mobile không dùng browser CORS nhưng vẫn cần URL API công
khai. Khi đổi URL backend, build lại cả web lẫn mobile để nhúng URL mới.
