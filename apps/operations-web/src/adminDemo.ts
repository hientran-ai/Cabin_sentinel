import type { JsonRecord } from '@cabinsentinel/api-client'

export const ADMIN_DEMO_KEY = 'cs_admin_demo_mode'

export function adminDemoEnabled() {
  const requested = new URLSearchParams(window.location.search).get('demo') === '1'
  if (requested) sessionStorage.setItem(ADMIN_DEMO_KEY, '1')
  return requested || sessionStorage.getItem(ADMIN_DEMO_KEY) === '1'
}

export function startAdminDemo() {
  sessionStorage.setItem(ADMIN_DEMO_KEY, '1')
  window.location.assign('/admin?demo=1&mock_role=operations')
}

export function stopAdminDemo() {
  sessionStorage.removeItem(ADMIN_DEMO_KEY)
  sessionStorage.removeItem('cs_mock_persona')
  window.location.assign('/admin/login')
}

const now = Date.now()
const isoAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString()
const later = (minutes: number) => new Date(now + minutes * 60_000).toISOString()
const clone = <T,>(value: T): T => structuredClone(value)
const wait = async <T,>(value: T): Promise<T> => {
  await new Promise(resolve => setTimeout(resolve, 120))
  return clone(value)
}

const vehicles: JsonRecord[] = [
  { vehicle_id: 'VF8-HN-0188', name: 'VF 8 - Gia đình An', plate: '30K-018.88', owner_id: 'usr-owner-an', tenant_id: 'tenant-hanoi', online: true, risk_level: 'CRITICAL', active_incident: 'INC-2026-1042', status: 'active' },
  { vehicle_id: 'VF9-HCM-2205', name: 'VF 9 - Xe dịch vụ 05', plate: '51K-220.05', owner_id: 'usr-fleet-05', tenant_id: 'tenant-saigon', online: true, risk_level: 'WARNING', active_incident: 'INC-2026-1041', status: 'active' },
  { vehicle_id: 'VF6-DN-7712', name: 'VF 6 - Đà Nẵng 12', plate: '43A-771.22', owner_id: 'usr-owner-linh', tenant_id: 'tenant-danang', online: false, risk_level: 'ERROR', active_incident: null, status: 'active' },
  { vehicle_id: 'VF7-HN-9090', name: 'VF 7 - Điều hành', plate: '29K-909.09', owner_id: 'usr-fleet-09', tenant_id: 'tenant-hanoi', online: true, risk_level: 'SAFE', active_incident: null, status: 'active' },
]

let incidents: JsonRecord[] = [
  { incident_id: 'INC-2026-1042', vehicle_id: 'VF8-HN-0188', vehicle_name: 'VF 8 - Gia đình An', status: 'OPEN', risk_level: 'CRITICAL', revision: 18, opened_at: isoAgo(9), reason: 'Phát hiện trẻ nhỏ trong cabin nóng khi xe đã tắt máy', rule_id: 'HOT_OCCUPANT', ops: { ops_status: 'ESCALATED', assignee: 'Nguyễn Minh Anh', keep_active: true, version: 4, notes: ['Đã gọi chủ xe, chưa liên lạc được.'] } },
  { incident_id: 'INC-2026-1041', vehicle_id: 'VF9-HCM-2205', vehicle_name: 'VF 9 - Xe dịch vụ 05', status: 'OPEN', risk_level: 'WARNING', revision: 31, opened_at: isoAgo(24), reason: 'Có người trong xe, nhiệt độ cabin đang tăng', rule_id: 'CABIN_TEMP_RISING', ops: { ops_status: 'ASSIGNED', assignee: 'Trần Hoàng', keep_active: false, version: 2, notes: [] } },
  { incident_id: 'INC-2026-1038', vehicle_id: 'VF7-HN-9090', vehicle_name: 'VF 7 - Điều hành', status: 'RESOLVED', risk_level: 'NOTICE', revision: 12, opened_at: isoAgo(180), resolved_at: isoAgo(145), reason: 'Chuyển động được phát hiện sau khi khóa xe', rule_id: 'POST_LOCK_MOTION', ops: { ops_status: 'RESOLVED', assignee: 'Lê Thu', keep_active: false, version: 5, notes: ['Đã xác minh hành khách rời xe an toàn.'] } },
]

let commands: JsonRecord[] = [
  { command_id: 'CMD-8812', vehicle_id: 'VF8-HN-0188', incident_id: 'INC-2026-1042', type: 'unlock', status: 'requested', requested_by: 'operator-demo', authorized_by: null, requested_at: isoAgo(3), expires_at: later(2) },
  { command_id: 'CMD-8811', vehicle_id: 'VF8-HN-0188', incident_id: 'INC-2026-1042', type: 'horn', status: 'acknowledged', requested_by: 'operator-02', authorized_by: 'operator-02', requested_at: isoAgo(6), expires_at: isoAgo(1) },
  { command_id: 'CMD-8807', vehicle_id: 'VF9-HCM-2205', incident_id: 'INC-2026-1041', type: 'sms', status: 'sent', requested_by: 'operator-03', authorized_by: 'operator-03', requested_at: isoAgo(18), expires_at: later(12) },
]

const evaluations: JsonRecord[] = [
  { event_id: 'EV-5018', event_type: 'evaluation', vehicle_id: 'VF8-HN-0188', incident_id: 'INC-2026-1042', revision: 18, risk_level: 'CRITICAL', rule_id: 'HOT_OCCUPANT', reason: 'Trẻ nhỏ trong cabin 41.8°C, xe đã tắt máy', timestamp: isoAgo(1), evaluated_at: isoAgo(1), decision_current: true, occupancy_state: 'CHILD_PRESENT', camera_status: 'OK', temperature: 41.8 },
  { event_id: 'EV-5017', event_type: 'evaluation', vehicle_id: 'VF9-HCM-2205', incident_id: 'INC-2026-1041', revision: 31, risk_level: 'WARNING', rule_id: 'CABIN_TEMP_RISING', reason: 'Nhiệt độ tăng nhanh, phát hiện một người lớn', timestamp: isoAgo(4), evaluated_at: isoAgo(4), decision_current: true, occupancy_state: 'ADULT_PRESENT', camera_status: 'OK', temperature: 36.7 },
  { event_id: 'EV-5016', event_type: 'evaluation', vehicle_id: 'VF6-DN-7712', revision: 7, risk_level: 'ERROR', rule_id: 'CAMERA_UNAVAILABLE', reason: 'Camera không gửi dữ liệu trong 90 giây', timestamp: isoAgo(8), evaluated_at: isoAgo(8), decision_current: false, occupancy_state: 'UNKNOWN', camera_status: 'OFFLINE' },
  { event_id: 'EV-5015', event_type: 'evaluation', vehicle_id: 'VF7-HN-9090', revision: 44, risk_level: 'SAFE', rule_id: 'CABIN_CLEAR', reason: 'Không phát hiện người hoặc vật nuôi trong cabin', timestamp: isoAgo(2), evaluated_at: isoAgo(2), decision_current: true, occupancy_state: 'EMPTY', camera_status: 'OK', temperature: 29.4 },
  { event_id: 'EV-5011', event_type: 'evaluation', vehicle_id: 'VF8-HN-0188', incident_id: 'INC-2026-1042', revision: 17, risk_level: 'WARNING', rule_id: 'HOT_OCCUPANT', reason: 'Nhiệt độ cabin vượt ngưỡng cảnh báo', timestamp: isoAgo(10), evaluated_at: isoAgo(10), decision_current: false, occupancy_state: 'CHILD_PRESENT', camera_status: 'OK', temperature: 38.5 },
]

let tenants: JsonRecord[] = [
  { tenant_id: 'tenant-hanoi', name: 'Đội xe Hà Nội', created_at: isoAgo(43_200) },
  { tenant_id: 'tenant-saigon', name: 'Vận tải Sài Gòn', created_at: isoAgo(28_800) },
  { tenant_id: 'tenant-danang', name: 'Gia đình Đà Nẵng', created_at: isoAgo(14_400) },
]

let users: JsonRecord[] = [
  { user_id: 'admin-demo', email: 'admin@cabinsentinel.demo', full_name: 'Thu Hiền', role: 'admin', tenant_id: null, active: true, last_login_at: isoAgo(2) },
  { user_id: 'operator-demo', email: 'minhanh@cabinsentinel.demo', full_name: 'Nguyễn Minh Anh', role: 'operator', tenant_id: 'tenant-hanoi', active: true, last_login_at: isoAgo(5) },
  { user_id: 'operator-03', email: 'hoang@cabinsentinel.demo', full_name: 'Trần Hoàng', role: 'operator', tenant_id: 'tenant-saigon', active: true, last_login_at: isoAgo(18) },
  { user_id: 'usr-owner-an', email: 'an.nguyen@example.com', full_name: 'Nguyễn Hoài An', role: 'owner', tenant_id: 'tenant-hanoi', active: true, last_login_at: isoAgo(1_440) },
  { user_id: 'usr-owner-linh', email: 'linh.tran@example.com', full_name: 'Trần Mỹ Linh', role: 'owner', tenant_id: 'tenant-danang', active: false, last_login_at: isoAgo(150_000) },
]

let devices: JsonRecord[] = [
  { device_id: 'dev-edge-0188', serial: 'CS-HN-0188', vehicle_id: 'VF8-HN-0188', firmware: '2.4.1', target_firmware: '2.4.1', status: 'active', online: true, last_seen: isoAgo(1), last_heartbeat: { received_at: isoAgo(1), battery_pct: 87, rssi_dbm: -54, status: 'OK' } },
  { device_id: 'dev-edge-2205', serial: 'CS-HCM-2205', vehicle_id: 'VF9-HCM-2205', firmware: '2.3.8', target_firmware: '2.4.1', status: 'active', online: true, last_seen: isoAgo(2), last_heartbeat: { received_at: isoAgo(2), battery_pct: 74, rssi_dbm: -61, status: 'OK' } },
  { device_id: 'dev-edge-7712', serial: 'CS-DN-7712', vehicle_id: 'VF6-DN-7712', firmware: '2.3.8', target_firmware: '2.4.1', status: 'active', online: false, last_seen: isoAgo(96), last_heartbeat: { received_at: isoAgo(96), battery_pct: 21, rssi_dbm: -103, status: 'ERROR' } },
  { device_id: 'dev-old-0031', serial: 'CS-OLD-0031', vehicle_id: 'VF7-HN-9090', firmware: '2.1.0', target_firmware: null, status: 'revoked', online: false, last_seen: isoAgo(10_080) },
]

let models: JsonRecord[] = [
  { model_id: 'model-yolo-8n-024', name: 'Cabin Occupancy YOLO', version: '2026.10.2', sha256: 'f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36', status: 'active', rollout_pct: 100, note: 'Production occupancy detector' },
  { model_id: 'model-age-010', name: 'Age Evidence Classifier', version: '1.0.0', sha256: '7b21a0cf531b6afed46ac1cced44e947b49e2e742209c5d565095e865d1f384a', status: 'staged', rollout_pct: 25, note: 'Evidence only; not used for safety verdicts' },
]

let rulesets: JsonRecord[] = [
  { version: 'safety-2026.10', status: 'active', applied_to_engine: true, created_by: 'admin-demo', created_at: isoAgo(10_080), note: 'Ngưỡng production đã phê duyệt', params: { temperature_warning_c: 35, temperature_critical_c: 40, sensor_stale_seconds: 30 } },
  { version: 'safety-2026.11-rc1', status: 'staged', applied_to_engine: false, created_by: 'admin-demo', created_at: isoAgo(720), note: 'Thử nghiệm cảnh báo sớm hơn', params: { temperature_warning_c: 34, temperature_critical_c: 39.5, sensor_stale_seconds: 30 } },
]

let auditEntries: JsonRecord[] = [
  { id: 'AUD-9005', ts: isoAgo(3), actor: 'operator-demo', actor_role: 'operator', tenant_id: 'tenant-hanoi', action: 'command.request', target: 'CMD-8812', outcome: 'success', correlation_id: 'trace-demo-9005', detail: { type: 'unlock', vehicle: 'VF8-HN-0188' } },
  { id: 'AUD-9004', ts: isoAgo(6), actor: 'operator-02', actor_role: 'operator', tenant_id: 'tenant-hanoi', action: 'command.device_ack', target: 'CMD-8811', outcome: 'success', correlation_id: 'trace-demo-9004', detail: { status: 'acknowledged' } },
  { id: 'AUD-9003', ts: isoAgo(9), actor: 'operator-demo', actor_role: 'operator', tenant_id: 'tenant-hanoi', action: 'incident.escalate', target: 'INC-2026-1042', outcome: 'success', correlation_id: 'trace-demo-9003', detail: {} },
  { id: 'AUD-9002', ts: isoAgo(96), actor: 'system', actor_role: 'device', tenant_id: 'tenant-danang', action: 'device.heartbeat', target: 'dev-edge-7712', outcome: 'failed', correlation_id: 'trace-demo-9002', detail: { reason: 'connection_lost' } },
  { id: 'AUD-9001', ts: isoAgo(720), actor: 'admin-demo', actor_role: 'admin', tenant_id: null, action: 'ruleset.create', target: 'safety-2026.11-rc1', outcome: 'success', correlation_id: 'trace-demo-9001', detail: {} },
]

let sequence = 9100
const addAudit = (action: string, target: string, detail: JsonRecord = {}) => {
  sequence += 1
  auditEntries.unshift({ id: `AUD-${sequence}`, ts: new Date().toISOString(), actor: 'admin-demo', actor_role: 'admin', tenant_id: null, action, target, outcome: 'success', correlation_id: `trace-demo-${sequence}`, detail })
}

export function createAdminMockClient() {
  return {
    v1AdminVehicles: () => wait({ items: vehicles, page: 1, page_size: 100, total: vehicles.length }),
    v1VehicleEvents: (vehicleId: string) => wait({ vehicle_id: vehicleId, events: evaluations.filter(item => item.vehicle_id === vehicleId) }),
    v1OpsIncidents: () => wait({ items: incidents, page: 1, page_size: 100, total: incidents.length }),
    v1OpsCommands: () => wait({ enabled: true, commands }),
    v1AdminSystem: () => wait({ env: 'demo', commands_enabled: true, dependencies: { api: 'READY', database: 'READY', vision: 'READY', privacy: 'READY', mqtt: 'DISABLED' }, metrics: { requests_total: 18_642, evaluations_total: 5_018, incidents_open: 2, command_success_rate: 0.982, inference_p95_ms: 84 }, alerts: [{ severity: 'WARNING', code: 'DEVICE_OFFLINE', message: 'CS-DN-7712 mất kết nối 96 phút.' }] }),
    v1AdminVision: () => wait({ loaded: { vision_model: { name: 'yolov8n.pt', available: true }, privacy_model: { method: 'YUNET_SOFT_OVAL', available: true }, age_classifier: { available: true, role: 'EVIDENCE_ONLY' }, provider_ready: true }, registry_active: models.filter(item => item.status === 'active' || item.status === 'staged') }),
    v1AdminTenants: () => wait({ tenants }),
    v1AdminUsers: () => wait({ users }),
    v1AdminRoles: () => wait({ roles: { admin: ['*'], operator: ['fleet.read', 'incident.manage', 'command.request', 'audit.read'], owner: ['vehicle.read', 'incident.ack'], caregiver: ['vehicle.read', 'incident.ack'] }, permission_catalogue: ['audit.read', 'command.request', 'fleet.read', 'incident.ack', 'incident.manage', 'model.manage', 'rules.manage', 'system.read', 'user.manage'] }),
    v1AdminAccessReview: () => wait({ as_of: new Date().toISOString(), inactive_days: 90, users, summary: { total: users.length, flagged: users.filter(item => item.active !== true).length, admins: users.filter(item => item.role === 'admin' && item.active === true).length } }),
    v1AdminDevices: () => wait({ devices, summary: { total: devices.length, online: devices.filter(item => item.online === true).length, update_pending: devices.filter(item => item.status === 'active' && item.firmware !== item.target_firmware).length } }),
    v1AdminModels: () => wait({ models }),
    v1AdminRulesets: () => wait({ rulesets, note: 'Dữ liệu mô phỏng: một ruleset đang điều khiển engine và một bản đang staged.' }),
    v1AdminAudit: () => wait({ entries: auditEntries }),
    v1Telemetry: (vehicleId: string) => wait({ vehicle_id: vehicleId, as_of: new Date().toISOString(), points: [{ at: isoAgo(10), temperature_c: 34.2, battery_pct: 89 }, { at: isoAgo(5), temperature_c: 37.6, battery_pct: 88 }, { at: isoAgo(1), temperature_c: 41.8, battery_pct: 87 }] }),
    v1Incidents: (vehicleId: string) => wait({ vehicle_id: vehicleId, current: incidents.find(item => item.vehicle_id === vehicleId && item.status === 'OPEN') ?? null, resolved_history: incidents.filter(item => item.vehicle_id === vehicleId && item.status === 'RESOLVED') }),
    v1IssuePairingCode: async (vehicleId: string) => { const value = { vehicle_id: vehicleId, pairing_code: '682941', expires_at: later(10) }; addAudit('device.pairing_code', vehicleId); return wait(value) },
    v1AdminDeviceHeartbeats: (deviceId: string) => wait({ device_id: deviceId, heartbeats: [{ received_at: isoAgo(1), battery_pct: 87, rssi_dbm: -54, status: 'OK' }, { received_at: isoAgo(6), battery_pct: 88, rssi_dbm: -57, status: 'OK' }] }),
    v1AdminSetFirmware: async (deviceId: string, targetFirmware: string | null) => { devices = devices.map(item => item.device_id === deviceId ? { ...item, target_firmware: targetFirmware } : item); addAudit('device.firmware_target', deviceId, { target_firmware: targetFirmware }); return wait(devices.find(item => item.device_id === deviceId)!) },
    v1AdminRevokeDevice: async (deviceId: string) => { devices = devices.map(item => item.device_id === deviceId ? { ...item, status: 'revoked', online: false } : item); addAudit('device.revoke', deviceId); return wait(devices.find(item => item.device_id === deviceId)!) },
    v1AdminCreateTenant: async (name: string) => { const tenant = { tenant_id: `tenant-demo-${tenants.length + 1}`, name, created_at: new Date().toISOString() }; tenants = [...tenants, tenant]; addAudit('tenant.create', tenant.tenant_id); return wait(tenant) },
    v1AdminCreateUser: async (payload: JsonRecord) => { const user = { user_id: `usr-demo-${users.length + 1}`, active: true, last_login_at: null, ...payload }; users = [...users, user]; addAudit('user.create', String(user.user_id)); return wait(user) },
    v1AdminUpdateUser: async (userId: string, payload: JsonRecord) => { users = users.map(item => item.user_id === userId ? { ...item, ...payload } : item); addAudit('user.access_change', userId, payload); return wait(users.find(item => item.user_id === userId)!) },
    v1AdminRevokeUserSessions: async (userId: string) => { addAudit('user.revoke_sessions', userId); return wait({ user_id: userId, revoked_sessions: 2 }) },
    v1AdminSetRolePermissions: async (role: string, permissions: string[]) => { addAudit('role.permissions_change', role, { permissions }); return wait({ role, permissions }) },
    v1AdminRegisterModel: async (payload: JsonRecord) => { const model = { model_id: `model-demo-${models.length + 1}`, status: 'registered', rollout_pct: 0, ...payload }; models = [...models, model]; addAudit('model.register', String(model.model_id)); return wait(model) },
    v1AdminRolloutModel: async (modelId: string, rolloutPct: number) => { models = models.map(item => item.model_id === modelId ? { ...item, rollout_pct: rolloutPct, status: rolloutPct === 100 ? 'active' : 'staged' } : item); addAudit('model.rollout', modelId, { rollout_pct: rolloutPct }); return wait(models.find(item => item.model_id === modelId)!) },
    v1AdminRollbackModel: async (modelId: string) => { models = models.map(item => item.model_id === modelId ? { ...item, status: 'rolled_back', rollout_pct: 0 } : item); addAudit('model.rollback', modelId); return wait(models.find(item => item.model_id === modelId)!) },
    v1AdminCreateRuleset: async (payload: JsonRecord) => { const ruleset: JsonRecord = { status: 'staged', applied_to_engine: false, created_by: 'admin-demo', created_at: new Date().toISOString(), ...payload }; rulesets = [...rulesets, ruleset]; addAudit('ruleset.create', String(ruleset.version)); return wait(ruleset) },
    v1AdminActivateRuleset: async (version: string) => { rulesets = rulesets.map(item => ({ ...item, status: item.version === version ? 'active' : item.status === 'active' ? 'superseded' : item.status, applied_to_engine: item.version === version })); addAudit('ruleset.activate', version); return wait(rulesets.find(item => item.version === version)!) },
    v1OpsIncidentAction: async (incidentId: string, action: string, payload: JsonRecord) => { incidents = incidents.map(item => item.incident_id === incidentId ? { ...item, ops: { ...(item.ops as JsonRecord), version: Number((item.ops as JsonRecord).version ?? 0) + 1, ...(action === 'assign' ? { assignee: payload.assignee, ops_status: 'ASSIGNED' } : {}), ...(action === 'escalate' ? { ops_status: 'ESCALATED' } : {}), ...(action === 'note' ? { notes: [...(((item.ops as JsonRecord).notes as string[]) ?? []), payload.note] } : {}) } } : item); addAudit(`incident.${action}`, incidentId); return wait(incidents.find(item => item.incident_id === incidentId)!) },
    v1AcknowledgeIncident: async (vehicleId: string, incidentId: string) => { addAudit('incident.acknowledge', incidentId, { vehicle: vehicleId }); return wait(incidents.find(item => item.incident_id === incidentId)!) },
    v1HoldIncident: async (_vehicleId: string, incidentId: string, _version: number, keepActive: boolean, note?: string) => { incidents = incidents.map(item => item.incident_id === incidentId ? { ...item, ops: { ...(item.ops as JsonRecord), keep_active: keepActive, version: Number((item.ops as JsonRecord).version ?? 0) + 1, note } } : item); addAudit('incident.hold', incidentId, { keep_active: keepActive }); return wait(incidents.find(item => item.incident_id === incidentId)!) },
    v1ResolveIncident: async (_vehicleId: string, incidentId: string) => { incidents = incidents.map(item => item.incident_id === incidentId ? { ...item, status: 'RESOLVED', resolved_at: new Date().toISOString(), ops: { ...(item.ops as JsonRecord), ops_status: 'RESOLVED', keep_active: false } } : item); addAudit('incident.resolve', incidentId); return wait(incidents.find(item => item.incident_id === incidentId)!) },
    v1RequestCommand: async (vehicleId: string, type: string, incidentId?: string) => { const command = { command_id: `CMD-${8800 + commands.length + 1}`, vehicle_id: vehicleId, incident_id: incidentId, type, status: 'requested', requested_by: 'admin-demo', authorized_by: null, requested_at: new Date().toISOString(), expires_at: later(5) }; commands = [command, ...commands]; addAudit('command.request', command.command_id, { type, vehicle: vehicleId }); return wait(command) },
    v1ConfirmCommand: async (commandId: string) => { commands = commands.map(item => item.command_id === commandId ? { ...item, status: 'authorized', authorized_by: 'admin-demo' } : item); addAudit('command.authorize', commandId); return wait(commands.find(item => item.command_id === commandId)!) },
    v1CancelCommand: async (commandId: string) => { commands = commands.map(item => item.command_id === commandId ? { ...item, status: 'canceled' } : item); addAudit('command.cancel', commandId); return wait(commands.find(item => item.command_id === commandId)!) },
    v1OpsRejectCommand: async (commandId: string, reason?: string) => { commands = commands.map(item => item.command_id === commandId ? { ...item, status: 'rejected', rejection_reason: reason } : item); addAudit('command.reject', commandId, { reason }); return wait(commands.find(item => item.command_id === commandId)!) },
  }
}
