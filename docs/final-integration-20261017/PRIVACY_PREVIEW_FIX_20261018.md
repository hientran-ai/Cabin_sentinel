# Sửa preview che mặt — bằng chứng 18/10/2026

TASK_ID: PRIVACY-PREVIEW-20261018 · OWNER: REVIEW_AGENT. Worktree `final-demo-integration-20261017`, branch `codex/final-demo-integration-20261017`; base thực tế `15a77f4` sau `0099ffc`. Không reset về HEAD cũ user nhắc.

## Nguyên nhân gốc — VERIFIED FACT

Cùng frame DEMO-05 `child-hot.mp4` tại 2 giây, resize 640×360, encode JPEG trong RAM rồi POST **`/api/v1/e2e/sessions/{id}/observations`** (số nhiều, đúng route đang chạy). Không ghi ảnh gốc ra đĩa; phiên probe được DELETE sau đo. Đã đo trực tiếp HF và local HTTP, không suy từ health.

| Nơi đo | HTTP / accepted | preview.status | method | detected_faces / masked_regions | data_url |
|---|---|---|---|---|---|
| HF live trước sửa | 200 / true | **không có preview** | không có | không có | không có |
| Local 8012 trước sửa | 200 / true | **không có preview** | không có | không có | không có |
| Local 8012 sau sửa | 200 / true | PROCESSED | YUNET_SOFT_OVAL | **1 / 1** | có, ảnh đã xử lý |
| HF live đo lại sau local patch | 200 / true | **vẫn không có preview** | không có | không có | không có; chưa deploy |

Ở cả live/local trước sửa, detector trả bbox người khoảng `[209.92,141.52,306.70,344.35]`, confidence 0.7705. Live có age=child; local không cấu hình age nên unknown. Không điều chỉnh model/threshold để tạo kết quả.

`services/api/src/main.py` chọn **TamVisionProvider** cho MODEL_PATH YOLOv8n; `infer()` trước sửa chỉ trả detections/age/timings, không khởi tạo hay gọi FacePreview. `e2e_api.py` chỉ chuyển `frame.preview` vào response khi provider có field đó. Provider P068VisionProvider khác có preview nhưng không phải provider của mẫu live này. Health privacy chỉ kiểm tra pinned artifact và API OpenCV, không xác minh preview đang được gọi trên tuyến REST. Vì thiếu preview, `capture.ts` luôn gọi obscure() toàn khung. Gradio `routing.py` chuyển nguyên API sang FastAPI; không có bước strip preview. Đây là thiếu nối provider REST, **không có bằng chứng lỗi load YuNet, ZeroGPU, giới hạn ảnh hay timeout gây ca này**. YuNet local thật chạy được sau nối, đo preview latency khoảng16.67ms cho frame probe (đo trên Mac, không phải Pi/xe).

Metadata/health đo trực tiếp lưu tại `/private/tmp/cs-privacy-20261018/{live,local}-{before,after}.json`, không lưu ảnh gốc/data_url vào các file probe này. Trạng thái snapshot không bảo đảm uptime.

## Thay đổi và contract

- TamVisionProvider khởi tạo pinned FacePreview; suy luận detector/age dùng ảnh gốc trong RAM trước che. YuNet chạy trên bản sao dùng cho display. Không thay weights, class, ngưỡng, rules, risk, action, schema persistence hay endpoint.
- FacePreview REST nhận detections; YuNet che oval như ảnh tham khảo user gửi. Với mỗi person/pet chưa có mặt YuNet trong vùng đầu, che hộp đặc top40% bbox, padding15% mỗi cạnh vùng đầu, clip trong ảnh. Reset history ở mỗi REST frame để không dùng mask của session khác. Camera session cũ giữ cách gọi/historical tracking riêng.
- Không có detection, bbox thiếu/sai/outside-frame: backend tạo full-frame pixelated preview. Bộ che lỗi/không load/encode lỗi: provider trả UNAVAILABLE, không data_url ảnh gốc.
- Frontend nhận preview JPEG có ít nhất một mask; zero masks không được coi là ảnh an toàn. Không có preview hợp lệ: tự che đầu mọi living detection bằng hộp đặc cùng công thức; chỉ full-frame obscure khi thiếu vùng hợp lệ. Không thể tạo ảnh processed thì clear thumb, không đưa blob gốc vào UI.
- Metadata **optional/additive**: `fallback_regions`, `coverage_verified=false`; method có thể là YUNET_SOFT_OVAL, YUNET_HEAD_FALLBACK, FULL_FRAME_FALLBACK. Existing status/data_url contract giữ nguyên; client cũ vẫn nhận ảnh processed, client mới chấp nhận backend cũ thiếu preview. Không có dữ liệu ảnh mới trong replay/audit/state persistent.
- ThumbInfo phân biệt YUNET / HEAD / FULL. Chip tương ứng “Đã che mặt bằng YuNet (N vùng)”, “Đã che vùng đầu theo khung phát hiện”, “Làm mờ toàn khung (không có vùng để che)”; tất cả kèm **“chưa đảm bảo che hết”**. Cùng object URL processed được CabinMonitor và `PhoneFrame.latestFrame` dùng; e2e-bridge.js không tạo ảnh khác.
- Spec 8 clip chờ state/observation khớp thumb trước snapshot (tránh đọc state=null sau source reset), giữ nguyên assertion risk/model/source. Spec điện thoại chờ frame thật trước pause, rồi so sánh SHA256 report bytes với shared thumb. Test fallback có fault injection response, không phải bằng chứng model accuracy.

## Before / after — đo Chrome local, đã mở ảnh kiểm bằng mắt

Ảnh gốc của clip không được xuất thêm. Chỉ ảnh UI đã che được lưu làm evidence cục bộ, không commit artifacts.

| Clip | Before: toàn khung mất chi tiết | After: YuNet oval, nền/thân người rõ | Frontend fallback: thiếu preview |
|---|---|---|---|
| DEMO-05 | `/private/tmp/cs-privacy-20261018/DEMO-05-before-frame.png` | `/private/tmp/cs-privacy-20261018/DEMO-05-after-stable-frame.png` | `/private/tmp/cs-privacy-20261018/DEMO-05-fallback-frame.png` |
| DEMO-06 | `/private/tmp/cs-privacy-20261018/DEMO-06-before-frame.png` | `/private/tmp/cs-privacy-20261018/DEMO-06-after-stable-frame.png` | `/private/tmp/cs-privacy-20261018/DEMO-06-fallback-frame.png` |

Bản after/after-boxes khác cũng giữ trong cùng thư mục. Screenshot stable ngừng gửi thêm frame bằng hook source.running=false rồi chờ observation/thumbnail khớp; không can thiệp ảnh, bbox hay risk. **USER DECISION DECISION-20261018-OVAL-MASK-REFERENCE:** ảnh user gửi được dùng làm tiêu chí kiểu che oval, **không** làm bằng chứng YOLO26s đang chạy trên live và không thay model.

Quan sát bằng mắt: mặt người ở DEMO05 và hai mặt người DEMO06 trong mẫu ảnh đã bị che; cabin/ghế/thân người rõ. Nhánh thiếu preview có hộp đầu lớn hơn YuNet như dự kiến. **Không bảo đảm mọi frame/mặt đều được che.** Ví dụ mèo trong một ảnh DEMO06 còn thấy rõ vì detector không trả cat/dog trong frame đó (metadata có person); không gọi đây là che hết thú cưng. Không đổi ngưỡng để che giấu miss. Face/head localization có thể bỏ sót, đặc biệt người/đầu nằm ngoài bbox hay người detector bỏ sót; SR-01 vẫn áp dụng. Đây không phải đánh giá privacy recall trên1000frame hay safety validation.

## Kiểm tra

- TDD: test mới ban đầu fail vì thiếu headMask và preview; sau sửa,9 vitest geometry PASS. Bao gồm nhiều vị trí/person/pet, sát biên, bbox thiếu/sai/NaN, detection rỗng, một trong nhiều detection thiếu box. Expected region không suy từ implementation.
- Cockpit vitest: **193 PASS**, typecheck PASS. Root npm test: **47 PASS** (api-client5, auth12, domain4, operations5, worker21).
- Backend `pytest tests/`: **402 PASS +11 subtests**,16 dependency warnings. Lượt sandbox trước395pass/6fail vì socket bind PermissionError;6ca đó chạy lại có quyền network đều PASS, sau đó full402pass. New REST test chứng minh preview trả đúng lần đầu, không persistence/replay/audit; lỗi bộ che không làm mất detector evidence.
- Backend Ruff cho các file đã sửa PASS; focused privacy/E2E25PASS sau chỉnh import/format test. Backend deploy.sh --dry-run PASS, đóng gói đúng YuNet và source mới, không upload.
- Build web PASS; lint exit0 có warnings; build cảnh báo asset/font và dynamic import hiện có. Không deploy.
- Playwright local: **24/24 PASS**,0 skipped, exit0 (2,3phút), gồm8clip+3privacy-fallback+ảnh điện thoại hash match. Ca ảnh điện thoại chạy riêng sau sửa wait:1PASS, so sánh byte hash thật. Fallback riêng:3PASS sau sửa teardown chờ request (lượt đầu2fail do route.fetch còn chạy khi page đóng, không đổi assertions). Lượt full đầu20PASS/1FAIL do test pause ngay cảnh báo radar trước khi có frame; đã thêm wait cho frame thật trước pause, không sửa product để làm test xanh.

## Compliance / review / handoff

Đã đọc `/Users/mac/AI/P-068/docs/compliance/COMPLIANCE_BASELINE.md` và `/Users/mac/AI/P-068/CLAUDE.local.md` do worktree thiếu hai file này, cùng kiến trúc BUILD_PHASE và workflow safety-change. USER DECISION áp dụng cho task demo: raw ảnh được gửi để suy luận, không xuất/lưu ngoài mục đích đó; không face recognition/matching/embedding. Không tạo policy safety mới. Không mở PR nên chưa có PR checklist§8 để điền; các mục liên quan được lưu tại đây: không đổi ngưỡng/rules/permissions/endpoints; không thêm retention/persistence; ảnh output đã processed nhưng coverage chưa được chứng minh. Ngoại lệ raw-uplink cho demo theo user không được coi là đã đạt baseline DP-01/M-P1 của thiết bị production.

Review bằng cabinsentinel-safety-review: display-only preview không vào normalization/risk; detector/age vẫn lấy ảnh gốc trong RAM; replay không infer/action lại và không lưu preview; source epoch vẫn chặn frame cũ hiển thị sau đổi nguồn; no-detection không dùng làm SAFE. React review: không thêm hook có điều kiện/effect/listener/remote dependency; object URL cũ vẫn revoke khi đổi thumb. Không có claim safety/hardware verified. Release readiness vẫn NO-GO.

RULE26: thử dashboard Cohort4 `https://phoenix.note.transformerlabs.ai/dashboard?cohort=cohort-4` và Demo Day `https://phoenix.note.transformerlabs.ai/demo-day`18/10/2026, tool không truy cập được; rubric/form UNVERIFIED, owner PO. Không READY_TO_SUBMIT.

AGENT_HANDOFF: BACKEND_AGENT / FRONTEND_AGENT triển khai code đã review khi owner cho phép; TEST_AGENT kiểm lại DEMO05/06 trên live sau deploy và ghi screenshot/preview metadata. VISION_AGENT đánh giá privacy/detector recall độc lập; PO sở hữu consent/license/BTC. Phần còn lại: deploy và online verification, hardware/accuracy chưa kiểm. Chỉ BUILD_PHASE source/tests/report và root/worktree AI logs thay đổi; P-068 source checkout không sửa, shared Git metadata thay khi local commit. Không push/PR.

Lệnh còn lại (chưa chạy): backend do user tự chạy từ worktree:

```bash
bash deploy/huggingface/deploy.sh Khanh3636/backend_p068
```

Web đã build; chờ user đồng ý deploy trong chat:

```bash
npm run build:web && npm run deploy:web
```

Sau deploy cần đo lại observations, chụp DEMO05/06 và kiểm cả report phone; không coi local PASS là live verified.
