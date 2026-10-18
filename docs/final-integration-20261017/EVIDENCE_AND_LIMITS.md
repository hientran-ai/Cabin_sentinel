# Bằng chứng và giới hạn — CabinSentinel

Ngày kiểm tra: 18/10/2026. TASK_ID: POST-DEPLOY-EVIDENCE-20261018. OWNER: TEST_AGENT.

Live web: https://c4-app-068.cabinsentinel-platform.workers.dev · Backend: https://khanh3636-backend-p068.hf.space.

**RELEASE_READINESS.md vẫn NO-GO.** Kết quả dưới đây là bằng chứng demo có giới hạn; không phải xác nhận an toàn, độ chính xác hay sẵn sàng production.

## Phân biệt bằng chứng

| Đo thật | Mô phỏng | Cần phần cứng thật |
|---|---|---|
| Chrome trên Mac tải, giải mã 8 clip và gửi ảnh tới YOLOv8n + age router live; phản hồi inference từng khung được ghi bên dưới. | Nhiệt độ, radar, ignition, HVAC, nguồn và các trạng thái xe của kịch bản demo. | Camera/radar/cảm biến nhiệt và nguồn trên xe thực; điều kiện cabin thực tế. |
| GET /health: vision=ready; privacy_model.available=true; age_classifier.available=true, reason=null, role=EVIDENCE_ONLY. Đây là snapshot, không bảo đảm uptime. | Action/điều hoà/thông báo trong demo là **SIMULATED**; không phải actuator hay giao nhận SMS/push thật. | Chưa thử trên **VF8/VF9, iPhone hay Pi 5 thật**. Số hiệu năng Pi 5 là **ước lượng từ đo trên Mac**, không phải benchmark Pi 5. |
| Spec âm thanh chạy trên bản web live: bật ambient qua UI (aria-pressed=true), đưa state sang CRITICAL và thấy aria-pressed=false. Ca riêng: 1 PASS. | State SAFE/Care/CRITICAL của ca âm thanh là API fixture; browser headless dùng âm thanh WebAudio, không xác minh bằng tai/loa xe. | Loa/ECU/adapter OEM, quyền điều khiển, tình huống khẩn cấp và kết quả actuator thực. |
| Full integration: **20 PASS, 1 FAIL**, 0 skipped (4,5 phút), exit 1; ca âm thanh PASS cả trong suite. | Một phần suite dùng API fixture; test pass không biến fixture thành dữ liệu cảm biến thật. | Chưa có hardware verification hay safety validation. |

Tuổi chỉ là **bằng chứng phụ**, không đổi mức rủi ro. SR-01: không phát hiện không có nghĩa cabin trống; UNKNOWN không đồng nghĩa SAFE. Không nhận diện khuôn mặt; phát hiện vùng mặt chỉ để che ảnh.

## Nhãn tuổi — đo live, không gán nhãn giả

Phương pháp: Chrome (`channel=chrome`, cùng browser của `--project=chrome`), viewport 1366×768. Ngoài lượt chạy spec 8 clip, mở riêng từng clip live, tắt loop và chờ ENDED; thu mọi POST `/observations` response trong một lượt phát đầy đủ khoảng 10 giây, rồi đợi 2 giây cho phản hồi cuối. Số khung là số phản hồi inference nhận được, không phải toàn bộ frame của video. Tất cả 79 phản hồi accepted=true, age_classifier.status=ok. Không thay threshold. Snapshot trong spec không được dùng thay cho phép đếm cả lượt.

| Clip | Số khung có detection / khung đo | Nhãn tuổi trả về (số detection, không phải số người duy nhất) | Đo thật / mô phỏng |
|---|---:|---|---|
| DEMO-01 | 8/10 | person: unknown ×8 | Inference đo thật; xe/action SIMULATED |
| DEMO-02 | 0/10 | Không có detection; không có nhãn tuổi | Inference đo thật; xe/action SIMULATED |
| DEMO-03 | 0/10 | Không có detection; không có nhãn tuổi | Inference đo thật; xe/action SIMULATED |
| DEMO-04 | 6/10 | person: child ×2; person: unknown ×7 | Inference đo thật; xe/action SIMULATED |
| DEMO-05 | 9/9 | person: child ×10 | Inference đo thật; xe/action SIMULATED |
| DEMO-06 | 10/10 | person: child ×20; person: unknown ×5; dog: không áp dụng ×3; cat: không áp dụng ×2 | Inference đo thật; xe/action SIMULATED |
| DEMO-07 | 10/10 | person: unknown ×20; person: child ×12 | Inference đo thật; xe/action SIMULATED |
| DEMO-08 | 3/10 | person: unknown ×3 | Inference đo thật; xe/action SIMULATED |

**DEMO-05 (clip được mô tả có trẻ phía sau):** detector trả `person` ở 9/9 khung; tổng 10 detection người, tất cả `age_group=child`. Đây là kết quả model, không phải ground truth đã kiểm định. Chưa xác minh bbox theo ghế để chứng minh mỗi detection đúng là trẻ ghế sau. Không đồng nhất generic person detection với child detection đã được đánh giá.

**Giới hạn 0/21:** phép đo lịch sử trong `docs/IN_CABIN_SETUP_AND_FINETUNE.md` ghi YOLOv8n bỏ sót trẻ ghế sau (0/21 khung ở bộ mẫu đó). Không chạy lại bộ 21 khung này trong audit hiện tại. Đây là bộ mẫu khác với lượt DEMO-05 ở trên; kết quả 9/9 hiện tại không xoá hay khắc phục giới hạn 0/21. Age router không thể phân loại người mà detector bỏ sót.

Không thấy nhãn `adult` trong lượt đo này. Các nhãn `child`/`unknown` chưa được đối chiếu ground truth, nên không suy ra độ chính xác hay số trẻ thật.

### Danh sách detection từng khung

Mỗi dòng giữ media time, frame ID và toàn bộ detection dưới dạng `class / age_group / confidence`. `—` nghĩa là danh sách rỗng; `N/A` nghĩa không có nhãn tuổi. Không phải dữ liệu mô phỏng. Bbox/ảnh không được đưa vào Git để giảm dữ liệu ảnh lưu trữ.

#### DEMO-01

| media time (s) | frame_id | Detections: class / age_group / confidence |
|---:|---|---|
| 0.4394 | 854c4a20-r2-1-mvdt1fl3 | person / unknown / 0.6355 |
| 1.437444 | 854c4a20-r2-2-mvdt1gco | person / unknown / 0.7306 |
| 2.440061 | 854c4a20-r2-3-mvdt1h4h | person / unknown / 0.7105 |
| 3.441187 | 854c4a20-r2-4-mvdt1hw8 | person / unknown / 0.7347 |
| 4.439721 | 854c4a20-r2-5-mvdt1io4 | person / unknown / 0.6037 |
| 5.441739 | 854c4a20-r2-6-mvdt1jfs | person / unknown / 0.7071 |
| 6.440737 | 854c4a20-r2-7-mvdt1k7s | — |
| 7.439574 | 854c4a20-r2-8-mvdt1kzd | — |
| 8.443253 | 854c4a20-r2-9-mvdt1lr5 | person / unknown / 0.5626 |
| 9.441203 | 854c4a20-r2-10-mvdt1mj4 | person / unknown / 0.7333 |

#### DEMO-02

| media time (s) | frame_id | Detections: class / age_group / confidence |
|---:|---|---|
| 0.841488 | a36ef40c-r2-1-mvdt1rbu | — |
| 1.845147 | a36ef40c-r2-2-mvdt1s3m | — |
| 2.845979 | a36ef40c-r2-3-mvdt1svj | — |
| 3.840708 | a36ef40c-r2-4-mvdt1tn6 | — |
| 4.843411 | a36ef40c-r2-5-mvdt1uez | — |
| 5.841615 | a36ef40c-r2-6-mvdt1v6q | — |
| 6.84145 | a36ef40c-r2-7-mvdt1vyi | — |
| 7.8021 | a36ef40c-r2-8-mvdt1ws8 | — |
| 8.802665 | a36ef40c-r2-9-mvdt1xi1 | — |
| 9.803315 | a36ef40c-r2-10-mvdt1y9u | — |

#### DEMO-03

| media time (s) | frame_id | Detections: class / age_group / confidence |
|---:|---|---|
| 0.862926 | 80367a42-r2-1-mvdt22rh | — |
| 1.860638 | 80367a42-r2-2-mvdt23j7 | — |
| 2.862437 | 80367a42-r2-3-mvdt24az | — |
| 3.859751 | 80367a42-r2-4-mvdt252r | — |
| 4.859429 | 80367a42-r2-5-mvdt25um | — |
| 5.861227 | 80367a42-r2-6-mvdt26mc | — |
| 6.858025 | 80367a42-r2-7-mvdt27e3 | — |
| 7.861033 | 80367a42-r2-8-mvdt285v | — |
| 8.86271 | 80367a42-r2-9-mvdt28xt | — |
| 9.860671 | 80367a42-r2-10-mvdt29pf | — |

#### DEMO-04

| media time (s) | frame_id | Detections: class / age_group / confidence |
|---:|---|---|
| 0.858104 | ab7d3fab-r2-1-mvdt2dmz | — |
| 1.860106 | ab7d3fab-r2-2-mvdt2eeq | — |
| 2.861023 | ab7d3fab-r2-3-mvdt2f6k | person / child / 0.5691; person / unknown / 0.3196 |
| 3.860967 | ab7d3fab-r2-4-mvdt2fyb | person / unknown / 0.3381 |
| 4.860073 | ab7d3fab-r2-5-mvdt2gq3 | person / unknown / 0.3565; person / unknown / 0.3021 |
| 5.862737 | ab7d3fab-r2-6-mvdt2hhv | — |
| 6.902244 | ab7d3fab-r2-7-mvdt2ibz | person / unknown / 0.636 |
| 7.860139 | ab7d3fab-r2-8-mvdt2j1e | person / unknown / 0.6683 |
| 8.862302 | ab7d3fab-r2-9-mvdt2jto | — |
| 9.861914 | ab7d3fab-r2-10-mvdt2kkz | person / unknown / 0.6208; person / child / 0.2979 |

#### DEMO-05

| media time (s) | frame_id | Detections: class / age_group / confidence |
|---:|---|---|
| 0.820081 | c38c2f9f-r2-1-mvdt2q13 | person / child / 0.7521; person / child / 0.2866 |
| 1.800057 | c38c2f9f-r2-2-mvdt2qzh | person / child / 0.7671 |
| 3.760118 | c38c2f9f-r2-3-mvdt2sce | person / child / 0.8351 |
| 4.756557 | c38c2f9f-r2-4-mvdt2t46 | person / child / 0.8309 |
| 5.759758 | c38c2f9f-r2-5-mvdt2tvy | person / child / 0.7567 |
| 6.760644 | c38c2f9f-r2-6-mvdt2unt | person / child / 0.8281 |
| 7.758518 | c38c2f9f-r2-7-mvdt2vfk | person / child / 0.8366 |
| 8.756377 | c38c2f9f-r2-8-mvdt2w7a | person / child / 0.7804 |
| 9.757681 | c38c2f9f-r2-9-mvdt2wz1 | person / child / 0.6775 |

#### DEMO-06

| media time (s) | frame_id | Detections: class / age_group / confidence |
|---:|---|---|
| 0.85458 | fcbac471-r2-1-mvdt315t | person / child / 0.8806; person / child / 0.5837 |
| 1.852709 | fcbac471-r2-2-mvdt31xl | person / child / 0.8871; person / child / 0.5213 |
| 2.85574 | fcbac471-r2-3-mvdt32pd | person / unknown / 0.5374; person / child / 0.494; person / child / 0.3977 |
| 3.852116 | fcbac471-r2-4-mvdt33h4 | person / unknown / 0.8017; person / child / 0.3741; person / child / 0.3106; person / unknown / 0.2976 |
| 4.852018 | fcbac471-r2-5-mvdt348x | person / child / 0.6687; person / child / 0.4026; person / child / 0.2926 |
| 5.849895 | fcbac471-r2-6-mvdt350p | person / unknown / 0.7302 |
| 6.85557 | fcbac471-r2-7-mvdt35sh | person / unknown / 0.6314; person / child / 0.485; person / child / 0.3422 |
| 7.852772 | fcbac471-r2-8-mvdt36kh | person / child / 0.7486; person / child / 0.4759; dog / N/A / 0.3096 |
| 8.85228 | fcbac471-r2-9-mvdt37c1 | person / child / 0.7058; dog / N/A / 0.3154; person / child / 0.2994; cat / N/A / 0.2725 |
| 9.851759 | fcbac471-r2-10-mvdt383t | person / child / 0.7463; cat / N/A / 0.6223; person / child / 0.4545; dog / N/A / 0.4464; person / child / 0.3197 |

#### DEMO-07

| media time (s) | frame_id | Detections: class / age_group / confidence |
|---:|---|---|
| 0.831602 | acdf9120-r2-1-mvdt3c6d | person / unknown / 0.68; person / child / 0.5891; person / child / 0.2594 |
| 1.833051 | acdf9120-r2-2-mvdt3cy2 | person / unknown / 0.6562; person / child / 0.5804; person / unknown / 0.3822; person / unknown / 0.3243 |
| 2.831113 | acdf9120-r2-3-mvdt3dpv | person / unknown / 0.6391; person / child / 0.4409; person / unknown / 0.4392 |
| 3.834237 | acdf9120-r2-4-mvdt3ehn | person / unknown / 0.7332; person / child / 0.4454; person / unknown / 0.3268 |
| 4.830694 | acdf9120-r2-5-mvdt3f9f | person / unknown / 0.6077; person / unknown / 0.5172; person / unknown / 0.3614 |
| 5.831477 | acdf9120-r2-6-mvdt3g19 | person / unknown / 0.6987; person / unknown / 0.5871; person / child / 0.5376; person / unknown / 0.4774 |
| 6.830643 | acdf9120-r2-7-mvdt3gt9 | person / child / 0.6292; person / child / 0.5864 |
| 7.830548 | acdf9120-r2-8-mvdt3hks | person / unknown / 0.6403; person / child / 0.5464; person / unknown / 0.441 |
| 8.83287 | acdf9120-r2-9-mvdt3ico | person / unknown / 0.6251; person / child / 0.4287; person / unknown / 0.3416 |
| 9.831939 | acdf9120-r2-10-mvdt3j49 | person / unknown / 0.764; person / child / 0.398; person / unknown / 0.353; person / child / 0.3188 |

#### DEMO-08

| media time (s) | frame_id | Detections: class / age_group / confidence |
|---:|---|---|
| 0.865675 | cc59cf05-r2-1-mvdt3nc1 | person / unknown / 0.7303 |
| 1.86634 | cc59cf05-r2-2-mvdt3o3r | person / unknown / 0.9247 |
| 2.866071 | cc59cf05-r2-3-mvdt3ovj | person / unknown / 0.9209 |
| 3.866838 | cc59cf05-r2-4-mvdt3pnc | — |
| 4.864118 | cc59cf05-r2-5-mvdt3qf4 | — |
| 5.863362 | cc59cf05-r2-6-mvdt3r6y | — |
| 6.863837 | cc59cf05-r2-7-mvdt3ryo | — |
| 7.863508 | cc59cf05-r2-8-mvdt3sqf | — |
| 8.864174 | cc59cf05-r2-9-mvdt3tik | — |
| 9.862528 | cc59cf05-r2-10-mvdt3ua0 | — |

## Mô hình, privacy và lỗi mở

- Theo thông tin chủ dự án cung cấp cho checkpoint này, router train bằng khoảng **25 crop thật**, nhãn do **visual review**; **độ chính xác chưa được chứng minh**. Audit này không chạy evaluation trên tập ground truth độc lập và không xác minh lại manifest huấn luyện. Nguồn gốc gồm **SVIRO (CC BY-NC-SA 4.0), chỉ dùng phi thương mại**; SVIRO gồm ảnh cabin tổng hợp, không nên hiểu mọi ảnh nguồn đều là ảnh người thật. USER DECISION: chủ dự án nhận trách nhiệm license cho demo phi thương mại của cuộc thi; quyết định này không phải chứng nhận quyền sử dụng do audit cấp.
- Router live báo checkpoint SHA256 `4c71685b8522e781de7b7b370c05c41ddeadb8819af34cfd81bda12a388e3ce2`. Backend commit `0099ffc` là bối cảnh do user cung cấp; /health không tự chứng minh Git commit đang chạy. YOLOv8n SHA256 `f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36`.
- Bộ che mặt **có thể sót** vùng mặt. Khi backend không che được, giao diện làm mờ/pixelate **toàn khung**. `privacy_model.available=true` không chứng minh mọi mặt đã được che; không có đánh giá recall privacy trong lượt này.
- **5 nhóm bug vẫn mở** theo audit trước: BUG-012 (tile safety dưới fold 1366×768), BUG-016/025 (axe color-contrast/nested-interactive), BUG-018 (focus không chuyển vào panel), BUG-020 (reset nhanh tạo nhiều session), BUG-031 (Escape không đóng Sạc/EV). Không chạy lại audit `tests/` trong checkpoint này; kết quả trước là 41 pass +5 expected-fail, không phải 46 assertion pass. Owner FRONTEND_AGENT; bước tiếp theo: sửa theo task riêng rồi regression.
- **Lỗi mới quan sát, chưa sửa:** DEMO-04 trong `integration/eight-clips.spec.ts:20` lỗi `Cannot read properties of null (reading 'model')` khi đọc `s.state.model`, kèm timeout 90 giây. Lặp lại ở lượt 8 clip riêng (7 PASS/1 FAIL) và full integration (20 PASS/1 FAIL). Phép thu inference độc lập vẫn nhận 10 phản hồi DEMO-04; điều đó không biến spec fail thành pass. Nguyên nhân state null chưa xác minh; owner TEST_AGENT điều tra đồng bộ state/polling và phân loại nguyên nhân, không tự kết luận lỗi sản phẩm hay môi trường. Không nới assertion, không sửa spec DEMO-04 trong task này.
- Không deploy/push/PR; không sửa code sản phẩm, không đồng bộ sang P-068. Chỉ spec âm thanh và trang này thuộc local commit. AI log cập nhật ngoài commit.

## Tái lập và handoff

Từ `qa/vinfast-cockpit-audit`, dùng `BASE_URL=https://c4-app-068.cabinsentinel-platform.workers.dev`:

```bash
npx playwright test -c playwright.integration.config.ts --project=chrome integration/eight-clips.spec.ts
npx playwright test -c playwright.integration.config.ts --project=chrome integration/recovery.spec.ts -g 'critical state interrupts' --output=/private/tmp/cs-postdeploy-audio --reporter=list
npx playwright test -c playwright.integration.config.ts --project=chrome --output=/private/tmp/cs-postdeploy-integration --reporter=list
```

Bằng chứng thô cục bộ không commit: `/private/tmp/cs-postdeploy-age-frames.json` (toàn bộ inference reply), `/private/tmp/cs-postdeploy-health.json`, output Playwright trong `/private/tmp/cs-postdeploy-*`. Các file tạm có thể mất khi dọn máy; bảng từng khung ở trên là bản lưu trong Git.

RULE-26: đã thử đọc https://phoenix.note.transformerlabs.ai/dashboard?cohort=cohort-4 và https://phoenix.note.transformerlabs.ai/demo-day ngày 18/10/2026; công cụ không truy cập được. Rubric/form BTC hiện hành **UNVERIFIED**; owner PO cung cấp bằng chứng truy cập mới nhất. Không tuyên bố READY_TO_SUBMIT; checklist 10 deliverables là nội bộ.

AGENT_HANDOFF: TEST_AGENT bàn giao spec âm thanh và evidence đo live; VISION_AGENT sở hữu đánh giá detection/age/privacy bằng ground truth; FRONTEND_AGENT sở hữu bug UI; PO sở hữu license và requirement BTC. User decisions: chỉ audit live, sửa spec, lập trang giới hạn và commit local đúng hai file. Không tạo safety policy mới. Runtime verified chỉ cho các flow/assertion đã chạy; hardware/safety validated: NOT_VERIFIED.
