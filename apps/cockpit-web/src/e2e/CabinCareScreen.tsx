// In-car Cabin Care view. It fills the right content area while care is active; the vehicle overview and the dock stay.
// Copy states only what the system knows: the alert was sent (SIMULATED), the climate set point and the measured cabin
// temperature. It never says the car is cool, that someone is coming back, or that the occupant is fine.
// Starting/stopping follows the backend plan; nothing here changes the alert or the incident.
import { useEffect, useState } from 'react'
import { Fan, Music, PawPrint, Square, Tent } from 'lucide-react'
import { api } from './api'
import { useE2e } from './store'
import { audioState, onAudio, play, stop, trackOf, unlock } from './comfortAudio'
import { useVehicle } from '../store/vehicleStore'
import { SimTag } from '../components/automotive/ui'

function useAudio() { const [, f] = useState(0); useEffect(() => onAudio(() => f((n) => n + 1)), []); return audioState() }

function Facts({ target, cabin, audio }: { target: number; cabin: number | null; audio?: string }) {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <span className="flex items-center gap-3 rounded-xl bg-surface-2 px-5 py-3 text-sm"><Fan size="1.8rem" className="text-accent" />Điều hoà đặt {target} °C · trong xe {cabin == null ? '—' : `${cabin.toFixed(1)} °C`}</span>
      {audio && <span className="flex items-center gap-3 rounded-xl bg-surface-2 px-5 py-3 text-sm"><Music size="1.8rem" className="text-accent" />{audio}</span>}
    </div>
  )
}

export function CabinCareScreen() {
  const care = useE2e((s) => s.state?.care)
  const run = useE2e((s) => s.care)
  const measured = useE2e((s) => s.state?.sensor_snapshot?.temperature)
  const sim = useVehicle((s) => s.cabinTemperature)
  const audio = useAudio()
  if (!care || care.status !== 'ACTIVE') return null
  const cabin = typeof measured === 'number' ? measured : sim
  const childLike = care.profile === 'CHILD' || care.profile === 'UNKNOWN'
  const source = String(care.plan.find((s) => s.tool === 'play_comfort_audio')?.parameters?.source ?? '')
  const climateOn = care.plan.some((s) => s.tool === 'set_climate' && s.status !== 'SKIPPED' && s.status !== 'failed')
  const footer = <p className="mt-auto pt-6 text-xs text-text-2">Cabin Care · hỗ trợ tạm thời, không thay thế việc người lớn quay lại xe. Cảnh báo vẫn tiếp tục.</p>

  return (
    <section className="cx-enter absolute inset-0 z-20 flex flex-col bg-surface px-16 pb-8 pt-10" data-testid={childLike ? 'care-child' : care.profile === 'PET' ? 'care-pet' : 'care-adult'} onPointerDown={unlock}>
      <div className="flex items-center gap-3 text-sm text-text-2">Cabin Care<SimTag text="MÔ PHỎNG" /></div>

      {childLike && <>
        <h2 className="mt-auto t-title">Xin chào, hãy ngồi yên nhé.</h2>
        <p className="mt-4 max-w-[48rem] text-lg text-text-2">Hệ thống đã gửi cảnh báo cho người lớn.</p>
        <Facts target={care.target_c} cabin={climateOn ? cabin : null} audio={trackOf(source)?.label} />
        {!climateOn && <p className="mt-3 text-sm text-warning">Không bật điều hoà: chưa rõ mức pin hoặc pin thấp.</p>}
        {audio.blocked && <button type="button" className="cx-btn mt-6 h-16 w-fit gap-3 bg-accent px-8 text-sm text-white" onClick={() => { unlock(); play(source) }}><Music size="1.8rem" />Chạm để bật nhạc</button>}
      </>}

      {care.profile === 'PET' && <>
        <h2 className="mt-auto flex items-center gap-4 t-title"><PawPrint size="3rem" className="text-accent" />Chế độ thú cưng đang bật</h2>
        <p className="mt-4 text-lg text-text-2">Không để trẻ em ở lại trong xe.</p>
        <Facts target={care.target_c} cabin={climateOn ? cabin : null} />
      </>}

      {care.profile === 'ADULT' && <>
        <h2 className="mt-auto flex items-center gap-4 t-title"><Tent size="3rem" className="text-accent" />Chế độ cắm trại đang bật</h2>
        <p className="mt-4 text-lg text-text-2">Giữ điều hoà và âm thanh. Chủ xe vẫn nhận cảnh báo cho đến khi kiểm tra cabin.</p>
        <Facts target={care.target_c} cabin={climateOn ? cabin : null} />
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" aria-pressed={audio.playing === 'ambient'} className={`cx-btn h-16 gap-3 px-6 text-sm ${audio.playing === 'ambient' ? 'bg-accent text-white' : 'bg-surface-2'}`}
            onClick={() => { if (audio.playing === 'ambient') stop(); else { unlock(); play('ambient') } }}><Music size="1.8rem" />{trackOf('ambient')?.label}</button>
          <button type="button" disabled className="cx-btn h-16 px-6 text-sm bg-surface-2">Ứng dụng nhạc · chưa tích hợp</button>
          <button type="button" disabled className="cx-btn h-16 px-6 text-sm bg-surface-2">Podcast · chưa tích hợp</button>
        </div>
        <button type="button" className="cx-btn mt-6 h-16 w-fit gap-3 bg-surface-2 px-6 text-sm" onClick={() => void run((s) => api.careStop(s, 'COCKPIT'), 'Đã tắt chế độ cắm trại.')}><Square size="1.6rem" />Tắt chế độ cắm trại</button>
      </>}

      {footer}
    </section>
  )
}
