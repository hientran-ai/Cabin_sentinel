# Chạy CabinSentinel thật (production)

Bản production không có mô phỏng, không có mã thử, không có "chế độ dùng thử". Dữ liệu xe chỉ đến từ **thiết bị đặt trong xe**; cảnh báo chỉ đi qua các kênh thật. Ứng dụng production là **Cabin Noir** (`PRODUCTION` bật sẵn). App cũ *CabinSentinel* vẫn là bản demo.

## Ba vai trò

| Vai trò | Là gì | Đăng nhập bằng |
|---|---|---|
| Server | FastAPI + SQLite + bộ gửi cảnh báo chạy nền | – |
| Thiết bị trong xe | Một iPhone/iPad/Mac có camera, mở Cabin Noir › "Máy này đặt trong xe" | Mã ghép nối (một lần) → token riêng của thiết bị |
| Chủ xe / người thân | Cabin Noir › "Tôi là chủ xe" | Số điện thoại + mã 6 số |

Thiết bị trong xe **không** dùng tài khoản chủ xe. Chủ xe tạo mã (Tài khoản › Thiết bị trong xe › Tạo mã ghép nối), mã dùng một lần trong 10 phút. Chủ xe có thể ngắt thiết bị bất cứ lúc nào; server chỉ lưu băm của token.

## 0. Tuần đầu, miễn phí: ngay trên Mac của bạn

```bash
scripts/start_prod.sh     # server production trên cổng 8100 + địa chỉ https công khai (Cloudflare quick tunnel), Mac không ngủ
```
Script in ra **địa chỉ máy chủ** (nhập vào app) và **kênh ntfy nhận mã đăng nhập** (đăng ký kênh đó trong app ntfy). Giữ cửa sổ mở; Ctrl-C để dừng. Địa chỉ đổi mỗi lần chạy lại, nên mỗi lần phải nhập lại trong app (Tài khoản › Máy chủ). Cấu hình nằm ở `backend/.env` (không đưa lên git). Cổng 8000 là server demo của app cũ, không dùng.

## 1. Chạy server

```bash
cp backend/.env.example backend/.env   # điền xong rồi mới chạy
backend/run_prod.sh                    # hoặc: docker compose up -d --build
```
Server **từ chối khởi động** nếu chưa có kênh gửi mã đăng nhập: điền `TWILIO_*` (SMS) hoặc `OTP_NTFY_TOPIC` (mã được đẩy tới một kênh quản trị riêng mà bạn đăng ký trong ntfy; phù hợp một gia đình tự chạy server).

- **HTTPS**: iOS chỉ cho phép `http` trong mạng nội bộ (192.168.x.x, .local). Ra Internet cần https: `docker compose` kèm Caddy tự cấp chứng chỉ (đặt `CABIN_DOMAIN`), hoặc Cloudflare Tunnel.
- **Dữ liệu**: `CABIN_DB` (SQLite) và `CABIN_MEDIA`. Sao lưu file này. Chạy **một worker** (đã đặt sẵn).
- Kiểm tra: `curl https://máy-chủ/health` phải có `"env":"production"`.

## 2. Thông báo tới điện thoại (kể cả khi đóng app)

Hiện dùng **ntfy** (miễn phí, không cần tài khoản Apple Developer). Mỗi người dùng có một kênh riêng ngẫu nhiên. Trong app: Tài khoản › Thông báo đẩy › Đăng ký trong ntfy › Gửi thông báo thử. Dùng `ntfy.sh` công cộng hoặc tự dựng (`NTFY_URL`, `NTFY_TOKEN`). Khi có tài khoản Apple Developer, thay bằng APNs là việc riêng; luồng cảnh báo phía server không đổi.

## 3. Cảnh báo hoạt động thế nào

Bộ gửi nền chạy 5 giây một lần, **không cần ai mở app**:
1. Thiết bị báo có người ở ghế sau, xe đang đỗ → sự cố mở → **push khẩn tới mọi người trong gia đình**.
2. Chưa ai mở sau 60 giây → push nhắc lại mỗi phút. 30 giây: SMS chủ xe; 90 giây: SMS người liên hệ khẩn cấp (cả hai chỉ khi **Nghiêm trọng** và đã cấu hình SMS). 180 giây: gợi ý gọi 112.
3. Có người bấm "Đã xem" → dừng nhắc, **sự cố vẫn mở**. Chỉ khi chủ xe/người xác nhận bấm "Tôi đã kiểm tra xe" **và** camera không còn thấy người thì sự cố mới đóng.
4. Thiết bị im quá 2 phút → push "Mất kết nối thiết bị trong xe" (một lần) và xe hiện **"Chưa thể đánh giá"**, không bao giờ "an toàn". Khi nối lại có push báo lại.
5. Màn "Khi không nhận được thông báo" chỉ ghi **đã gửi** cho bước thật sự gửi được. Bước không làm được (chưa cấu hình SMS, gọi điện tự động) ghi **"Không thực hiện"**.

## 4. Những gì phải biết (giới hạn thật)

- **Không có cảm biến nhiệt trong cabin.** iPhone không đo được nhiệt độ cabin. Thiết bị gửi nhiệt độ **ngoài trời** (Open-Meteo, theo GPS); từ `CABIN_HOT_OUTSIDE_C` (mặc định 28°C) trở lên, xe đỗ có người được coi là Nghiêm trọng, thấp hơn là Cảnh báo. App hiện "Ngoài trời", không hiện số cabin tự suy ra.
- **Không có cảm biến cửa, không biết đã khóa chưa.** App ghi "Xe đang đỗ", không ghi "Đã khóa". Muốn ngồi trong xe đỗ mà không bị báo: Tạm dừng giám sát (tối đa 60 phút, tự bật lại, không thể bấm khi đang có sự cố).
- **Xe chạy hay đỗ** suy từ GPS (trên ~9 km/h trong 5 giây là chạy; dưới ~4 km/h trong 30 giây là đỗ).
- **Camera chỉ chạy khi app ở phía trước, màn hình sáng.** App giữ máy không tự khóa, có chế độ tắt màn hình tối đa độ sáng, và báo ngay trên thiết bị nếu app bị đẩy ra nền. Xe nóng thì iPhone cũng nóng: thiết bị báo trạng thái nhiệt; nếu "Nóng/Quá nóng", xe hiện "Thiết bị quá nóng, chưa thể đánh giá". Đặt thiết bị nơi thoáng, có nguồn điện.
- **Nhận diện có thể bỏ sót** (che khuất, thiếu sáng, ngồi nghiêng). Chỉ báo từ 50% độ tin cậy. Tuổi chỉ là gợi ý và không bao giờ làm giảm cảnh báo.
- **Không điều khiển xe**: không điều hòa từ xa, không mở khóa, không còi. Không gọi điện tự động.
- Ứng dụng hỗ trợ giám sát, **không đảm bảo an toàn tuyệt đối**.

## 5. Kiểm tra

```bash
backend/.venv/bin/python -m pytest backend/tests          # 30 test
backend/.venv/bin/python scripts/e2e_production.py        # server thật + ntfy giả, ~80 giây
python3 scripts/rehearsal.py                              # diễn tập local: server production :8001 + ntfy giả in ra màn hình
python3 scripts/fake_device.py 0903123789                 # thiết bị giả (không cần camera); touch /tmp/cabin-rehearsal/person để "có người"
```
