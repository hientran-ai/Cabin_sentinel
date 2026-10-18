// CabinSentinel inside the VinFast HMI: the tile in the notification slot. The detail dialog lives in CabinMonitor.tsx.
// A concept extension, not an OEM CPD screen. Read-only on the cockpit: acknowledging and closing an incident stay on the owner's phone.
import { motion } from 'motion/react'
import { ScanEye } from 'lucide-react'
import { liveAge, useTick, useView } from '../../../e2e/hooks'
import { cabinStatus, countsForSource } from '../../../e2e/sourceModel'
import { useE2e } from '../../../e2e/store'
import { useObservationBadge, useSourceSummary } from '../../../e2e/useSource'
import { ageText } from '../../../e2e/view'
import { useUi } from '../../../store/uiStore'
import { IC } from './parts'
import { useFrameCounts, useVinfast } from './useVinfast'

const fmt = (n: number | null | undefined) => (n == null ? '—' : String(n))

function Num({ value, note }: { value: number | null; note: string }) {
  return <motion.b key={String(value)} className={value == null ? 'na' : ''} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .12 }}>{fmt(value)}<span style={{ fontWeight: 500 }}>{value == null ? ` ${note}` : ''}</span></motion.b>
}

function whyText(view: ReturnType<typeof useView>, previewOnly: boolean) {
  if (previewOnly) return 'Camera đang bật, hình chưa được AI phân tích'
  if (view.kind === 'stale') return 'Ảnh gần nhất đã hết hiệu lực'
  if (view.kind === 'last-known') return 'Mất kết nối máy chủ, dữ liệu cũ'
  if (view.kind === 'waiting') return 'Chưa nhận quan sát nào'
  return view.caution ?? view.reason
}

/** Tile in the Notification slot of the home screen. It reflects the committed state immediately, with no intro or transition gating it. */
export function VinfastCabinTile() {
  useTick(1000)
  const view = useView(), rawCounts = useFrameCounts(), received = useE2e((s) => s.receivedPerf), state = useE2e((s) => s.state), show = useVinfast((s) => s.show)
  const src = useSourceSummary(), obsBadge = useObservationBadge()
  const setOverlay = useUi((s) => s.setOverlay)
  // a count is printed only when it belongs to the source on screen and is current; otherwise "—" (never a default 0)
  const gated = countsForSource(rawCounts, src, obsBadge)
  const counts = { child: gated?.child ?? null, person: gated?.person ?? null, pet: gated?.pet ?? null, items: null }
  const unknown = cabinStatus(view, src) === 'UNKNOWN'
  const main = unknown ? 'Chưa thể xác minh cabin' : view.headline
  const age = liveAge(state?.freshness.vision, received)
  const tone = unknown ? 'unknown' : view.tone
  const why = whyText(view, src.analysis === 'preview-only')
  return (
    <button type="button" className="vf-cabin vf-glass vf-press" data-tone={tone} data-testid="vf-cabin-tile" onClick={() => setOverlay('cabin')}
      aria-label={`Giám sát cabin: ${main}. ${why}. Mở chi tiết`}>
      <span className="head"><ScanEye {...IC} className={`vf-tone-${tone}`} />CabinSentinel · concept tích hợp<span style={{ flex: 1 }} />{age != null && <span className="vf-cap">ảnh {ageText(age)}</span>}</span>
      <span className={`main vf-tone-${tone === 'ok' ? 'ok' : tone}`} style={tone === 'ok' ? { color: 'var(--vf-text)' } : undefined}>{main}</span>
      <span className="why">{why}</span>
      <span className="counts" aria-label="Đếm theo khung gần nhất">
        {([['child', 'Trẻ em', counts.child], ['person', 'Người', counts.person], ['pet', 'Thú cưng', counts.pet], ['items', 'Đồ vật', counts.items]] as const).filter(([k]) => show[k]).map(([k, l, n]) => (
          <span key={k} className="vf-count"><Num value={n} note="" /><span>{l}</span></span>))}
      </span>
    </button>
  )
}
