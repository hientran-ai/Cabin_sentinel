# VinFast HMI × CabinSentinel — báo cáo bàn giao (16/10/2026)

TASK VINFAST-HMI-IMPL-20261016 · OWNER FRONTEND_AGENT · checkout `.claude/worktrees/oem-e2e` (feat/oem-e2e-v1, **chưa commit/push/deploy**).

## URL và lệnh
- Dev (đang chạy cổng 4177, backend :8000): `/cockpit/vinfast/` (toàn trang), `/cockpit/vinfast/?view=cockpit` (cockpit toàn cửa sổ). SU7 `/cockpit/`, Tesla `/cockpit/tesla/` giữ nguyên.
- `cd apps/cockpit-web && npx tsc -b && npx vitest run && npx vite build`.

## Trạng thái bằng chứng (RULE-05)
CODE_CHANGED · TEST_EXECUTED · TEST_PASSED (tsc sạch, vitest 79/79, vite build 3 entry) · LOCAL_RUNTIME_VERIFIED (headless Chrome, backend thật: clip trẻ + cabin nóng → CRITICAL/HOT_OCCUPANT, 1 người, tuổi unknown; tile/prompt/toast hiện ngay) · ONLINE / HARDWARE / OEM_NOT_VERIFIED.

## VERIFIED / PROPOSED / UNVERIFIED
| | Nội dung |
|---|---|
| VERIFIED (nguồn) | Mulish; 4 màu A09; kích thước A06; icon/ảnh xe cắt từ A13/A14; wallpaper tối từ A01 |
| VERIFIED (chạy local) | 3 entry build; map một canvas; đếm theo khung từ read model thật; alert tức thì; ảnh 1920×1080, 1600×900, 1280×720 (`docs/evidence-vinfast-2026-10-16/shots`) |
| PROPOSED | vị trí widget (không có tọa độ gốc), bề mặt/alpha/radius, theme sáng (gradient), timing motion, tile CabinSentinel, climate sheet |
| UNVERIFIED | độ lệch ≤4px so golden; FPS median/p95; phone-width; camera blocked/stale/mất mạng chưa xem lại ảnh; icon sidebar/map vẫn lucide; clone y đúc; mọi thứ OEM/xe thật |

## Count-per-frame (code: `e2e/cabinCounts.ts`, 16 test)
Chỉ khung accepted mới nhất của đúng phiên; stale/mất kết nối/camera lỗi → số hiện tại = `—`; tuổi chỉ khi `age_classifier=ok` (disabled/load_failed/error → child/adult `—`, mọi người là "chưa rõ tuổi"); đồ vật luôn "Chưa hỗ trợ" (chưa có kênh analytics). Không đổi rules/TTL/HITL/action. Sửa `EvidencePanel` bỏ chuỗi cố định "Không có nhãn trẻ em".

## Giới hạn / việc tiếp (owner)
1. Analytics đồ vật: đề xuất contract additive trong `CODE_API_AUDIT.md` (BACKEND/VISION, cần quyết định) — chưa làm.
2. SR-01 vẫn mở (detector gốc bỏ sót trẻ ghế sau) — SAFETY_AGENT.
3. Wallpaper sáng, icon sidebar/map, logo đầy đủ: cần asset gốc từ hãng/Aurora.
4. QA còn thiếu: golden compare, FPS, phone-width, camera fault/stale ảnh, chụp lại theme sáng ở 3 viewport.
5. Hỏi người dùng trước khi push lên P-068.

## Cập nhật: skin "blue" (mặc định) — đo từ ảnh màn thật
- `/cockpit/vinfast/` mặc định skin **blue** (cột trái 608px + đường ngăn, hai thẻ phải, thanh dưới, nền xanh hoàng gia, nét lá line-art cắt từ ảnh thật, ban đêm xanh teal như ảnh Wi‑Fi). `?skin=aurora` quay về layout A06. Số đo: `docs/vinfast/reference-crops/measured-lines.json` (ước lượng ±10px).
- Animation mới: nền lá, ánh đèn xe, thẻ vào màn, intro tùy chọn `?intro=1`. Chưa tải/nhúng video Vimeo.
- Ảnh: `shots/blue-*.png`. Chưa chạy lại 3 viewport và theme đêm cho skin blue; model/firmware màn thật UNVERIFIED.

## Cập nhật: điều hòa mới, cài đặt có video minh hoạ, icon vector, hình nền
- Điều hòa: clone màn climate VF8 (xe cắt lớp, 3 nút luồng gió trên xe, cung quạt 0–6 kéo được, AUTO/MANUAL, A/C, MAX A/C, Tuần hoàn, ION, SYNC); luồng gió động theo mức quạt và hướng gió. ION/MAX A/C là mô phỏng.
- Cài đặt: Trạng thái (clone ảnh Status, pin vẽ theo %), Màn hình (lưới 11 hình nền chọn được), Ánh sáng (ảnh nội thất + vòng màu sống), Hỗ trợ lái (3 video Summon/Auto Park/CPD cắt từ Vimeo 820387196), Áp suất lốp (ảnh xám, số "—"), Xe (lưới 3×2 như ảnh: ADAS, tắt cảnh báo, cốp, gạt mưa, cửa sổ, sấy kính).
- Icon thanh dưới/cột trái/điều hòa/cài đặt chuyển sang vector vẽ lại (`glyphs.tsx`), logo V vector.
- Test mới: cung quạt, vòng màu (82/82 pass). Build đạt.
- Giới hạn: một số video Vimeo bị trang kiểm tra người dùng chặn (không vượt); chưa xem YouTube VF6/7/8/9; quyền dùng frame/video của Aurora UNVERIFIED — chỉ demo nội bộ, không deploy công khai trước khi có quyền.

## Cập nhật 17/10: redesign theo prompt "Complete HMI Redesign"
- Xe mục tiêu: **VF 8** theo ảnh người dùng cung cấp; phiên bản, năm và mọi thông số chính hãng **chưa xác minh** (để trống, không điền số ước đoán). Pin 87.7 kWh là số của bộ mô phỏng dự án, gắn nhãn PROJECT_SIM.
- Logo: thay logo tự vẽ bằng SVG logo VinFast lấy từ Wikimedia Commons (symbol + wordmark, bản tối/sáng chỉ đổi màu nền), favicon cho `/cockpit/vinfast/`. Bản quyền thương hiệu thuộc VinFast; Commons ghi public domain + trademarked.
- Design tokens `tokens.css` (bảng màu navy trong prompt, bán kính 16/12/10, lưới 8px) áp cho skin blue; bỏ màu xanh bão hòa. Đây là màu đề xuất, không phải màu chính hãng.
- Ảnh: VF8 3/4 tách nền (hero Trạng thái), khoang lái (xem trước đèn viền), nội thất nhìn từ trên (hình minh hoạ cabin, model chưa xác minh, không dùng làm bằng chứng ghế).
- Mô hình dữ liệu typed `vehicleProfile.ts` (VehicleProfile, VehicleTelemetry, nguồn gốc từng trường) + 5 test. Trạng thái xe hiện bảng thông số kèm nhãn nguồn.
- Mockup: `docs/vinfast/redesign/mockup-02-cockpit.png` (giao diện thật đặt vào ảnh khoang lái, giữ tỉ lệ 16:9, không kéo giãn), `before-after-all.png`, từng cặp before/after.
- Test: tsc, vitest 87/87, build đạt. Chưa có: mockup 01/03–06 riêng, mockup AVIF, ảnh VF8 các góc khác (xem asset-manifest.json mục unavailable).

## Cập nhật: cột trái (left vehicle panel) + Car Mode
- Cột trái viết lại bằng CSS Grid 3 vùng (số liệu / xe nhìn từ trên + nhãn / điều khiển nhanh): tốc độ 96px tabular, P R N D với số đang chọn nổi bật, pin + quãng đường gom một nhóm, đường chế độ lái là 1 SVG đối xứng (ECO xanh, NORMAL trung tính, SPORT hổ phách).
- Xe nhìn từ trên: ảnh A13 cắt lại, tách nền, bỏ vầng sáng mờ, bóng đổ nhẹ, căn giữa. Nhãn 7 bộ phận (4 cửa, cốp trước/sau, cổng sạc): đóng = trung tính, mở = hổ phách, lỗi = đỏ, chưa rõ = viền đứt; bấm để đổi (mô phỏng).
- Điều khiển nhanh: 7 nút 56px, icon vector cùng họ (xe, khoá, điều hòa, ghế sưởi, đèn, khẩn cấp, CAR MODE). Khoá chỉ hiện thông báo mô phỏng.
- Car Mode mở màn "Chế độ xe": Cắm trại (nối Cabin Care backend thật, lệnh mô phỏng), Chế độ bé (chỉ giám sát, nhắc không để trẻ một mình), Thú cưng và Rửa xe (hiển thị mô phỏng; Rửa xe bị chặn khi còn cửa/cửa sổ/cổng sạc/cốp mở).
- Token dùng chung: nút 48/56px, bo 10/12/16, hàng cài đặt 80px. Test mới carUi (trạng thái bộ phận, điều kiện rửa xe). Ảnh trước/sau: docs/vinfast/redesign/left-panel-*.
- Chưa làm: kiểm tra độ lệch với ảnh thật ≤4px, màn hẹp, rà toàn bộ spacing các màn khác ngoài các token chung ở trên.

## Cột trái v3 (4 vùng: A trạng thái / B lái / C xe / D điều khiển)
- Ảnh xe mới `car-top-mirrors.png`: lấy lại cả gương chiếu hậu, không còn vầng sáng; xe chiếm ≤42% bề rộng vùng, có chỗ cho nhãn. Nhãn cửa/cốp/cổng sạc theo hai cột đối xứng + cốp trước/sau căn giữa, chấm nhỏ + đường nối mảnh.
- Phân cấp chữ: tốc độ 104px nhẹ (500), pin 32px, quãng đường 18px, số P R N D 20px (số đang chọn nền xanh), READY xanh lục dưới km/h; số tabular.
- Điều khiển nhanh: lưới 4×2, icon 24px cùng họ; 4 trạng thái: mặc định (nền tối), đang chọn (nền xanh nhạt + viền), tính năng bật (điều hòa xanh lạnh, sưởi ghế cam, đèn trắng nhạt), cảnh báo (khẩn cấp, hổ phách); CAR MODE là nút đặc duy nhất. Chip "Phanh tay" hổ phách, "Đèn Auto" xanh lục nhạt.
- Còn lại: ảnh xe vẫn là ảnh Aurora độ phân giải thấp; chưa đo lệch so với màn thật; màn hẹp chưa kiểm.

## Tinh chỉnh HIG (17/10): khoảng cách, bán kính, nhịp điều khiển
- tokens.css: thang khoảng cách 4/8/12/16/20/24/32/40 và thang bán kính 6/8/12/16/20/24 (lồng nhau: panel 20 > thẻ 16 > thẻ trong/điều khiển 12 > nhỏ 8). Màu, bố cục, tài sản không đổi.
- Kiểm kê tự động trên UI chạy (audit headless): trước có bán kính 8/10/12/16/22/24/28 và khoảng cách lệch lưới 2/3/6/10/14/22; sau còn bán kính 8/12/16/20/24 (+hình tròn) và chỉ còn khoảng cách 3px của marker bản đồ bên thứ ba. Chiều cao nút: 48/56/64/72/80/88.
- Cột trái: lề 24px chung, lưới 3×2 đều (gap 8, tile 88, bo 12), nhãn xe cách 8/4px, số dùng tabular cho tốc độ, pin, quãng đường, nhiệt độ, giờ.
- Chưa làm: kiểm tra toàn bộ từng màn Cài đặt (chỉ chụp lại Cài đặt Xe và Cabin), squircle thật (CSS corner-shape chưa dùng), so sánh pixel với màn thật.
