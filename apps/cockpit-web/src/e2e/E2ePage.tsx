// End-to-end demo page: car cockpit, owner phone and an evidence strip, all reading ONE backend session.
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { AutomotiveDashboard } from '../components/automotive/AutomotiveDashboard'
import { useUi } from '../store/uiStore'
import { EvidencePanel } from './EvidencePanel'
import { PHONE_H, PHONE_W, PhoneFrame } from './PhoneFrame'
import { SimPanel } from './SimPanel'
import { useVehicle } from '../store/vehicleStore'
import { useCareEffects } from './careEffects'
import { startPolling, startTelemetry, stopPolling, stopTelemetry, useE2e } from './store'
import { stopSource } from './capture'
import { Chip } from './ui'

const COCKPIT_W = 120, COCKPIT_H = 75   // rem; the cockpit is designed for 1920 x 1200 (16:10) at a 16 px root
const GAP = 16, HEADER = 56

function useViewport() {
  const [s, set] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => { const f = () => set({ w: window.innerWidth, h: window.innerHeight }); addEventListener('resize', f); return () => removeEventListener('resize', f) }, [])
  return s
}

let booted: Promise<void> | null = null

/** artboardRem: cockpit design size in rem (1 rem = 16 px). Default 120 x 75 = 1920 x 1200 (SU7, Tesla); the VinFast skin passes 120 x 67.5 = 1920 x 1080. */
export function E2ePage({ dashboard, fixedArtboard = false, artboardRem = { w: COCKPIT_W, h: COCKPIT_H }, headerExtra }: { dashboard?: ReactNode; fixedArtboard?: boolean; artboardRem?: { w: number; h: number }; headerExtra?: ReactNode } = {}) {
  const { w, h } = useViewport()
  // ?view=cockpit: the car screen alone at full window size, same live session (for in-car review on a real display)
  const cockpitOnly = new URLSearchParams(location.search).get('view') === 'cockpit'
  const layout = w >= 1600 ? 'wide' : w >= 1000 ? 'stack' : 'mobile'
  const [tab, setTab] = useState<'phone' | 'cockpit' | 'evidence'>('phone')
  const service = useE2e((s) => s.service), serviceError = useE2e((s) => s.serviceError), booting = useE2e((s) => s.booting)
  const session = useE2e((s) => s.session), note = useE2e((s) => s.sessionNote)
  useCareEffects()

  useEffect(() => {
    useUi.getState().set({ e2e: true })
    useVehicle.getState().setBrand('vinfast')   // the demo car is the VinFast VF 8-inspired SUV
    booted ??= useE2e.getState().bootstrap()
    void booted.then(() => { startPolling(); startTelemetry() })
    return () => { stopPolling(); stopTelemetry(); stopSource(); useUi.getState().set({ e2e: false }); booted = null }
  }, [])

  // rows: the phone and cockpit share one row; the evidence strip peeks below it
  const rowH = Math.max(560, h - HEADER - 150)
  const phoneScale = layout === 'wide' ? Math.min(1, rowH / (PHONE_H + 8), (w * 0.3) / PHONE_W) : Math.min(1, (w - 32) / PHONE_W)
  const phoneW = Math.round(PHONE_W * phoneScale), phoneH = Math.round(PHONE_H * phoneScale)
  const cockpitW = layout === 'wide' ? w - GAP * 3 - phoneW : w - GAP * 2
  // ?view=cockpit is the spec's own viewport (V6 §1): 1 rem = 16 px, the window is the cockpit, nothing is scaled.
  const f = cockpitOnly ? 16 : layout === 'mobile' ? 16 : Math.max(5, Math.min(cockpitW / artboardRem.w, layout === 'wide' ? rowH / artboardRem.h : Infinity))
  useLayoutEffect(() => {
    const el = document.documentElement
    el.classList.add('e2e-page'); el.style.fontSize = `${fixedArtboard ? 16 : f}px`
    return () => { el.classList.remove('e2e-page'); el.style.fontSize = '' }
  }, [f, fixedArtboard])

  const cockpit = <div className="relative overflow-hidden rounded-2xl border border-line" style={{ width: Math.floor(artboardRem.w * f), height: Math.floor(artboardRem.h * f) }} data-testid="cockpit">{dashboard ?? <AutomotiveDashboard />}</div>
  const phone = <div style={{ width: phoneW, height: phoneH }}><div style={{ transform: `scale(${phoneScale})`, transformOrigin: 'top left', width: PHONE_W, height: PHONE_H }}><PhoneFrame /></div></div>

  if (cockpitOnly) return <div className="h-screen w-screen overflow-hidden bg-black"><div className="relative h-full w-full overflow-hidden" data-testid="cockpit">{dashboard ?? <AutomotiveDashboard />}</div></div>

  return (
    <div className="px-ui min-h-screen">
      <header className="flex flex-wrap items-center gap-2 px-4" style={{ minHeight: HEADER }}>
        <h1 className="text-lg font-semibold">CabinSentinel · demo đầu-cuối</h1>
        <Chip>{service?.mode ?? 'HOSTED_SIMULATION'}</Chip>
        <Chip tone={service ? (service.model.ready ? 'ok' : 'critical') : undefined}>{service ? (service.model.ready ? 'model sẵn sàng' : 'model chưa sẵn sàng') : 'đang kiểm tra máy chủ'}</Chip>
        <span className="px-mono text-text-3">{session ? `phiên ${session.id.slice(0, 8)}` : 'chưa có phiên'}</span>
        <span className="grow" />
        {headerExtra}
        <a href="?mode=playground" className="text-sm text-accent underline">Bản mock (không qua backend)</a>
      </header>
      {serviceError && <div role="alert" className="mx-4 mb-2 rounded-lg border border-critical p-3 text-sm text-critical">{serviceError}. Không có dữ liệu giả thay thế: các màn sẽ báo "chưa có dữ liệu".</div>}
      {service && !service.model.ready && <div role="alert" className="mx-4 mb-2 rounded-lg border border-critical p-3 text-sm text-critical">Model suy luận chưa sẵn sàng trên máy chủ. Không thể chạy phân tích ảnh; không dùng dữ liệu mẫu thay thế.</div>}
      {note && <div className="mx-4 mb-2 rounded-lg border border-line p-2 text-sm text-text-2">{note}</div>}
      {booting && <div className="mx-4 mb-2 text-sm text-text-2">Đang tạo phiên…</div>}

      {layout === 'mobile' ? (
        <div className="px-4 pb-8">
          <div className="mb-3 flex gap-2" role="tablist">
            {([['phone', 'Điện thoại'], ['evidence', 'Bằng chứng'], ['cockpit', 'Mô phỏng']] as const).map(([id, label]) => (
              <button key={id} role="tab" type="button" aria-selected={tab === id} aria-pressed={tab === id} className="px-btn grow" onClick={() => setTab(id)}>{label}</button>))}
          </div>
          {tab === 'phone' && <div className="flex justify-center">{phone}</div>}
          {tab === 'evidence' && <EvidencePanel />}
          {tab === 'cockpit' && <><p className="mb-3 rounded-lg border border-line p-3 text-sm text-text-2">Màn hình xe cần cửa sổ rộng từ 1000 px. Dùng laptop hoặc xoay ngang. Bạn vẫn có thể điều khiển đầu vào mô phỏng ở đây.</p><SimPanel /></>}
        </div>
      ) : (
        <main className="flex flex-col gap-4 px-4 pb-10">
          <div className={layout === 'wide' ? 'flex items-start gap-4' : 'flex flex-col items-center gap-4'}>{cockpit}{phone}</div>
          <div className="grid items-start gap-4" style={{ gridTemplateColumns: layout === 'wide' ? 'minmax(0,1fr) 420px' : 'minmax(0,1fr)' }}><EvidencePanel /><SimPanel /></div>
        </main>
      )}
    </div>
  )
}
