# Backend handoff — luồng tài khoản Operator

## Mục tiêu

Frontend dùng chung một Operations Portal cho hai nhóm nhân sự:

- Platform Admin quản trị toàn hệ thống.
- Operator xử lý sự cố trong phạm vi tenant được giao.

Chủ xe và người thân không đăng nhập portal này; lựa chọn Cabin Noir trên trang đăng nhập mở trực tiếp mobile web.

Frontend đã hỗ trợ contract mới theo cách tương thích ngược. Nếu backend chưa trả `permissions` và `tenant_id`, frontend tạm dùng quyền mặc định theo role. Khi backend triển khai contract dưới đây, frontend tự động ưu tiên effective permissions do backend trả về.

## P0 — contract xác thực cần bổ sung

Mở rộng `GET /api/v1/auth/me`:

```json
{
  "role": "operator",
  "subject": "operator-user-id",
  "tenant_id": "tenant-hanoi",
  "permissions": [
    "fleet.read",
    "vehicle.read",
    "incident.manage",
    "incident.ack",
    "command.request",
    "device.read",
    "audit.read",
    "system.read"
  ],
  "vehicle_ids": ["VF8-HN-0188"],
  "trip_id": null
}
```

Yêu cầu:

1. `permissions` là quyền hiệu lực lấy từ bảng roles, không phải danh sách frontend gửi lên.
2. `tenant_id` lấy từ tài khoản đã xác thực.
3. `vehicle_ids` chỉ chứa xe trong phạm vi mà tài khoản được xem.
4. Role hoặc permission thay đổi phải có hiệu lực với access token hiện tại hoặc phiên phải bị revoke ngay.
5. Backend tiếp tục là nơi quyết định cuối cùng; việc frontend ẩn menu/nút không phải cơ chế bảo mật.

## P0 — tài khoản Operator

API tạo user hiện tại có thể tiếp tục được dùng:

```http
POST /api/v1/admin/users
```

```json
{
  "email": "operator@company.vn",
  "password": "temporary-password",
  "full_name": "Nguyễn Văn A",
  "role": "operator",
  "tenant_id": "tenant-hanoi"
}
```

Backend cần bảo đảm:

- Platform Admin có thể tạo Operator cho một tenant.
- Tenant Admin chỉ có thể tạo Operator trong chính tenant của mình.
- Operator không thể tự cấp quyền hoặc đổi tenant.
- Không cho tạo Platform Admin từ tài khoản tenant-scoped.
- Tạo user, đổi role, disable user và revoke session đều có audit record.
- Không bao giờ trả password hoặc password hash trong response/log/audit.

## P0 — ma trận quyền đề xuất

| Chức năng | Platform Admin | Operator mặc định |
| --- | --- | --- |
| Tổng quan quản trị | Có | Không; vào thẳng Incident |
| Xem fleet và evaluations | Có | `fleet.read`, `vehicle.read` |
| Phân công, ghi chú, hold, resolve | Có | `incident.manage` |
| Acknowledge incident | Có | `incident.ack` |
| Yêu cầu/phê duyệt command | Có | `command.request` |
| Xem thiết bị/heartbeat | Có | `device.read` |
| Firmware/revoke device | Có | Chỉ khi có `device.manage` |
| Tạo pairing code | Có | Chỉ khi có `vehicle.manage` |
| Xem audit | Có | `audit.read` |
| System health | Có | `system.read` |
| Users/tenants | Có | Chỉ khi có `user.manage` và đúng tenant scope |
| Models/rules | Có | Không |

## P0 — tenant isolation

Mọi endpoint Operations/Admin phải áp tenant scope ở backend, bao gồm:

- `/admin/vehicles`;
- `/admin/devices` và heartbeat;
- `/ops/incidents`;
- `/ops/commands`;
- `/admin/audit`;
- `/admin/users`, `/admin/access-review`;
- vehicle telemetry, events, incidents và commands.

Đối với resource ngoài tenant, nên trả `404` thay vì tiết lộ resource tồn tại bằng `403`.

## P0 — lỗi ổn định cho frontend

Chuẩn hóa response lỗi nhưng giữ HTTP status đúng:

```json
{
  "code": "INCIDENT_VERSION_CONFLICT",
  "message": "Incident was changed by another operator",
  "correlation_id": "trace-123",
  "details": {
    "current_version": 5
  }
}
```

Các code frontend cần trước:

- `INCIDENT_VERSION_CONFLICT` — HTTP 409;
- `INCIDENT_NOT_CURRENT` — HTTP 404 hoặc 409 theo policy thống nhất;
- `INCIDENT_HELD_OPEN` — HTTP 409;
- `COMMANDS_DISABLED` — HTTP 409;
- `COMMAND_FOUR_EYES_REQUIRED` — HTTP 409;
- `COMMAND_DECISION_NOT_CURRENT` — HTTP 409;
- `LAST_ACTIVE_ADMIN` — HTTP 409;
- `CANNOT_CHANGE_SELF_ACCESS` — HTTP 409;
- `TENANT_SCOPE_VIOLATION` — HTTP 403/404 theo quy tắc che giấu resource.

## P1 — quy trình tài khoản production

Sau MVP, thay mật khẩu tạm thời do Admin nhập bằng invitation:

```text
Admin tạo lời mời
→ backend phát hành token một lần, có hạn sử dụng
→ Operator tự đặt mật khẩu
→ trạng thái INVITED chuyển thành ACTIVE
→ ghi audit invitation.created và invitation.accepted
```

Các trạng thái đề xuất: `INVITED`, `ACTIVE`, `LOCKED`, `DISABLED`.

## Acceptance tests backend

1. Operator đăng nhập và `/auth/me` trả đúng `tenant_id`, permissions và vehicle scope.
2. Operator tenant A không đọc hoặc mutate resource tenant B.
3. Operator mặc định không thể gọi user/model/rules mutation.
4. Operator có `device.read` xem được heartbeat nhưng không firmware/revoke nếu thiếu `device.manage`.
5. Operator không thể tự duyệt unlock do chính mình yêu cầu.
6. Incident version cũ trả `409` và không ghi đè phiên bản mới.
7. Disable hoặc đổi role user làm session cũ mất quyền ngay.
8. Mọi mutation thành công và bị từ chối quan trọng đều có correlation ID và audit record.

## Không yêu cầu backend thay đổi

- Không cần tạo một ứng dụng Operator riêng.
- Không cần thay luồng Cabin Noir mobile.
- Không để frontend quyết định tenant hoặc gửi danh sách permissions đáng tin cậy.
- Không cần bật ruleset registry để điều khiển safety engine trong hạng mục này.
