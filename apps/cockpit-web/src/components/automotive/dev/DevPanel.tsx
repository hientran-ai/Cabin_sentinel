import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { useVehicle } from '../../../store/vehicleStore'
import { useNavigation } from '../../../store/navigationStore'
import { useCabin } from '../../../store/cabinStore'
import { useUi, useT } from '../../../store/uiStore'
import { notify } from '../../../store/notificationStore'
import { PLACES, START } from '../../../lib/mapConfig'
import { MOCK_SCENARIOS, type MockScenario } from '../../../lib/cabinMonitor'
import type { DoorId, Gear } from '../../../types/vehicle'
import { Switch } from '../ui'

/** Hidden simulation panel (hold the clock, or press `). Never shown in the default screen. */
export function DevPanel() {
  const t = useT()
  const v = useVehicle()
  const nav = useNavigation()
  const cabin = useCabin()
  const ui = useUi()
  const vi = ui.language === 'vi'
  const lbl = 'text-xs font-semibold uppercase tracking-wider text-text-2'
  return (
    <motion.aside aria-label={t('dev')} className="cx-panel absolute bottom-3 right-6 z-50 flex w-[27rem] flex-col gap-3 p-4 text-sm"
      initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.2 }}>
      <div className="flex items-center"><b className="text-base">{t('dev')}</b><span className="grow" /><button type="button" className="cx-btn h-9 w-9" aria-label={t('dismiss')} onClick={() => ui.set({ devOpen: false })}><X size="1.4rem" /></button></div>
      <div className="flex items-center gap-3">
        <span className={lbl}>{vi ? 'Số' : 'Gear'}</span>
        {(['P', 'R', 'N', 'D'] as Gear[]).map((g) => <button key={g} type="button" aria-pressed={v.gear === g} onClick={() => v.setGear(g)} className={`cx-btn h-9 w-9 ${v.gear === g ? 'bg-accent text-white' : 'bg-surface-2'}`}>{g}</button>)}
        <span className="grow" /><span className="text-text-2">{vi ? 'Tự chạy' : 'Auto drive'}</span><Switch checked={v.autoDrive} onChange={(x) => v.set({ autoDrive: x, speedOverride: null })} label="auto drive" />
      </div>
      <label className="flex items-center gap-3"><span className={`${lbl} w-24`}>{vi ? 'Tốc độ' : 'Speed'}</span>
        <input type="range" min={0} max={130} value={v.speedOverride ?? Math.round(v.speed)} onChange={(e) => v.set({ speedOverride: +e.target.value, autoDrive: false })} className="cx-range grow" />
        <button type="button" className="cx-btn h-8 px-2 text-xs" onClick={() => v.set({ speedOverride: null })}>{vi ? 'Tự động' : 'Auto'}</button></label>
      <label className="flex items-center gap-3"><span className={`${lbl} w-24`}>{vi ? 'Pin' : 'Battery'} {Math.round(v.batteryLevel)}%</span>
        <input type="range" min={0} max={100} value={Math.round(v.batteryLevel)} onChange={(e) => v.set({ batteryLevel: +e.target.value })} className="cx-range grow" /></label>
      <label className="flex items-center gap-3"><span className={`${lbl} w-24`}>{vi ? 'Ngoài trời' : 'Outside'} {v.outsideTemperature}°</span>
        <input type="range" min={-10} max={42} value={v.outsideTemperature} onChange={(e) => v.set({ outsideTemperature: +e.target.value })} className="cx-range grow" /></label>
      <label className="flex items-center gap-3"><span className={`${lbl} w-24`}>Cabin {v.cabinTemperature.toFixed(1)}°</span>
        <input type="range" min={10} max={50} step={0.5} value={v.cabinTemperature} onChange={(e) => v.set({ cabinTemperature: +e.target.value })} className="cx-range grow" /></label>
      <div className="flex flex-wrap items-center gap-2"><span className={lbl}>{t('doors')}</span>
        {(['frontLeft', 'frontRight', 'rearLeft', 'rearRight'] as DoorId[]).map((d) => (
          <button key={d} type="button" aria-pressed={v.doors[d]} onClick={() => v.toggleDoor(d)} className={`cx-btn h-8 px-2 text-xs ${v.doors[d] ? 'bg-warning text-white' : 'bg-surface-2'}`}>{t(d)}</button>))}
      </div>
      <div className="flex flex-wrap items-center gap-2"><span className={lbl}>{vi ? 'Thông báo' : 'Notify'}</span>
        <button type="button" className="cx-btn h-8 bg-surface-2 px-2 text-xs" onClick={() => notify({ level: 'info', title: vi ? 'Cập nhật phần mềm đã sẵn sàng (mô phỏng)' : 'Software update ready (simulated)' })}>Info</button>
        <button type="button" className="cx-btn h-8 bg-surface-2 px-2 text-xs" onClick={() => notify({ level: 'warning', title: vi ? 'Áp suất lốp sau trái thấp (mô phỏng)' : 'Rear left tyre pressure low (simulated)' })}>Warning</button>
        <button type="button" className="cx-btn h-8 bg-surface-2 px-2 text-xs text-critical" onClick={() => notify({ level: 'critical', title: vi ? 'Cảnh báo nghiêm trọng (mô phỏng)' : 'Critical alert (simulated)', body: vi ? 'Kiểm tra xe ngay' : 'Check the vehicle now' })}>Critical</button>
      </div>
      <label className="flex items-center gap-3"><span className={`${lbl} w-24`}>GPS</span>
        <select className="h-9 grow rounded-lg bg-surface-2 px-2" defaultValue="" onChange={(e) => {
          const p = e.target.value === 'start' ? START : PLACES.find((x) => x.id === e.target.value)
          if (p) nav.setPosition({ lat: p.lat, lng: p.lng }, 0)
        }}>
          <option value="" disabled>{vi ? 'Đặt vị trí xe…' : 'Set position…'}</option>
          <option value="start">Hồ Hoàn Kiếm</option>
          {PLACES.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sub}</option>)}
        </select></label>
      {!ui.e2e && <label className="flex items-center gap-3"><span className={`${lbl} w-24`}>Cabin</span>
        <select className="h-9 grow rounded-lg bg-surface-2 px-2" value={cabin.scenario} onChange={(e) => cabin.setScenario(e.target.value as MockScenario)}>
          {(Object.keys(MOCK_SCENARIOS) as MockScenario[]).map((k) => <option key={k} value={k}>{MOCK_SCENARIOS[k][ui.language]}</option>)}
        </select></label>}
      <div className="flex items-center gap-2"><span className={lbl}>{t('design')}</span>
        {(['tesla', 'vinfast'] as const).map((b) => <button key={b} type="button" aria-pressed={v.brand === b} onClick={() => v.setBrand(b)} className={`cx-btn h-8 px-2 text-xs ${v.brand === b ? 'bg-accent text-white' : 'bg-surface-2'}`}>{b === 'tesla' ? 'TESLA_MODE' : 'VINFAST_MODE'}</button>)}
      </div>
    </motion.aside>
  )
}
