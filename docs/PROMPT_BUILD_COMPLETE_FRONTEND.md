# Prompt tạo CabinSentinel frontend hoàn chỉnh

Sao chép toàn bộ nội dung trong khối dưới đây để giao cho AI coding agent.

```text
Bạn là Senior Frontend Architect kiêm Product Engineer. Hãy trực tiếp phân tích và triển khai frontend hoàn chỉnh cho CabinSentinel trong repository hiện tại. Không chỉ tạo mockup hoặc một trang đơn lẻ: sản phẩm phải chạy được, có đầy đủ route, luồng người dùng, data layer, trạng thái lỗi và test, đồng thời sẵn sàng kết nối backend thật sau này.

## Bối cảnh cần đọc trước khi code

- Owner Web hiện nằm tại `apps/owner-web/`, chạy local ở port 4173.
- Giao diện tham chiếu chính là `http://localhost:4173/notifications` và source trong `apps/owner-web/src/`.
- Các app liên quan: `apps/operations-web/`, `apps/mobile/` và dashboard demo tại `frontend/`.
- Code dùng chung: `packages/api-client/`, `packages/contracts/`, `packages/domain/`, `packages/design-tokens/`, `packages/test-fixtures/`.
- Đọc kỹ `docs/ARCHITECTURE_V2.md`, `docs/FRONTEND_BACKEND_REQUIREMENTS.md`, `docs/FRONTEND_DEPLOYMENT.md` và toàn bộ code Owner Web hiện có.
- Kiểm tra `git status` và giữ nguyên mọi thay đổi chưa commit của người dùng.

Không viết lại project từ đầu nếu code hiện tại có thể tái sử dụng. Refactor dần thành module rõ ràng và giữ nguyên visual identity đang có.

## Mục tiêu sản phẩm

Xây Owner Web hoàn chỉnh để người sở hữu xe/gia đình có thể:

1. đăng nhập, khôi phục phiên và logout;
2. xem tổng quan trạng thái an toàn của các xe được cấp quyền;
3. theo dõi cabin từng xe;
4. xem danh sách và chi tiết sự kiện/cảnh báo;
5. xác nhận đã kiểm tra cabin hoặc phản hồi incident;
6. theo dõi hành động từ lúc gửi yêu cầu đến khi thiết bị xác nhận;
7. quản lý Push, SMS, Email, giờ yên lặng và liên hệ khẩn cấp;
8. quản lý hồ sơ, ngôn ngữ, quyền riêng tư và shared access;
9. xử lý đầy đủ loading, empty, stale, offline, backend error, hết phiên và không có quyền;
10. có mock/demo mode để phát triển và trình diễn trước khi backend V2 hoàn tất.

Backend luôn là nguồn sự thật cho `riskLevel`, `ruleId`, `reason`, `revision`, `evaluatedAt`, `decisionCurrent`, evidence và action status. Frontend tuyệt đối không tự tính mức rủi ro, không biến missing/stale/error thành SAFE và không báo một hành động vật lý thành công trước khi thiết bị xác nhận.

## Visual direction bắt buộc

Lấy trang `/notifications` hiện tại làm chuẩn. Không đổi sang dark dashboard hoặc admin template chung chung.

- Phong cách ấm, đáng tin cậy, thân thiện với gia đình nhưng nghiêm túc về an toàn.
- Font `Nunito Sans`, fallback `Segoe UI`, system sans-serif.
- Nền cream `#fff9f7`, card `#fffefd`, text `#352c34`, muted `#84737d`.
- Brand rose `#bd5f7f`, rose đậm `#8f3f5d`, rose nhạt `#f9e6ed`.
- SAFE/fresh/connected dùng mint; NOTICE/WARNING/stale dùng amber; CRITICAL dùng coral/red; ERROR/unknown/offline dùng slate.
- Card bo góc 20–24px, border mảnh, shadow nhẹ, khoảng trắng rộng.
- Sidebar desktop bo tròn và thu gọn được; mobile dùng drawer + backdrop.
- Topbar sticky có xe hiện tại, live state, VI/EN và notification bell.
- `/notifications` giữ card hai cột, toggle mềm, emergency contact và sticky save bar.
- Responsive tốt ở 1440, 1024, 768 và 390px; không horizontal overflow.
- WCAG AA: keyboard, focus-visible, semantic HTML, label thật, live region, error gắn với input, trạng thái không chỉ thể hiện bằng màu.
- Hỗ trợ `prefers-reduced-motion`; không lạm dụng animation, gradient hoặc glassmorphism.

## Stack và kiến trúc

- React 19 + TypeScript strict + Vite.
- React Router với protected routes và nested layout.
- TanStack Query quản lý server state; Context chỉ dùng cho session nhỏ, locale, selected vehicle và UI shell.
- Dùng/mở rộng `@cabinsentinel/contracts` và `@cabinsentinel/api-client`.
- Tạo `OwnerRepository` interface với hai implementation: `MockOwnerRepository` và `ApiOwnerRepository`.
- Chọn data source rõ ràng qua `VITE_DATA_SOURCE=mock|api`; production không được âm thầm fallback từ API sang mock.
- Base URL từ `VITE_API_BASE_URL`, không hard-code localhost.
- Không lưu access token nhạy cảm trong localStorage; ưu tiên secure cookie hoặc OIDC Authorization Code + PKCE qua auth adapter.
- Request hỗ trợ AbortSignal, timeout, error envelope và correlation ID.
- Mutation quan trọng dùng idempotency key và `expected_revision`.
- SSE có reconnect/backoff/last-event-id và fallback polling. Revision cũ không được ghi đè revision mới.
- Không thêm thư viện state management nếu React Query + local state/context đã đủ.

## Route và luồng bắt buộc

### Auth/public

- `/login`: login form/SSO adapter, loading, lỗi, session-expired message và redirect về route ban đầu.
- `/auth/callback`: xử lý callback, loading và lỗi an toàn.
- `/forbidden`: giải thích thiếu quyền, quay lại hoặc logout.
- Nếu backend auth chưa có, dùng mock auth adapter và ghi rõ đây không phải production auth.

### Owner app

- `/overview`: greeting, xe đang chọn, status hero, freshness, temperature, occupancy, camera, connectivity, backend rule/reason, incident gần đây và action progress.
- `/cabin`: chọn xe, seat zones, telemetry trend, camera/model/edge/cloud health, privacy disclosure và trạng thái real-time.
- `/vehicles`: danh sách xe, search/filter, latest status, loading/empty/error.
- `/vehicles/:vehicleId`: chi tiết xe, thiết bị, model/rule version, lịch sử gần đây, stale/offline.
- `/events`: filter severity/status/vehicle/date, search, cursor pagination, skeleton, empty, error.
- `/events/:incidentId`: revision timeline, privacy-safe evidence, actions, acknowledgement và incident status.
- `/notifications`: notification settings production-ready theo flow bên dưới.
- `/profile`: user info, locale, privacy, shared access; tính năng chưa có API phải hiển thị unavailable, không fake success.
- `/demo`: chỉ bật trong mock/development; chọn SAFE, NOTICE, WARNING, CRITICAL, ERROR, stale, camera blocked, cloud offline, action pending/failed.
- Route không tồn tại có Not Found và lối quay lại an toàn.

## Incident acknowledgement flow

1. Mở incident từ Overview, Events hoặc notification deep link.
2. Fetch incident mới nhất và kiểm tra revision.
3. Với incident active, hiển thị CTA “Tôi đã kiểm tra cabin”.
4. Mở confirmation dialog, chọn `CABIN_CHECKED`, `OCCUPANT_WITH_OWNER` hoặc `KEEP_ACTIVE`.
5. POST acknowledgement với `expected_revision` và idempotency key.
6. Chống double submit; hiển thị pending rõ ràng.
7. Nếu HTTP 409: refetch incident, giải thích dữ liệu đã thay đổi và yêu cầu xác nhận lại.
8. Nếu thành công: dùng response authoritative, cập nhật các query cache liên quan và announce bằng live region.
9. Không tự chuyển CRITICAL sang resolved nếu backend chưa trả trạng thái đó.

## Notification settings flow

1. GET preferences khi vào trang; có skeleton, retry và error state.
2. Form gồm Push, SMS, Email, Quiet hours, timezone, start/end time, emergency contact name/phone/relationship.
3. Chỉ xin Push permission sau click của user; xử lý denied/unsupported và đăng ký token qua adapter.
4. Khi bật SMS, validate số điện thoại và hiển thị verified/unverified; nếu chưa verified, có flow send OTP + confirm OTP qua interface backend-ready.
5. Quiet hours chỉ hiện/enable time fields khi bật. CRITICAL luôn bypass quiet hours và UI phải nói rõ.
6. Theo dõi dirty state; cảnh báo phù hợp khi rời trang chưa lưu.
7. PUT preferences với idempotency key và revision. Nút có các trạng thái `Lưu thay đổi`, `Đang lưu`, `Đã lưu`.
8. Validation error hiển thị tại field; server error có banner/toast và correlation ID, không làm mất dữ liệu đang nhập.
9. Thành công cập nhật cache từ response backend, không tự suy đoán.

## Offline, stale và safety behavior

- Có global connectivity banner và last-known timestamp.
- Last-known data luôn có nhãn stale/offline rõ ràng.
- Disable mutation khi không thể gửi an toàn; không âm thầm queue physical action.
- Khi online lại, invalidate/refetch các query liên quan.
- Camera/model/health lỗi dùng ERROR/UNKNOWN, không SAFE.
- Push notification chỉ mang navigation hint; mở app phải fetch trạng thái authenticated mới nhất rồi mới hiển thị verdict.

## Backend contract cần chuẩn bị

Tạo typed method, request/response contract và mock tương ứng cho:

- `GET /api/v2/me`
- `GET /api/v2/vehicles?cursor=`
- `GET /api/v2/vehicles/{id}/status`
- `GET /api/v2/vehicles/{id}/incidents?cursor=`
- `GET /api/v2/incidents/{id}`
- `POST /api/v2/incidents/{id}/acknowledgements`
- `GET /api/v2/me/notification-preferences`
- `PUT /api/v2/me/notification-preferences`
- `POST /api/v2/me/push-registrations`
- `DELETE /api/v2/me/push-registrations/{id}`
- `POST /api/v2/me/phone-verifications`
- `POST /api/v2/me/phone-verifications/{id}/confirm`
- revisioned SSE stream cho vehicle/incident updates.

Error envelope:

```ts
interface ApiErrorEnvelope {
  code: string
  message: string
  correlationId?: string
  details?: unknown
}
```

Notification contract tối thiểu:

```ts
interface NotificationPreferences {
  revision: number
  push: {
    enabled: boolean
    registrationStatus: 'registered' | 'unregistered' | 'denied' | 'unsupported'
  }
  sms: { enabled: boolean; phone: string; verified: boolean }
  email: { enabled: boolean; address: string; verified: boolean }
  quietHours: {
    enabled: boolean
    start: string
    end: string
    timezone: string
    criticalBypass: true
  }
  emergencyContact: { name: string; phone: string; relationship?: string }
  updatedAt: string
}
```

Mock repository phải dùng cùng contract và giả lập latency, empty, stale, offline, 400, 401, 403, 409 và 500.

## Cấu trúc code mục tiêu

Tách `App.tsx` lớn thành cấu trúc dễ bảo trì:

```text
src/
  app/                 router, providers, error boundaries
  auth/                adapter, guards, session
  components/          reusable accessible UI
  layouts/             AppShell, Sidebar, Topbar
  features/
    overview/
    cabin/
    vehicles/
    incidents/
    notifications/
    profile/
    demo/
  repositories/        interface, API implementation, mock implementation
  hooks/               connectivity, SSE/polling, selected vehicle
  i18n/
  styles/
  test/
```

Không over-engineer. Mỗi feature giữ query keys, types, components và tests gần nhau. Tránh component hàng trăm dòng và CSS không có tổ chức. Tái sử dụng design tokens.

## UI states bắt buộc

Mỗi route phải có các trạng thái phù hợp: initial loading/skeleton, background refetch, empty, partial data, stale, offline, unauthorized/forbidden, recoverable error + Retry, not found và success. Route có mutation cần pending, success, validation error, server error và conflict.

Thêm App/Route ErrorBoundary và telemetry interface. Không log token, raw cabin image hoặc PII nhạy cảm.

## Testing và Definition of Done

Viết Vitest + Testing Library cho tối thiểu:

- router, auth guard và permission guard;
- render các route chính;
- notification load/edit/dirty/save/error/409;
- push permission denied/unsupported;
- acknowledgement chống double submit và revision conflict;
- stale/offline không hiển thị SAFE sai;
- SSE revision cũ bị bỏ qua;
- API error và correlation ID;
- VI/EN switch;
- keyboard và accessible name cho navigation, dialog, switch, form;
- responsive navigation logic.

Chạy và sửa đến khi pass:

```powershell
npm run typecheck
npm test
npm run build --workspace @cabinsentinel/owner-web
```

Kiểm tra thủ công viewport 1440, 1024, 768 và 390px. Không horizontal overflow, text chồng hoặc CTA nằm ngoài màn hình.

## Cách thực hiện và bàn giao

1. Audit code/config và ghi mapping ngắn từ component hiện tại sang cấu trúc mới.
2. Triển khai theo vertical slice: shell -> repository/API -> routes -> mutations -> states -> tests.
3. Giữ mock mode chạy được xuyên suốt.
4. Không sửa backend Python nếu không được yêu cầu riêng.
5. Khi hoàn tất, báo cáo file đã đổi, flow đã xong, endpoint nào dùng API thật/endpoint nào còn mock, kết quả typecheck/test/build và blocker backend.

Definition of Done: Owner Web chạy tại `http://localhost:4173`, đầy đủ navigation và flow nêu trên, giao diện nhất quán với `/notifications` hiện tại, mock mode dùng được để demo, API mode có typed boundary để nối backend mà không viết lại UI, và không có UI state nào tạo cảm giác hành động an toàn đã thành công khi backend/thiết bị chưa xác nhận.
```
