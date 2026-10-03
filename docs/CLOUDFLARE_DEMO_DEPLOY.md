# Deploy demo ảnh thật: Cloudflare Pages + backend Python

Cloudflare Pages phục vụ frontend React/Vite. Backend FastAPI + YOLO chạy trong
Docker trên Railway. Ảnh tải lên được backend xử lý; Pages không chạy model
Python. Đây là cấu hình để **demo kỹ thuật**, chưa phải hệ thống cảnh báo an
toàn có thể dùng thực tế.

## 1. Đưa mã nguồn lên Git

Commit và push frontend, `Dockerfile` và hướng dẫn này lên nhánh định deploy.
Cloudflare/Railway chỉ thấy nội dung đã push, không thấy thay đổi còn nằm trên
máy. Kiểm tra `git status` và `git diff --cached` trước khi commit; không đưa
`.env`, model riêng, ảnh cá nhân hay thư mục `output/` lên Git. Các đường dẫn
`.env`, `models/`, `data/`, `output/` đang được ignore.

## 2. Deploy backend trên Railway

Tạo service từ GitHub repository này. Đặt **Root Directory** ở gốc repository
(nơi có `Dockerfile`); Railway sẽ nhận diện Dockerfile. Chọn trước tên project
Pages, ví dụ `cabinsentinel-demo`, rồi khai báo các biến của service:

```dotenv
APP_ENV=production
BUNDLE_STOCK_DEMO_MODEL=true
MODEL_PATH=/app/models/yolov8n.pt
CABINSENTINEL_DB_PATH=/app/data/cabinsentinel.db
CABINSENTINEL_MQTT_ENABLED=false
CORS_ORIGINS=https://cabinsentinel-demo.pages.dev
```

`BUNDLE_STOCK_DEMO_MODEL=true` là build argument: Docker sẽ tải stock
`yolov8n.pt` từ Ultralytics và kiểm tra SHA-256 khi build. Build cần truy cập
GitHub và PyTorch. Model này **không được huấn luyện/đánh giá riêng để nhận diện
trẻ em trong cabin**. Docker image thử nghiệm cục bộ có kích thước khoảng
2,7 GB; chọn gói dịch vụ đủ tài nguyên và dự trù thời gian build.

Trong Railway, tạo public HTTPS domain cho service. Mở
`https://<backend-domain>/health`: cần HTTP 200 với `vision: ready` và
`database: ready`. Với SQLite demo, chỉ chạy một replica/worker. Nếu không gắn
persistent volume vào `/app/data`, lịch sử sẽ mất khi service được tạo lại.

## 3. Deploy frontend trên Cloudflare Pages

> Website chính hiện là Owner Web trong `apps/owner-web`. Với **Workers Builds**,
> để **Root directory** ở gốc repository, build bằng
> `npm ci && npm run build:web`, rồi deploy bằng `npm run deploy:web`.
> Không thêm catch-all `_redirects`: Workers
> Static Assets dùng `not_found_handling = "single-page-application"` để tránh
> vòng lặp redirect.

Vào **Workers & Pages → Create application → Pages → Import a Git repository**,
chọn repository và cấu hình:

| Mục | Giá trị |
| --- | --- |
| Project name | `cabinsentinel-demo` (hoặc sửa `CORS_ORIGINS` theo tên thực tế) |
| Production branch | Nhánh chứa code mới nhất đã push |
| Root directory | để trống (repository root) |
| Framework preset | React (Vite) |
| Build command | `npm ci && npm run build:web` |
| Build output directory | `apps/owner-web/dist` |

Thêm **build environment variables** cho Pages:

```dotenv
NODE_VERSION=22.16.0
VITE_API_BASE_URL=https://<backend-domain>
VITE_VEHICLE_ID=CAR_1
```

`VITE_API_BASE_URL` là origin HTTPS công khai của backend, không thêm `/api/v1`.
Vite nhúng giá trị này vào bản build frontend, nên đổi biến phải deploy Pages
lại. Nếu URL Pages thực tế khác URL dự kiến, sửa `CORS_ORIGINS` trên Railway
thành đúng origin đó (không có dấu `/` ở cuối) rồi redeploy backend.

## 4. Kiểm tra từ trình duyệt

Mở URL Pages. Panel phân tích ảnh cần báo **Vision model ready**. Tải ảnh cabin
JPEG/PNG thật dưới 5 MiB lên, rồi chọn `normal`, `parked_locked` hoặc
`hot_locked`. Ảnh là dữ liệu thật; kịch bản chỉ cung cấp **telemetry xe giả
lập**. Sau khi phân tích, dashboard lấy trạng thái đã lưu từ backend.

Các thao tác còi, SMS và thông báo vẫn là mô phỏng; mở khóa chỉ ở trạng thái
chờ người xác nhận. Không tải ảnh nhạy cảm của người khác lên public demo khi
chưa có sự đồng ý. Stock YOLO có thể bỏ sót trẻ em: kết quả `SAFE` **không**
chứng minh cabin trống. Hãy dùng ảnh đã được phép chia sẻ và giới thiệu rõ giới
hạn này khi thuyết trình.

Nếu lỗi CORS, đối chiếu chính xác origin Pages với `CORS_ORIGINS`. Nếu model
không sẵn sàng, kiểm tra `/health` và log build của backend.

Tài liệu chính thức: [Cloudflare Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/), [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/), [Railway Dockerfiles](https://docs.railway.com/builds/dockerfiles), [Railway variables](https://docs.railway.com/variables).
