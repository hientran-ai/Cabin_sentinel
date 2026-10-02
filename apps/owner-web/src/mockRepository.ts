import type { CabinRealtimeSnapshot, CabinTelemetrySample, Incident, NotificationSettings, OwnerRepository, ScenarioId, VehicleSnapshot } from './model'

const now = () => new Date().toISOString()

const base: Omit<VehicleSnapshot, 'riskLevel' | 'reason' | 'recommendation' | 'ruleId' | 'revision' | 'temperatureC' | 'occupancy' | 'camera' | 'edge' | 'cloud' | 'engine' | 'doorsLocked' | 'decisionCurrent' | 'updatedAt' | 'actions'> = {
  id: 'aurora', name: 'Aurora', plate: '51K · 068.24', model: 'Volvo XC60 Recharge',
}

export const scenarioOrder: ScenarioId[] = ['safe', 'notice', 'warning', 'critical', 'action_failure', 'camera', 'stale', 'offline']

export function scenarioSnapshot(id: ScenarioId): VehicleSnapshot {
  const common = { ...base, updatedAt: now(), edge: 'CONNECTED' as const, cloud: 'CONNECTED' as const, camera: 'OK' as const, decisionCurrent: true, actions: [] }
  switch (id) {
    case 'safe': return { ...common, riskLevel: 'SAFE', reason: { vi: 'Cabin đang được giám sát và không có dấu hiệu nguy hiểm.', en: 'The cabin is monitored with no current risk evidence.' }, recommendation: { vi: 'Không cần hành động. CabinSentinel vẫn tiếp tục theo dõi.', en: 'No action is needed. CabinSentinel will keep monitoring.' }, ruleId: 'ATTENDED_DRIVING', revision: 42, temperatureC: 25.4, occupancy: 'PRESENT', engine: 'ON', doorsLocked: false }
    case 'notice': return { ...common, riskLevel: 'NOTICE', reason: { vi: 'Có thể còn một chiếc ba lô trên ghế sau.', en: 'A backpack may have been left on the rear seat.' }, recommendation: { vi: 'Kiểm tra vật dụng khi thuận tiện.', en: 'Check the item when convenient.' }, ruleId: 'FORGOTTEN_ITEM', revision: 43, temperatureC: 26.1, occupancy: 'ABSENT', engine: 'OFF', doorsLocked: true, actions: [{ id: 'a-notice', label: { vi: 'Gửi lời nhắc', en: 'Send reminder' }, status: 'SIMULATED', detail: { vi: 'Mô phỏng — không có tin nhắn thật được gửi.', en: 'Simulation — no real message was sent.' } }] }
    case 'warning': return { ...common, riskLevel: 'WARNING', reason: { vi: 'Có khả năng còn người hoặc thú cưng trong xe đang đỗ.', en: 'A person or pet may remain in the parked vehicle.' }, recommendation: { vi: 'Hãy kiểm tra cabin ngay bây giờ.', en: 'Check the cabin now.' }, ruleId: 'COOL_OCCUPANT', revision: 44, temperatureC: 32.4, occupancy: 'PRESENT', engine: 'OFF', doorsLocked: true, activeIncidentId: 'INC-24018', actions: [{ id: 'a-warning', label: { vi: 'Thông báo chủ xe', en: 'Notify owner' }, status: 'SIMULATED', detail: { vi: 'Thông báo demo đã được tạo.', en: 'A demo notification was created.' } }] }
    case 'critical': return { ...common, riskLevel: 'CRITICAL', reason: { vi: 'Phát hiện dấu hiệu sống trong cabin có nhiệt độ nguy hiểm.', en: 'Living-presence evidence was detected in a dangerously hot cabin.' }, recommendation: { vi: 'Quay lại xe ngay và kiểm tra cabin trực tiếp.', en: 'Return to the vehicle and check the cabin immediately.' }, ruleId: 'HOT_OCCUPANT', revision: 45, temperatureC: 39.2, occupancy: 'PRESENT', engine: 'OFF', doorsLocked: true, activeIncidentId: 'INC-24019', actions: [
      { id: 'a-horn', label: { vi: 'Kích hoạt còi', en: 'Trigger horn' }, status: 'SIMULATED', detail: { vi: 'Mô phỏng — còi xe chưa được kích hoạt vật lý.', en: 'Simulation — the physical horn was not activated.' } },
      { id: 'a-sms', label: { vi: 'Gửi SMS', en: 'Send SMS' }, status: 'SIMULATED', detail: { vi: 'Mô phỏng — không có SMS thật được gửi.', en: 'Simulation — no real SMS was sent.' } },
      { id: 'a-unlock', label: { vi: 'Yêu cầu mở khóa', en: 'Request unlock' }, status: 'PENDING', detail: { vi: 'Đang chờ xác nhận của con người.', en: 'Waiting for human confirmation.' } },
    ] }
    case 'action_failure': return { ...common, riskLevel: 'CRITICAL', reason: { vi: 'Cảnh báo vẫn đang hoạt động; một hành động phản ứng đã thất bại.', en: 'The critical alert remains active; one response action has failed.' }, recommendation: { vi: 'Kiểm tra cabin trực tiếp và sử dụng phương án liên hệ dự phòng.', en: 'Check the cabin directly and use the fallback contact method.' }, ruleId: 'HOT_OCCUPANT', revision: 46, temperatureC: 40.1, occupancy: 'PRESENT', engine: 'OFF', doorsLocked: true, activeIncidentId: 'INC-24022', actions: [
      { id: 'a-horn-f', label: { vi: 'Kích hoạt còi', en: 'Trigger horn' }, status: 'SIMULATED', detail: { vi: 'Mô phỏng phản ứng tại Edge.', en: 'Simulated Edge response.' } },
      { id: 'a-sms-f', label: { vi: 'Gửi SMS', en: 'Send SMS' }, status: 'FAILED', detail: { vi: 'Không có kết nối nhà cung cấp; cần liên hệ thủ công.', en: 'Provider unavailable; manual contact is required.' } },
      { id: 'a-unlock-f', label: { vi: 'Yêu cầu mở khóa', en: 'Request unlock' }, status: 'PENDING', detail: { vi: 'Đang chờ xác nhận của con người.', en: 'Waiting for human confirmation.' } },
    ] }
    case 'camera': return { ...common, riskLevel: 'ERROR', reason: { vi: 'Camera cabin bị che nên hệ thống không thể xác minh an toàn.', en: 'The cabin camera is blocked, so safety cannot be verified.' }, recommendation: { vi: 'Kiểm tra cabin trực tiếp và làm sạch vùng camera.', en: 'Check the cabin directly and clear the camera view.' }, ruleId: 'CAMERA_UNAVAILABLE', revision: 46, temperatureC: 28.7, occupancy: 'UNKNOWN', camera: 'BLOCKED', engine: 'OFF', doorsLocked: true }
    case 'stale': return { ...common, riskLevel: 'WARNING', reason: { vi: 'Đây là cảnh báo gần nhất nhưng dữ liệu không còn mới.', en: 'This is the latest warning, but its source data is no longer current.' }, recommendation: { vi: 'Không giả định cabin an toàn; hãy kiểm tra trực tiếp.', en: 'Do not assume the cabin is safe; check it directly.' }, ruleId: 'LAST_KNOWN_WARNING', revision: 47, temperatureC: 33.1, occupancy: 'SUSPECTED', engine: 'OFF', doorsLocked: true, decisionCurrent: false, updatedAt: new Date(Date.now() - 78_000).toISOString(), activeIncidentId: 'INC-24020' }
    case 'offline': return { ...common, riskLevel: 'WARNING', reason: { vi: 'Edge vẫn giám sát cục bộ nhưng kết nối Cloud đang gián đoạn.', en: 'Edge monitoring remains active, but the cloud connection is interrupted.' }, recommendation: { vi: 'Kiểm tra cabin; lịch sử sẽ đồng bộ khi có mạng.', en: 'Check the cabin; history will sync when connectivity returns.' }, ruleId: 'EDGE_OFFLINE_MONITORING', revision: 48, temperatureC: 31.8, occupancy: 'SUSPECTED', engine: 'OFF', doorsLocked: true, cloud: 'OFFLINE', activeIncidentId: 'INC-24021' }
  }
}

const secondVehicle: VehicleSnapshot = {
  ...scenarioSnapshot('safe'), id: 'bloom', name: 'Bloom', plate: '30L · 118.68', model: 'Kia Carnival',
  occupancy: 'ABSENT', engine: 'OFF', doorsLocked: true, reason: { vi: 'Không có bằng chứng người hoặc thú cưng trong cabin.', en: 'No person or pet evidence is currently reported in the cabin.' }, ruleId: 'EMPTY_CABIN', revision: 16,
}

export const mockIncidents: Incident[] = [
  { id: 'INC-24019', vehicleId: 'aurora', riskLevel: 'CRITICAL', title: { vi: 'Nhiệt độ cabin nguy hiểm', en: 'Dangerous cabin temperature' }, reason: scenarioSnapshot('critical').reason, ruleId: 'HOT_OCCUPANT', status: 'ACTIVE', occurredAt: new Date(Date.now() - 4 * 60_000).toISOString(), temperatureC: 39.2, occupancy: 'PRESENT' },
  { id: 'INC-24018', vehicleId: 'aurora', riskLevel: 'WARNING', title: { vi: 'Có khả năng còn occupant', en: 'Possible occupant remains' }, reason: scenarioSnapshot('warning').reason, ruleId: 'COOL_OCCUPANT', status: 'MONITORING', occurredAt: new Date(Date.now() - 38 * 60_000).toISOString(), temperatureC: 32.4, occupancy: 'PRESENT' },
  { id: 'INC-23991', vehicleId: 'aurora', riskLevel: 'NOTICE', title: { vi: 'Vật dụng trên ghế sau', en: 'Item on the rear seat' }, reason: scenarioSnapshot('notice').reason, ruleId: 'FORGOTTEN_ITEM', status: 'RESOLVED', occurredAt: new Date(Date.now() - 26 * 60 * 60_000).toISOString(), temperatureC: 26.1, occupancy: 'ABSENT' },
  { id: 'INC-23872', vehicleId: 'bloom', riskLevel: 'ERROR', title: { vi: 'Camera không khả dụng', en: 'Camera unavailable' }, reason: scenarioSnapshot('camera').reason, ruleId: 'CAMERA_UNAVAILABLE', status: 'RESOLVED', occurredAt: new Date(Date.now() - 4 * 24 * 60 * 60_000).toISOString(), temperatureC: 27.2, occupancy: 'UNKNOWN' },
  { id: 'INC-24020', vehicleId: 'aurora', riskLevel: 'WARNING', title: { vi: 'Dữ liệu không còn mới', en: 'Source data is stale' }, reason: scenarioSnapshot('stale').reason, ruleId: 'LAST_KNOWN_WARNING', status: 'MONITORING', occurredAt: new Date(Date.now() - 78_000).toISOString(), temperatureC: 33.1, occupancy: 'SUSPECTED' },
  { id: 'INC-24021', vehicleId: 'aurora', riskLevel: 'WARNING', title: { vi: 'Kết nối Cloud gián đoạn', en: 'Cloud connection interrupted' }, reason: scenarioSnapshot('offline').reason, ruleId: 'EDGE_OFFLINE_MONITORING', status: 'MONITORING', occurredAt: new Date(Date.now() - 2 * 60_000).toISOString(), temperatureC: 31.8, occupancy: 'SUSPECTED' },
  { id: 'INC-24022', vehicleId: 'aurora', riskLevel: 'CRITICAL', title: { vi: 'Hành động phản ứng thất bại', en: 'Response action failed' }, reason: scenarioSnapshot('action_failure').reason, ruleId: 'HOT_OCCUPANT', status: 'ACTIVE', occurredAt: new Date(Date.now() - 90_000).toISOString(), temperatureC: 40.1, occupancy: 'PRESENT' },
]

export const mockRepository: OwnerRepository = {
  async listVehicles() { return [scenarioSnapshot('safe'), secondVehicle] },
  async listIncidents() { return mockIncidents },
  async getCabinTelemetry(vehicleId: string): Promise<CabinTelemetrySample[]> {
    const temperatures = vehicleId === 'bloom' ? [24.2, 24.1, 24.3, 24.4, 24.2, 24.5, 24.6] : [24.3, 24.5, 24.8, 25, 25.1, 25.3, 25.4]
    return temperatures.map((temperatureC, index) => ({
      recordedAt: new Date(Date.now() - (temperatures.length - 1 - index) * 5 * 60_000).toISOString(),
      temperatureC,
      occupancyConfidence: vehicleId === 'bloom' ? 0.04 : 0.92 + index * 0.01,
      signal: vehicleId === 'bloom' ? 'NORMAL' : 'OCCUPANCY',
    }))
  },
  async getCabinRealtimeState(vehicleId: string): Promise<CabinRealtimeSnapshot> {
    const occupied = vehicleId === 'aurora'
    return {
      feedState: 'LIVE', modelState: 'RUNNING', modelName: 'CabinSentinel Vision v1', inferenceAt: now(),
      latencyMs: 84, occupantConfidence: occupied ? 0.98 : 0.04, facesBlurredAtEdge: true,
      transport: 'WEBRTC', detections: occupied ? ['DRIVER', 'SEATBELT'] : ['EMPTY_CABIN'],
    }
  },
  async getNotificationSettings(): Promise<NotificationSettings> { return { push: true, sms: true, email: false, quietHours: false, emergencyContact: 'Nguyễn Minh An', emergencyPhone: '+84 912 345 678' } },
}
