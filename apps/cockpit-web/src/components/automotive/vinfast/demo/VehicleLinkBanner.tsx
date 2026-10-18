// Shown only while the (simulated) vehicle link of this session is not CONNECTED. The browser/API link is a different thing and has its own message.
import { useState } from 'react'
import { openCabinMonitor } from '../../../../e2e/cabinUi'
import { clock, liveAge, useTick, useVehicleLink } from '../../../../e2e/hooks'
import { useE2e } from '../../../../e2e/store'
import { ageText } from '../../../../e2e/view'
import { restoreVehicleLink } from './scenarios'

const TITLE = { RECONNECTING: 'Đang nối lại với xe…', DISCONNECTED: 'Mất kết nối với xe', SYNCING: 'Đã nối lại, đang đồng bộ dữ liệu mới' } as const

export function VehicleLinkBanner() {
  useTick(1000)
  const link = useVehicleLink(), state = useE2e((s) => s.state), received = useE2e((s) => s.receivedPerf)
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null)
  if (!link || link.state === 'CONNECTED') return null
  const incident = state?.incident?.status === 'OPEN'
  const last = state?.sensor_snapshot?.temperature
  const age = liveAge(state?.freshness.sensor, received)
  const retry = async () => { setBusy(true); setErr(null); const r = await restoreVehicleLink(); setBusy(false); if (!r.ok) setErr(r.detail ?? 'Không nối lại được') }
  return (
    <section className="vd-banner crit vd-linkbanner" role="alert" data-testid="vehicle-link-banner" data-state={link.state}>
      <div>
        <b>{TITLE[link.state as keyof typeof TITLE]} <small>· {link.state} · MÔ PHỎNG</small></b>
        <p>{link.state === 'SYNCING' ? link.reason : 'Mất kết nối với xe. CabinSentinel không nhận được dữ liệu mới và hiện không thể xác minh tình trạng khoang xe.'}</p>
        <p className="vd-note">Cập nhật cuối từ xe: {clock(link.last_vehicle_message_at)}{age != null ? ` (${ageText(age)} trước)` : ''} · nhiệt độ {typeof last === 'number' ? `${last}°C` : '—'} <b>CŨ</b> · cabin: chưa thể xác minh · {incident ? 'sự cố đang mở được giữ nguyên' : 'không có sự cố mở'}</p>
        {err && <p role="alert" className="vd-err">{err}</p>}
      </div>
      <div className="vd-linkactions">
        <button type="button" className="vd-btn primary" disabled={busy || link.state === 'SYNCING'} data-testid="vehicle-reconnect" onClick={() => void retry()}>{busy ? 'Đang nối lại…' : 'Thử kết nối lại'}</button>
        <button type="button" className="vd-btn" data-testid="vehicle-last-data" onClick={() => openCabinMonitor('evidence')}>Xem dữ liệu cuối</button>
        {incident && <button type="button" className="vd-btn" data-testid="vehicle-open-incident" onClick={() => openCabinMonitor('overview')}>Xem sự cố đang hoạt động</button>}
      </div>
    </section>
  )
}
