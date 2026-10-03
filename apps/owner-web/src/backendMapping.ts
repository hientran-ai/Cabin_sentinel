import type { AgentState } from '../../../frontend/src/types/agent'
import type { VehicleSnapshot } from './model'

const labels: Record<string, { vi: string; en: string }> = {
  TRIGGER_HORN: { vi: 'Còi', en: 'Sound horn' }, CRACK_WINDOW: { vi: 'Hé cửa kính', en: 'Crack window' },
  SEND_SMS: { vi: 'SMS', en: 'SMS' }, SEND_NOTIFICATION: { vi: 'Thông báo', en: 'Notification' },
  REQUEST_UNLOCK: { vi: 'Yêu cầu mở khóa', en: 'Request unlock' },
}
export function ownerSnapshot(state: AgentState, decisionCurrent: boolean): VehicleSnapshot {
  return {
    id: state.vehicleId, name: state.revision ? state.vehicleId : 'Demo V1', plate: '—', model: 'Vehicle scenario · Mô phỏng',
    riskLevel: state.riskState, reason: { vi: state.reason, en: state.reason },
    recommendation: { vi: 'Đối chiếu cabin trực tiếp và bằng chứng backend hiện tại.', en: 'Check the cabin directly and review current backend evidence.' },
    ruleId: state.ruleId, revision: state.revision, temperatureC: state.sensors.temperatureC ?? undefined,
    occupancy: state.occupancyState, camera: state.cameraStatus, edge: 'OFFLINE',
    cloud: state.internetAvailable ? 'CONNECTED' : 'OFFLINE', engine: state.sensors.engine,
    doorsLocked: state.sensors.doorsLocked, decisionCurrent, updatedAt: state.timestamp,
    activeIncidentId: state.incident?.status === 'OPEN' ? state.incident.incidentId : undefined,
    actions: state.toolResults.map((tool, index) => ({
      id: `${state.revision}-${tool.action}-${index}`, label: labels[tool.action] ?? { vi: tool.action, en: tool.action },
      status: tool.status === 'PENDING_CONFIRMATION' ? 'PENDING' : tool.status === 'SUCCESS' ? 'CONFIRMED' : tool.status,
      detail: tool.status === 'SIMULATED' ? { vi: 'Mô phỏng (SIMULATED) — không thực thi phần cứng.', en: 'Simulation (SIMULATED) — no hardware execution.' }
        : tool.status === 'PENDING_CONFIRMATION' ? { vi: 'Chờ xác nhận; cửa chưa mở.', en: 'Pending human confirmation; door not opened.' }
        : { vi: tool.message ?? tool.status, en: tool.message ?? tool.status },
    })),
  }
}
