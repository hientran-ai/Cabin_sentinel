# Kịch bản trình bày CabinSentinel — 12 slide

Thời lượng mục tiêu: 10–12 phút, chưa gồm demo và Q&A.

## Slide 1 — CabinSentinel là gì? (30 giây)

**Trên slide**

- Cabin safety monitoring
- Edge-first, human-in-the-loop
- Technical integration baseline

**Lời nói gợi ý**

“CabinSentinel hỗ trợ phát hiện người hoặc vật nuôi bị bỏ quên trong cabin và điều phối phản ứng an toàn. Điểm quan trọng là AI chỉ cung cấp bằng chứng; quyết định rủi ro đến từ safety rules có thể kiểm thử. Hôm nay em xin review kiến trúc, độ tin cậy của flow và thứ tự ưu tiên kỹ thuật tiếp theo.”

## Slide 2 — Bài toán thật sự (45 giây)

**Trên slide**

- Cabin nóng lên nhanh khi xe tắt máy.
- Camera có thể bỏ sót, bị che hoặc trả dữ liệu cũ.
- Một false negative có thể nguy hiểm hơn một cảnh báo thừa.

**Điểm cần nhấn**

Không định nghĩa bài toán là “object detection”, mà là “ra quyết định an toàn dưới dữ liệu không đầy đủ”.

## Slide 3 — Nguyên tắc thiết kế an toàn (60 giây)

**Trên slide**

1. Missing/stale data không đồng nghĩa cabin trống.
2. Chỉ rules engine tạo risk verdict.
3. Risk cao chưa được giải quyết không bị trạng thái thấp hơn ghi đè tùy tiện.
4. Mọi decision/action/acknowledgement có ID và timestamp.
5. Remote action cần authorization, expiry và device feedback.

**Lời nói gợi ý**

“Các nguyên tắc này là contract quan trọng hơn lựa chọn model. Model có thể thay đổi, nhưng semantics an toàn không được thay đổi âm thầm.”

## Slide 4 — Luồng dữ liệu hiện tại (60 giây)

```text
Sensor JSON ─┐
             ├─> Fusion ─> LangGraph orchestration ─> Safety rules
Vision HTTP ─┘                                      │
                                                    ▼
                                      SQLite state/events/actions
                                                    │
                              Cabin Noir + Operations Web
```

**Điểm cần nói đúng**

- LangGraph orchestration không thay thế rules engine.
- Không có LLM trong safety decision path.
- Timer kiểm tra stale sources kể cả khi không có input mới.

## Slide 5 — Kiến trúc đích V2 (60 giây)

**Trên slide**

| Safety Plane — Edge | Product Plane — Cloud |
|---|---|
| Perception, fusion, rules | Identity, ownership, read models |
| Local incident/action | Notifications, operations, analytics |
| Hoạt động khi offline | Đồng bộ và quản trị |

**Lời nói gợi ý**

“Hiện demo còn chạy nhiều thành phần trong một process. Kiến trúc đích tách Safety Plane ra edge để Internet hoặc cloud outage không chặn detection và local action. Cloud backend bắt đầu là modular monolith, chưa cần microservices.”

## Slide 6 — Hai trải nghiệm sản phẩm (45 giây)

**Cabin Noir**

- Owner/caregiver.
- Theo dõi trạng thái cabin và incident.
- Camera/live flow và acknowledgement.

**Operations Web**

- Admin/operator.
- Incident queue, command lifecycle, fleet/device.
- Users/tenants, audit, model/rules registry, system health.

## Slide 7 — Admin/Operations flow (60 giây)

```text
Login → backend verifies role → Operations portal
  ├─ Overview: fleet + incidents + commands + health
  ├─ Triage: assign → investigate → escalate/hold
  ├─ Response: horn/SMS/unlock request
  ├─ Resolution: physical check → resolve
  └─ Governance: device/user/model/rules/audit/system
```

Backend kiểm tra token, role, tenant scope và permission trên từng API. UI chỉ lọc navigation; backend là nguồn quyết định quyền cuối cùng.

## Slide 8 — AI/Vision hiện tại (60 giây)

**Trên slide**

- YOLO detector: bằng chứng `person`, `dog`, `cat`.
- YOLO26n nhẹ hơn YOLOv8n khoảng 24% theo artifact hiện đo.
- Reference-image comparison giúp xử lý một số ca detector bỏ sót trong pipeline nghiên cứu/Pi.
- Age-router checkpoint chính thức còn thiếu và chưa nối vào risk flow.

**Không được nói**

- “Nhận diện trẻ em chính xác.”
- “Đã đạt chuẩn safety.”
- “Đã benchmark trên Pi 5 thật.”

## Slide 9 — Demo scenario (45 giây giới thiệu)

Scenario đề xuất:

1. Người dùng/camera gửi bằng chứng có người trong cabin.
2. Sensor cho biết xe tắt, khóa cửa và nhiệt độ cao.
3. Backend tạo `HOT_OCCUPANT / CRITICAL`.
4. Operations nhận incident, assign, ghi chú và yêu cầu phản ứng.
5. Thể hiện command lifecycle và audit trail.

Chèn nhãn rõ: telemetry simulated; horn/SMS simulated; unlock pending confirmation.

## Slide 10 — Quality evidence (45 giây)

**Kết quả kiểm tra ngày 14/10/2026**

- Backend: 303 passed, 17 skipped, 2 subtests passed.
- Frontend/worker: 27 passed.
- TypeScript typecheck: passed.
- Ruff: passed.
- Production web build: passed.
- Docker CI có smoke test: non-root, CPU-only, degraded health trung thực khi thiếu weights.

Nói thêm: full-root pytest discovery còn collision giữa test packages; CI chính không bị ảnh hưởng nhưng monorepo test ergonomics cần sửa.

## Slide 11 — Rủi ro và khoảng trống (75 giây)

| Rủi ro | Hiện trạng | Bước tiếp theo |
|---|---|---|
| Bỏ sót trẻ ghế sau | Cả YOLOv8n/YOLO26n có ca 0/21 | Dataset cabin + finetune + fallback |
| Pi 5 performance | Mới có ước lượng | Đo p50/p95, nhiệt, RAM, throttling |
| Physical actions | Simulated/pending | Signed command + device ack contract |
| Rules/model rollout | Registry chưa điều khiển runtime | Signed config + staged apply/rollback |
| Privacy | Có blur/redaction thử nghiệm | Threat model + retention + verification |
| Test topology | Root collection collision | Tách pytest config/workspace |

**Lời nói gợi ý**

“Em muốn mentor review chính những khoảng trống này. Em không coi việc UI chạy được hoặc một vài ảnh detect đúng là bằng chứng safety readiness.”

## Slide 12 — Quyết định cần mentor review (60 giây)

**Ba quyết định ưu tiên**

1. Có nên chốt reference-image fallback thành một phần của Safety Plane trước khi finetune?
2. Evaluation gate tối thiểu nào phải đạt trước pilot: recall theo vị trí ghế, stale/fault scenarios, hay hardware latency?
3. Sprint tiếp theo nên tối ưu theo thứ tự nào: model evidence → Pi runtime → device feedback → cloud product?

**Câu kết**

“Mục tiêu của buổi review không phải xác nhận demo đẹp, mà là giúp đội chốt ranh giới an toàn và bằng chứng kỹ thuật cần có cho bước tiếp theo.”

## Phụ lục — Trả lời nhanh các câu hỏi dễ gặp

### Vì sao không để LLM quyết định?

Safety decision cần deterministic, versioned, replayable và hoạt động offline. LLM có thể hỗ trợ giải thích hoặc vận hành sau này, nhưng không được tạo hoặc hạ risk verdict.

### Vì sao không dùng microservices ngay?

Quy mô đội và tải hiện tại chưa bù được chi phí vận hành. Modular monolith với boundary rõ cho phép tách service sau khi có nhu cầu đo được.

### Tại sao cần radar/reference image nếu đã có camera?

Detector có false negative. Tín hiệu bổ sung không đảm bảo tuyệt đối nhưng giúp không biến “không detect thấy” thành “chắc chắn cabin trống”.

### Sản phẩm đã sẵn sàng triển khai chưa?

Chưa. Đây là technical integration baseline. Còn thiếu model validation đại diện, Pi 5 measurement, physical device contract, real notification/action adapters và các kiểm thử fault/recovery trên target hardware.

### Điểm mạnh hiện tại là gì?

Safety semantics tương đối rõ, backend-authoritative flow, auditability, fail-closed health behavior, separation giữa evidence và verdict, cùng nền test/CI đủ tốt để tiếp tục cải tiến có kiểm soát.

