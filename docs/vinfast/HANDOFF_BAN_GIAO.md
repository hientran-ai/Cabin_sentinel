# Bàn giao: VinFast HMI × CabinSentinel (cockpit + luồng điện thoại)

Cập nhật 17/10/2026. Checkout: `/Users/mac/AI/P-068/.claude/worktrees/oem-e2e` (nhánh `feat/oem-e2e-v1`). **Chưa commit, chưa push, chưa deploy.** Hỏi người dùng trước khi push lên P-068.

## 1. Chạy thế nào
- Dev đang chạy: frontend `http://127.0.0.1:4177/cockpit/vinfast/` (thêm `?view=cockpit` để chỉ xem màn xe), backend `:8000`. SU7 `/cockpit/` và Tesla `/cockpit/tesla/` không đổi.
- Tùy chọn URL: `?skin=aurora` (layout Aurora cũ), `?intro=1` (intro vẽ chữ V), `?debug=1` (hook đo cho test).
- Kiểm tra: `cd apps/cockpit-web && npx tsc -b && npx vitest run && npx vite build`. Lần cuối: tsc sạch, vitest 90/90, build 3 entry đạt.

## 2. Phần cockpit: đã làm gì
Bản giao diện VinFast thứ ba trong `apps/cockpit-web`, cùng backend `/api/v1/e2e` với hai bản kia, chỉ khác lớp giao diện.
- **Màn chính (skin blue, mặc định):** cột trái 608px (giờ + chip, chế độ lái ECO/NORMAL/SPORT, pin, quãng đường, tốc độ, P R N D, banner cảnh báo, xe nhìn từ trên có nhãn cửa/cốp/cổng sạc, lưới 6 nút 3×2); bên phải: bản đồ MapLibre (một canvas, mở rộng được), thanh media, lưới ứng dụng, thẻ CabinSentinel; thanh điều hòa dưới cùng.
- **Header:** logo V + widget "Chế độ xe" (bấm để bật/tắt chế độ cắm trại, thú cưng, rửa xe hoặc mở màn chế độ).
- **Các màn:** Điều hòa (xe cắt lớp, 3 nút luồng gió, cung quạt 0–6), Giám sát cabin (tổng quan + bằng chứng), Thiết lập CabinSentinel, Chế độ xe (Cắm trại, Bé, Thú cưng, Rửa xe), Cài đặt (Trạng thái, Màn hình/hình nền, Ánh sáng, Hỗ trợ lái có video, Áp suất lốp, Xe, Âm thanh, Sạc, Hệ thống), Camera, Điện thoại, Thư viện ứng dụng.
- **Thiết kế:** font Mulish, màu primary/critical/warning/success theo bảng Aurora A09; token navy trong `tokens.css`; lưới 8px, bán kính 8/12/16/20/24, chiều cao nút 48/56/80/88; icon vector vẽ lại + một phần crop từ ảnh tham chiếu.
- **Chuyển động:** nhấn, mở panel, đổi tab, luồng gió, nền lá/cực quang trôi, kéo đóng bảng điều hòa; tôn trọng giảm chuyển động; cảnh báo không bị trễ bởi animation.

### Đếm theo khung (người, thú, tuổi, đồ vật)
`src/e2e/cabinCounts.ts` (+ test): chỉ lấy khung accepted mới nhất của đúng phiên; cũ/mất kết nối/lỗi camera → hiện "—", không bao giờ là 0; trẻ em/người lớn chỉ khi bộ phân loại tuổi báo `ok`; đồ vật luôn "Chưa hỗ trợ" (chưa có kênh analytics). Sửa `EvidencePanel` để dòng "Nhãn trẻ em" theo trạng thái bộ phân loại thật.

## 3. Phần điện thoại (mobile) trong luồng người dùng
**Tôi không sửa giao diện điện thoại.** `phone-ui` (Cabin Noir, iframe), `PhoneFrame` và các endpoint backend giữ nguyên. Cockpit chỉ phản chiếu luồng đó:
1. Backend chấm điểm khung ảnh + telemetry mô phỏng → trạng thái đã commit (revision).
2. Cockpit hiện ngay: banner đỏ/hổ phách ở cột trái, thẻ CabinSentinel, toast. Không bị trễ bởi animation.
3. Thông báo gửi tới điện thoại chủ xe (bộ gửi mô phỏng). Màn "Điện thoại chủ xe" trên cockpit chỉ đọc: hiện giai đoạn, revision, đã nhận chưa, push mô phỏng.
4. **Chỉ điện thoại** mới "Đã xem" (ACK) và "Đã kiểm tra cabin" (resolve). Cockpit không có nút nào làm hai việc này, và vuốt toast chỉ ẩn thông báo.
5. Chế độ cắm trại bật từ cockpit gọi `careStart/careStop` của backend (lệnh mô phỏng); "tự bật khi có cảnh báo" gọi `careConsent`. Không cái nào đóng sự cố hay đổi mức rủi ro.
Chưa làm: UI điện thoại mới, bản đồ đường dẫn tới điện thoại, push thật.

## 4. Bất biến an toàn (không đổi)
Không phát hiện ≠ xe trống (SR-01 vẫn mở); cũ ≠ hiện tại; người ≠ trẻ em; mọi lệnh xe là MÔ PHỎNG; luật, ngưỡng, TTL, HITL, action không đụng tới; mở khóa chỉ qua điện thoại. Màn Thiết lập CabinSentinel hiện các mục này ở trạng thái khóa/chỉ đọc.

## 5. Danh sách file (đường dẫn dưới `apps/cockpit-web/`)
**Mới, giao diện** (`src/components/automotive/vinfast/`): `VinfastExperience`, `VinfastDashboard`, `VinfastLeftPanel`, `VinfastBlue` (header, thanh dưới), `VinfastHomeWidgets` (bản đồ, media, lưới ứng dụng), `VinfastClimatePanel`, `VinfastCabin`, `VinfastCabinSettings`, `VinfastCarMode`, `VinfastSettings`, `VinfastPanels`, `VinfastPhoneFeature`, `VinfastAlert`; bản Aurora cũ: `VinfastStatusBar`, `VinfastVehiclePane`, `VinfastClimate`; hỗ trợ: `glyphs.tsx`, `parts.tsx`, `carUi.ts`, `useVinfast.ts`, `vehicleProfile.ts`, `layout.ts`, `gesture.ts`, `skin.ts`, `tokens.css`, `vinfast.css`.
**Mới, test:** `carUi.test.ts`, `controls.test.ts`, `layout.test.ts`, `vehicleProfile.test.ts`, `src/e2e/cabinCounts.test.ts`.
**Mới, entry:** `vinfast/index.html`, `src/vinfast-main.tsx`, `src/e2e/cabinCounts.ts`.
**Sửa nhỏ (không đổi hành vi mặc định):** `vite.config.ts` (thêm input vinfast), `src/e2e/E2ePage.tsx` (tham số `artboardRem`, `headerExtra`), `src/e2e/EvidencePanel.tsx`, `src/components/automotive/camera/CameraPanel.tsx` (kiểu hiển thị vinfast), `navigation/NavigationMap.tsx` + `src/lib/mapConfig.ts` (bảng màu bản đồ VinFast), `src/types/vehicle.ts` (thêm overlay `phone`, `library`, `carmode`, `cabinset`).
**Tài sản** (`public/vinfast/`, 8.8 MB): `brand/` (logo SVG), `vehicle/` (VF 8, khoang lái, nội thất), `car-top-*.png`, `wall/` (hình nền), `clips/` (3 video), `ill/` (ảnh minh họa), `icons/`, `app-*.png`, `leaf-top.png`; font: `public/fonts/mulish/`.
**Tài liệu** (`docs/vinfast/`): `VINFAST_HMI_REPORT.md` (báo cáo), `asset-manifest.json`, `source-ledger.json`, `geometry-ledger.json`, `motion-ledger.json`, `AGENT_HANDOFF.md`, `HANDOFF_BAN_GIAO.md` (file này); ảnh: `redesign/`, `wireframe/`, `wireframe-live/`, `reference-crops/`, `video-frames/`, và `docs/evidence-vinfast-2026-10-16/`.
Nhật ký: `/Users/mac/BUILD_PHASE/AI_LOG.md` (mục 16–17/10/2026).

## 6. Rủi ro và việc còn lại (có chủ)
| Việc | Chủ | Ghi chú |
|---|---|---|
| Quyền dùng ảnh/video Aurora, ảnh VF 8, logo | PO | Chưa xác minh; chỉ demo nội bộ, không deploy công khai |
| Thông số chính hãng VF 8 (bản, năm, quãng đường, công suất) | PO / nguồn hãng | Đang "Chưa xác minh", không điền số |
| Ảnh VF 8 các góc khác, top-view đúng model, hero ≥2048px | PO / thiết kế | Hiện 1 ảnh 1000px; top-view là crop Aurora |
| Đếm đồ vật (kênh analytics tách khỏi safety) | BACKEND/VISION | Cần quyết định + migration additive |
| SR-01 (detector bỏ sót trẻ ghế sau) | SAFETY | Giữ mở |
| Đo FPS, độ lệch ≤4px với golden, màn hẹp, camera 360° thật | REVIEW | Chưa làm |
| Squircle thật, rà hết các màn Cài đặt sau lượt HIG cuối | FRONTEND | Chưa làm |
| Video Vimeo bị chặn người-kiểm (≈10 clip); xhslink chỉ xem qua trình duyệt | — | Không vượt rào |

## 7. Mức bằng chứng
CODE_CHANGED · TEST_EXECUTED/PASSED (tsc, vitest 90/90, vite build) · LOCAL_RUNTIME_VERIFIED (headless Chrome + backend thật, ảnh 1920×1080) · ONLINE / HARDWARE / OEM_NOT_VERIFIED. Không claim "clone y đúc", "production" hay "phát hiện trẻ chính xác".

## 8. Cập nhật 17/10 (tối): trang demo cho giám khảo + thiết kế lại Cài đặt
**Trang demo `/cockpit/vinfast/`** (file `src/components/automotive/vinfast/demo/`, entry `vinfast-main.tsx` không còn dùng `E2ePage`):
- Dải **4 kịch bản một chạm** (Trẻ trong xe + xe nóng · Cabin trống · Camera bị che · Mất kết nối) + **Dùng camera của tôi** + **Đặt lại**. Mỗi nút ghi sẵn điều mong đợi. Kịch bản chỉ đặt đầu vào (clip, nhiệt độ giả lập, lỗi camera, ngắt mạng); mức rủi ro luôn do backend trả về.
- **Thanh 7 bước** sáng theo trạng thái thật: Nguồn hình → Model phân tích → Quyết định đã lưu → Cảnh báo trên xe → Điện thoại nhận → Chủ xe đã xem → Đã kiểm tra cabin. Bước hỏng/cũ/mất kết nối hiện màu cảnh báo, không bao giờ hiện "xong". Logic thuần có test (`demo/flow.test.ts`).
- **Màn xe và điện thoại cạnh nhau**, có chú thích, **revision** hiện ở giữa ("Cùng một phiên").
- **Môi trường giả lập** và **Bằng chứng** là hai bảng gấp, mặc định đóng, có dòng tóm tắt; nhãn tiếng Việt. Môi trường giả lập gồm nhiệt độ trong/ngoài xe, tua nhanh, thời tiết thật, số xe, khoá/động cơ/tài xế/radar/điều hoà, chế độ xe, clip mẫu, tải ảnh, lỗi camera, lỗi bộ gửi, ngắt mạng.
- **Camera của máy**: nút trên dải kịch bản, có hộp đồng ý rõ ràng trước khi bật, xem trước khung vừa gửi, dừng được. Đã kiểm bằng Chrome camera giả: 7 khung được backend nhận, nguồn `DEVICE_CAMERA`. **Chỉ mở ở localhost** (hoặc build có `VITE_ENABLE_DEVICE_CAMERA=true`): đây là quy tắc riêng tư DP-03/DP-07 trong mã. Bản trực tuyến muốn cho giám khảo dùng camera phải do PO/bảo mật quyết định bật.
- Bỏ các chip và link trùng; "CX" → "Chủ xe"; bỏ chip `HOSTED_SIMULATION`, `MÔ PHỎNG`, `Không hỗ trợ` trên màn xe. Thông báo giả lập còn **một câu duy nhất** dưới tiêu đề trang. Nhãn chế độ lái, chip, "SẴN SÀNG/ĐỖ" đã sang tiếng Việt.

**Cài đặt thiết kế lại:** thanh bên có chữ, nhóm mới **Giám sát cabin** (nút CabinSentinel mở thẳng nhóm này) với 4 thẻ **Trẻ em · Người · Thú cưng · Đồ vật bỏ quên**: trạng thái đọc từ trạng thái model thật (`trackingCaps`, có test), số đếm theo khung gần nhất, công tắc hiện trên thẻ chính. Quy tắc an toàn (ngưỡng, thời hạn dữ liệu, mở khoá) chỉ đọc/khoá.

**Điều cần PO biết về "mô hình mới tracking được trẻ em, người, thú cưng, đồ vật bỏ quên":** giao diện đã sẵn sàng cho cả bốn, nhưng *backend hiện báo*: người và chó/mèo = sẵn sàng; trẻ em = chưa bật (bộ phân loại tuổi `disabled`); đồ vật bỏ quên = không có kênh. Thẻ chỉ sáng "Sẵn sàng" khi máy chủ báo thật (đồ vật cần cờ `items_tracking` trong trạng thái model; chưa tồn tại). Cần: model/endpoint mới + hợp đồng dữ liệu (BACKEND/VISION) và quyết định về đồ vật bỏ quên (theo dõi theo thời gian, không chỉ một khung). Cho tới lúc đó UI hiện "—" và "Chưa hỗ trợ", không điền số.

**Không đổi:** giao diện điện thoại Cabin Noir (vẫn có chữ "MÔ PHỎNG" riêng của nó), rules, TTL, HITL, backend.
Test: tsc sạch, vitest 102/102, build đạt; không tràn ngang ở 420/800/1440/1920px.

**Video CPD chuyển sang Giám sát cabin (17/10):** clip "Phát hiện trẻ trong xe" không còn ở Cài đặt › Hỗ trợ lái (còn Summon, Tự đỗ xe). Nó nằm trong **Giám sát cabin**: (1) tab Tổng quan dùng video làm hình bên trái khi chưa có khung camera thật (có khung thì hiện khung làm mờ); (2) tab mới **Cách hoạt động** có video lớn + 4 bước Quan sát → Nhận diện → Đánh giá → Cảnh báo. Ghi rõ đây là video minh hoạ khái niệm của hãng, kết quả thật lấy từ backend. Nguồn video: Aurora/Vimeo 820387196, quyền dùng chưa xác minh.


## 9. Cập nhật 17/10 (đêm): nhật ký bằng chứng, model mới, Chế độ xe
- **Nhật ký bằng chứng** (bảng "Bằng chứng" trên trang demo): mỗi khung và mỗi quyết định đã lưu thành một dòng (lớp, độ tin cậy, nhãn tuổi nếu có, thời gian suy luận, revision, mức rủi ro). Tải `.jsonl` / `.csv`, xoá được. Không ảnh, không toạ độ, tối đa 2000 dòng, chỉ trong trình duyệt. Đây là bằng chứng **pipeline đã chạy**, không phải độ chính xác. Code: `src/e2e/evidenceLog.ts`.
- **Model mới nhất**: bundle thử nghiệm 14/10 trên `origin/main` đã tải về (5 file, sha256 khớp, không commit). Backend demo vẫn chạy `yolov8n.pt`. Kết quả chạy offline trên 3 clip mẫu nằm ở `docs/vinfast/evidence-model-2026-10-17/`: có nhãn trẻ em ở clip `ai-child` (không ổn định), **vẫn bỏ sót trẻ ghế sau** ở `child-rear` (SR-01), không báo nhầm ở `empty-cabin`.
- **Chế độ xe** (CAR MODE): thiết kế lại 4 chế độ Cắm trại / Bé / Thú cưng / Rửa xe với cảnh minh hoạ, thẻ trạng thái lấy từ dữ liệu thật (nhiệt độ, quạt, người/chó/mèo trong khung, giám sát cabin) và danh sách "làm / không làm". Hành vi không đổi: cắm trại dùng Cabin Care; bé chỉ giám sát; thú cưng và rửa xe là mô phỏng; không chế độ nào đóng sự cố.
- Test: tsc sạch, vitest 108/108, build đạt, Chrome thật + backend 37/37.

## 10. Cập nhật 17/10 (khuya): biểu đồ trace, logo Cabin Noir, hành động theo đối tượng
- Logo ngoài cùng trang demo (và favicon) là **Cabin Noir**; logo V trên màn xe giữ nguyên vì đó là giao diện xe.
- Mục **Biểu đồ theo dõi** (gấp, dưới Môi trường giả lập): 5 biểu đồ cho phiên này và cho bản chạy offline model mới trên 3 clip. Không phải độ chính xác. File: `demo/TracePanel.tsx`.
- **CAR MODE** nối Cabin Care thật: Cắm trại (người lớn, chọn nhạc kiểu thẻ Tesla, mở app nhạc), Bé (dỗ bé bằng nhạc ru tự tổng hợp; bài có bản quyền bị khoá), Thú cưng (màn hình đỗ xe theo Tesla có tên và nhiệt độ, giữ điều hoà). Không chế độ nào đóng sự cố.
- Tài liệu nghiên cứu và đề xuất: `docs/vinfast/CABIN_RESPONSE_OPTIONS.md`. Huawei/BYD/Geely: chưa tìm được nguồn công khai, ghi UNVERIFIED.
- Test: tsc sạch, vitest 108/108, build đạt, Chrome thật + backend 46/46.

## 11. HIG lượt 2 (17/10)
Mọi gap, padding, bo góc trên 22 màn về thang 4/8/12/16/20/24 (`vinfast.css` khối v15); % và °C viết liền, km và km/h có cách. Kiểm bằng script trong `apps/cockpit-web/e2e-browser/vinfast/` (audit thang, góc đồng tâm, icon bị bóp). Ảnh trước/sau: `docs/vinfast/hig-v15/`. Smoke 15/15, vitest 108/108.
