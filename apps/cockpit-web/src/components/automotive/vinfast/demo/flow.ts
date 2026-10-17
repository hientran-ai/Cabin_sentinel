// Demo flow bar: which stage of the real pipeline the session has reached. Everything is read from the committed state;
// a stage is "done" only when the backend/state proves it, never because a button was pressed.
import type { NotificationItem, ServerState } from '../../../../e2e/types'

export type StepStatus = 'done' | 'active' | 'pending' | 'warn'
export interface FlowStep { id: string; label: string; hint: string; status: StepStatus }
export interface FlowInput {
  hasSession: boolean; sourceRunning: boolean; sourceKind: 'none' | 'clip' | 'upload' | 'device'
  state: ServerState | null; notifications: NotificationItem[]; connection: 'ok' | 'lost'
}

export function flowSteps(i: FlowInput): FlowStep[] {
  const s = i.state, obs = s?.last_observation
  const alarming = !!s && (s.risk_level === 'WARNING' || s.risk_level === 'CRITICAL')
  const unverifiable = !!s && (s.risk_level === 'ERROR' || !s.decision_current || i.connection === 'lost')
  const incident = s?.incident
  const delivered = i.notifications.some((n) => n.channels.in_app_feed.state === 'IN_APP_DELIVERED' || n.channels.in_app_feed.delivered_at)
  const conds: [string, string, string, boolean][] = [
    ['source', 'Nguồn hình', 'Chọn kịch bản, tải ảnh hoặc bật camera', i.hasSession && (i.sourceRunning || i.sourceKind === 'upload' || !!obs)],
    ['model', 'Model phân tích', 'Khung hình được chạy model ở máy chủ', !!obs && obs.event_type === 'observation'],
    ['commit', 'Quyết định đã lưu', 'Luật an toàn chấm điểm và lưu một revision', !!s && s.revision > 0 && !!obs],
    ['cockpit', 'Cảnh báo trên xe', 'Màn xe hiện đúng mức rủi ro vừa lưu', (alarming && !!s?.decision_current) || !!incident?.acknowledged_at || incident?.status === 'RESOLVED'],
    ['phone', 'Điện thoại nhận', 'Thông báo tới ứng dụng chủ xe', delivered || !!incident?.acknowledged_at],
    ['ack', 'Chủ xe đã xem', 'Bấm "Đã xem" trên điện thoại', !!incident?.acknowledged_at],
    ['resolve', 'Đã kiểm tra cabin', 'Chủ xe xác nhận sau khi kiểm tra', incident?.status === 'RESOLVED'],
  ]
  let activeSet = false, chain = true
  return conds.map(([id, label, hint, rawDone], idx) => {
    // the pipeline stages (source > model > commit > cockpit) happen in order: a later one cannot be done while an earlier one is not
    const done = idx < 4 ? rawDone && chain : rawDone
    if (idx < 4) chain = chain && rawDone
    let status: StepStatus = done ? 'done' : 'pending'
    if (!done && !activeSet) { status = 'active'; activeSet = true }
    // evidence is old / link lost / unverifiable: say so on the stage that cannot be trusted instead of showing a calm bar
    if (!done && status === 'active' && unverifiable && (id === 'cockpit' || id === 'commit')) status = 'warn'
    if (!done && status === 'active' && id === 'model' && obs?.event_type === 'camera_status') status = 'warn'
    return { id, label, hint, status }
  })
}
