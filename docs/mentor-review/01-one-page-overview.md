# CabinSentinel — One-page project overview

## 1. Bài toán

Trẻ nhỏ, người dễ tổn thương hoặc vật nuôi có thể bị bỏ quên trong cabin, đặc biệt nguy hiểm khi xe tắt máy, cửa khóa và nhiệt độ tăng. Một camera đơn lẻ hoặc một lần inference không đủ tin cậy cho bài toán an toàn: dữ liệu có thể cũ, camera có thể bị che và detector có thể bỏ sót.

## 2. Giải pháp đang xây dựng

CabinSentinel kết hợp:

- camera/AI Vision để tạo bằng chứng `person`, `dog`, `cat`;
- tín hiệu xe như nhiệt độ, ignition, cửa khóa và radar;
- bộ safety rules xác định `SAFE`, `NOTICE`, `WARNING`, `CRITICAL` hoặc `ERROR`;
- incident lifecycle, audit trail và Operations portal để con người điều phối;
- Cabin Noir cho owner/caregiver theo dõi và xác nhận sự cố.

Nguyên tắc cốt lõi: AI không tự ra quyết định an toàn; UI không tự suy diễn; backend/edge rules là nguồn quyết định duy nhất. Thiếu hoặc stale data không được coi là bằng chứng cabin trống.

## 3. Kiến trúc

```text
Camera + vehicle sensors
          │
          ▼
Perception / adapters
          │ evidence + freshness
          ▼
Fusion → deterministic rules → incident/action intent
          │
          ├── Local persistence and audit
          ├── Owner/Caregiver experience (Cabin Noir)
          └── Admin/Operations portal
```

Định hướng V2 là **edge-first, cloud-assisted**:

- Safety Plane trên xe chịu trách nhiệm perception, fusion, rules và local actions, kể cả khi mất Internet.
- Product Plane trên cloud chịu trách nhiệm identity, ownership, notifications, operations, analytics và audit.
- Cloud có thể phản chiếu quyết định từ edge nhưng không được hạ mức hoặc ghi đè quyết định an toàn tại edge.

## 4. Phần đã có

- FastAPI backend với ingestion sensor/vision, fusion, deterministic rules, state/event persistence và incident lifecycle.
- Operations portal cho admin/operator: overview, incident queue, evaluation stream, command lifecycle, fleet/device, user/tenant, model/rules registry, audit và system health.
- Auth có access token ngắn hạn, refresh-token rotation, CSRF protection, tenant scope và RBAC backend.
- Cabin Noir cho owner/caregiver, gồm mobile web/iOS và luồng theo dõi cabin.
- Vision pipeline, model inventory/checksum, offline research tools và benchmark YOLOv8n/YOLO26n.
- CI kiểm tra frontend, backend, Docker build và container smoke test.

## 5. Bằng chứng hiện tại

- Backend: 303 tests passed; 17 skipped; 2 subtests passed.
- Frontend/worker: 27 tests passed.
- Typecheck, Ruff và production web build đều passed ngày 14/10/2026.
- Benchmark hiện có cho latency và video mẫu; kết quả được ghi rõ là đo trên Mac hoặc ước lượng Pi 5, chưa phải số đo trên Pi thật.
- Health endpoint fail closed khi model Vision không sẵn sàng.

## 6. Điều chưa được phép tuyên bố

- Chưa chứng minh độ chính xác phát hiện trẻ em đạt chuẩn an toàn.
- Detector hiện vẫn có ca bỏ sót trẻ ở ghế sau; YOLO26n không tự giải quyết được ca này.
- Chưa có benchmark thật trên Raspberry Pi 5 về p95 latency, nhiệt độ, RAM và throttling.
- Horn, SMS và notification hiện là simulated; unlock chỉ là pending/human-confirmed workflow, không điều khiển xe thật.
- Ruleset registry chưa hot-apply vào safety engine; model rollout registry chưa hot-swap model runtime.
- Age-router checkpoint thật còn thiếu; age inference research chưa tham gia quyết định REST/risk chính thức.
- Full monorepo pytest discovery còn xung đột namespace giữa hai test tree.

## 7. Giá trị khác biệt

Điểm mạnh không nằm ở việc “chạy một model nhận diện”, mà ở cách hệ thống quản lý bất định và lỗi:

- tách perception evidence khỏi safety verdict;
- stale/missing signal trở thành trạng thái không xác minh được, không tự động thành safe;
- incident và action có revision, trạng thái và audit trail;
- hướng tới vận hành offline tại edge thay vì phụ thuộc cloud;
- giữ con người trong vòng lặp đối với thao tác rủi ro cao.

## 8. Review mong muốn từ mentor

1. Ranh giới Safety Plane/Product Plane đã đủ rõ và thực tế chưa?
2. Trước khi finetune model, nên ưu tiên dataset/evaluation protocol hay hoàn thiện reference-image fallback?
3. Bộ safety invariants và state transitions còn thiếu failure mode nào?
4. Mức bằng chứng nào là đủ để chuyển từ technical demo sang pilot trên phần cứng?
5. Trong 2–3 tuần tới nên ưu tiên Pi 5 validation, model recall, hay end-to-end device contract?

