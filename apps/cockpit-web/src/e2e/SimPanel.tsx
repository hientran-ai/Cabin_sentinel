// Simulator: camera source and vehicle telemetry INPUTS only. Nothing here sets a risk level, a rule or an occupant label;
// those come back from the backend. Fault buttons feed explicit inputs (camera status, provider failure, link cut).
import { useRef, useState } from 'react'
import { Camera, Film, ImageUp, Square } from 'lucide-react'
import { useVehicle } from '../store/vehicleStore'
import { CLIPS, sendStill, setCameraFault, startClip, startDevice, stopSource } from './capture'
import { linkState } from './api'
import { fetchWeather, WEATHER_PLACE } from './weather'
import { useE2e } from './store'
import { Chip } from './ui'
import type { SensorInput } from './types'

import { DEVICE_CAMERA_ENABLED } from './config'
const MODES: SensorInput['operation_mode'][] = ['NONE', 'PET', 'CAMP', 'REMOTE_START']

export function SimPanel() {
  const v = useVehicle(), sim = useE2e((s) => s.sim), setSim = useE2e((s) => s.setSim)
  const source = useE2e((s) => s.source), setSource = useE2e((s) => s.setSource)
  const newSession = useE2e((s) => s.newSession), setFault = useE2e((s) => s.setMessagingFault)
  const file = useRef<HTMLInputElement>(null)
  const [wx, setWx] = useState<string | null>(null)
  const loadWeather = async () => {
    setWx('Đang lấy…')
    try { const w = await fetchWeather(); v.set({ outsideTemperature: Math.round(w.temperatureC * 10) / 10 }); setWx(`${WEATHER_PLACE.name} ${w.temperatureC.toFixed(1)} °C (Open-Meteo, ${w.observedAt.slice(11, 16)})`) }
    catch { setWx('Không lấy được thời tiết; dùng thanh trượt.') }
  }
  const preset = (p: { temp: number; locked: boolean; gear: 'P' | 'D'; engine: boolean; driver: boolean; hvac: boolean; speed: number }) => {
    v.set({ cabinTemperature: p.temp, isLocked: p.locked, gear: p.gear, speedOverride: p.speed, autoDrive: false, climate: { ...v.climate, enabled: p.hvac } })
    setSim({ engineOn: p.engine, driverPresent: p.driver })
  }
  const lbl = 'px-k'
  return (
    <div className="px-ui flex flex-col gap-3" data-testid="simpanel">
      <h2 className="text-lg font-semibold">Mô phỏng đầu vào</h2>
      <section className="px-card p-3">
        <div className={lbl}>Nguồn camera cabin</div>
        <div className="mt-2 flex flex-col gap-2">
          {CLIPS.map((c) => (
            <button key={c.id} type="button" className="px-btn justify-start text-left" aria-pressed={source.kind === 'clip' && source.label === c.label} onClick={() => void startClip(c)}>
              <Film size={16} /><span className="min-w-0"><span className="block">{c.label}</span><span className="block text-xs font-normal opacity-80">{c.note}</span></span>
            </button>))}
          <div className="flex gap-2">
            <button type="button" className="px-btn grow" onClick={() => file.current?.click()}><ImageUp size={16} /> Tải ảnh</button>
            {DEVICE_CAMERA_ENABLED && <button type="button" className="px-btn grow" aria-pressed={source.kind === 'device'} onClick={() => void startDevice()}><Camera size={16} /> Camera máy</button>}
            <button type="button" className="px-btn" aria-label="Dừng nguồn" onClick={stopSource}><Square size={16} /></button>
          </div>
          <input ref={file} type="file" accept="image/jpeg,image/png" className="hidden" data-testid="still-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void sendStill(f); e.target.value = '' }} />
          {DEVICE_CAMERA_ENABLED
            ? <label className="flex items-start gap-2 text-xs text-text-2"><input type="checkbox" checked={source.consent} onChange={(e) => setSource({ consent: e.target.checked })} className="mt-0.5" />
              Tôi đồng ý dùng camera của máy này: mỗi giây một khung hình được gửi tới máy chủ demo để chạy model, không được lưu sau khi suy luận. Bấm ■ để tắt camera.</label>
            : <p className="text-xs text-text-2">Camera thật của thiết bị bị tắt trong bản này: khung hình có mặt người thật không được gửi tới máy chủ demo. Dùng clip mẫu hoặc ảnh bạn có quyền sử dụng, không chứa người nhận diện được.</p>}
          <p className="text-xs text-text-2">Clip phát bằng một video ẩn; mỗi giây một khung được trích, gửi và chạy model thật. Ảnh đơn chỉ là một quan sát và sẽ cũ sau 3 giây.</p>
          {source.error && <div role="alert" className="rounded-lg bg-surface-2 p-2 text-sm text-critical">{source.error}</div>}
        </div>
      </section>

      <section className="px-card p-3">
        <div className="flex items-center gap-2"><span className={lbl}>Telemetry xe</span><Chip>MÔ PHỎNG</Chip></div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="px-btn" onClick={() => preset({ temp: 40, locked: true, gear: 'P', engine: false, driver: false, hvac: false, speed: 0 })}>Đỗ, khoá, 40 °C</button>
          <button type="button" className="px-btn" onClick={() => preset({ temp: 25, locked: true, gear: 'P', engine: false, driver: false, hvac: false, speed: 0 })}>Đỗ, khoá, 25 °C</button>
          <button type="button" className="px-btn" onClick={() => preset({ temp: 25, locked: false, gear: 'D', engine: true, driver: true, hvac: true, speed: 30 })}>Đang lái, có tài xế</button>
        </div>
        <label className="mt-3 flex items-center gap-3 text-sm"><span className="w-28">Cabin {v.cabinTemperature.toFixed(1)} °C</span>
          <input type="range" min={10} max={55} step={0.5} value={v.cabinTemperature} onChange={(e) => v.set({ cabinTemperature: +e.target.value })} className="grow" aria-label="Nhiệt độ cabin mô phỏng" /></label>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          {([['Động cơ bật', sim.engineOn, (x: boolean) => setSim({ engineOn: x })], ['Cửa khoá', v.isLocked, (x: boolean) => v.set({ isLocked: x })],
            ['Tài xế có mặt', sim.driverPresent, (x: boolean) => setSim({ driverPresent: x })], ['Radar báo có người', sim.radar, (x: boolean) => setSim({ radar: x })],
            ['Điều hoà bật', v.climate.enabled, (x: boolean) => v.setClimate({ enabled: x })], ['Điều hoà lỗi', sim.hvacFault, (x: boolean) => setSim({ hvacFault: x })]] as const).map(([label, on, set]) => (
            <button key={label} type="button" aria-pressed={on} className="px-btn" onClick={() => set(!on)}>{label}</button>))}
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm"><span className="w-20">Chế độ</span>
          <select value={sim.mode} onChange={(e) => setSim({ mode: e.target.value as SensorInput['operation_mode'] })} className="h-10 grow rounded-lg border border-line bg-surface px-2">{MODES.map((m) => <option key={m}>{m}</option>)}</select></div>
        <div className="mt-2 flex items-center gap-2 text-sm"><span className="w-20">Số xe</span>
          {(['P', 'R', 'N', 'D'] as const).map((g) => <button key={g} type="button" aria-pressed={v.gear === g} className="px-btn px-3" onClick={() => v.setGear(g)}>{g}</button>)}</div>
        <div className="mt-3 border-t border-line pt-3">
          <label className="flex items-center gap-3 text-sm"><span className="w-28">Ngoài trời {v.outsideTemperature.toFixed(1)} °C</span>
            <input type="range" min={0} max={45} step={0.5} value={v.outsideTemperature} onChange={(e) => v.set({ outsideTemperature: +e.target.value })} className="grow" aria-label="Nhiệt độ ngoài trời mô phỏng" /></label>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <button type="button" className="px-btn" onClick={() => void loadWeather()}>Lấy thời tiết thật ({WEATHER_PLACE.name})</button>
            {wx && <span className="text-xs text-text-2" role="status">{wx}</span>}
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm"><span className="w-28">Tua nhanh nhiệt cabin</span>
            {[1, 10, 60].map((k) => <button key={k} type="button" aria-pressed={(v.heatScale || 1) === k} className="px-btn px-3" onClick={() => v.set({ heatScale: k })}>×{k}</button>)}</div>
          <p className="mt-2 text-xs text-text-2">Xe đỗ và khoá nóng dần về ngoài trời + 8 °C (mô hình mô phỏng, không phải đo thật). Thời tiết chỉ cấp nhiệt độ ngoài; toạ độ cố định, không gửi vị trí của bạn.</p>
        </div>
        <p className="mt-2 text-xs text-text-2">Gửi mỗi 2 giây và ngay khi đổi. Không có ô nào đặt mức rủi ro hay nhãn trẻ em.</p>
      </section>

      <section className="px-card p-3">
        <div className={lbl}>Lỗi mô phỏng</div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <button type="button" className="px-btn" aria-pressed={source.cameraFault === 'BLOCKED'} onClick={() => setCameraFault(source.cameraFault === 'BLOCKED' ? null : 'BLOCKED')}>Camera bị che</button>
          <button type="button" className="px-btn" aria-pressed={source.cameraFault === 'DISCONNECTED'} onClick={() => setCameraFault(source.cameraFault === 'DISCONNECTED' ? null : 'DISCONNECTED')}>Camera mất kết nối</button>
          <button type="button" className="px-btn" onClick={() => void setFault(true)}>Bộ gửi thông báo lỗi</button>
          <button type="button" className="px-btn" onClick={() => void setFault(false)}>Bộ gửi hoạt động lại</button>
          <button type="button" className="px-btn col-span-2" onClick={() => { linkState.cutUntil = performance.now() + 15000 }}>Ngắt trình duyệt ↔ máy chủ 15 giây</button>
        </div>
        <p className="mt-2 text-xs text-text-2">Ngắt kết nối chỉ cắt liên kết trình duyệt → backend. Nó không kiểm tra liên kết edge → cloud hay cảm biến → edge.</p>
      </section>
      <button type="button" className="px-btn" onClick={() => { stopSource(); void newSession('Đã tạo phiên mới. Dữ liệu phiên cũ đã được yêu cầu xoá khỏi máy chủ.') }}>Phiên mới</button>
    </div>
  )
}
