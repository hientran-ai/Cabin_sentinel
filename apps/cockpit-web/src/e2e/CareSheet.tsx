// Owner phone: Cabin Care sheet over the Cabin Noir app (Noir itself is not modified). The owner says who is inside,
// starts or stops comfort, and sees the pre-consented auto-start countdown. The alert and incident are never touched here.
import { useState } from 'react'
import { api } from './api'
import { useE2e } from './store'
import { useTick } from './hooks'
import { TRACKS, trackOf } from './comfortAudio'
import type { CareProfile, CareView } from './types'

const WHO: [CareProfile, string, string][] = [['CHILD', '🧒', 'Trẻ em'], ['ADULT', '🧑', 'Người lớn'], ['PET', '🐶', 'Thú cưng'], ['UNKNOWN', '❔', 'Không rõ']]
const ADULT_AUDIO: [string, string][] = [['ambient', TRACKS.ambient.label], ['music_app', 'Mở ứng dụng nhạc (mô phỏng)'], ['podcast_app', 'Mở podcast (mô phỏng)']]
export const STEP_VI: Record<string, string> = { set_climate: 'Điều hoà', play_comfort_audio: 'Âm thanh', show_cabin_screen: 'Màn hình trong xe', set_operation_mode: 'Chế độ xe' }
const BY_VI: Record<string, string> = { OWNER_PHONE: 'bạn bật từ điện thoại', AUTO_TIMEOUT: 'tự bật vì chưa ai phản hồi (bạn đã đồng ý trước)', COCKPIT_OCCUPANT: 'người trong xe tự bật (chưa xác minh)' }

export function stepText(s: CareView['plan'][number]): string {
  const p = s.parameters ?? {}
  if (s.status === 'SKIPPED') return 'bỏ qua: không rõ pin hoặc pin thấp'
  if (s.status === 'failed') return 'lỗi bộ điều khiển mô phỏng'
  if (s.tool === 'set_climate') return `${p.target_c} °C, quạt nhẹ`
  if (s.tool === 'play_comfort_audio') return trackOf(String(p.source))?.label ?? String(p.source)
  if (s.tool === 'set_operation_mode') return p.mode === 'CAMP' ? 'Cắm trại' : 'Thú cưng'
  if (s.tool === 'show_cabin_screen') return p.screen === 'CHILD_FRIENDLY' ? 'Giao diện cho bé' : 'Thông báo thú cưng'
  return s.tool
}

// the phone iframe shares this origin's storage: no sheet over the sign-in screen
const phoneSignedIn = () => { try { return !!localStorage.getItem('cn.token') } catch { return true } }

export function CareSheet() {
  useTick(1000)
  const care = useE2e((s) => s.state?.care)
  const run = useE2e((s) => s.care)
  const [open, setOpen] = useState(false)
  const [music, setMusic] = useState<string>('off')
  if (!care || (!care.can_start && care.status !== 'ACTIVE') || !phoneSignedIn()) return null
  const profile = care.profile
  const childLike = profile === 'CHILD' || profile === 'UNKNOWN'
  const active = care.status === 'ACTIVE'
  const pill = active ? `Cabin Care đang bật · ${childLike ? 'chăm sóc trẻ' : profile === 'ADULT' ? 'cắm trại' : 'thú cưng'}`
    : care.countdown.armed ? `Cabin Care tự bật sau ${care.countdown.remaining_s}s` : 'Cabin Care'
  const chooseMusic = music === 'off' ? 'off' : childLike ? ['twinkle', 'brahms'].includes(music) ? music : 'off' : ADULT_AUDIO.some(([id]) => id === music) ? music : 'off'

  return (
    <div className={`absolute inset-x-[10px] z-10 text-[13px] text-white ${open ? 'bottom-[86px]' : 'pointer-events-none top-[10px] flex justify-end pr-[62px]'}`} data-testid="care-sheet">
      {/* collapsed = a small round button in the phone header (left of the bell): the alert banner is pushed below the header and the incident buttons stay free; the opened sheet slides up from the tab bar */}
      {!open && (
        <button type="button" onClick={() => setOpen(true)} aria-label={pill} title={pill} className={`pointer-events-auto relative flex h-10 w-10 items-center justify-center rounded-full text-[18px] shadow-lg ${active ? 'bg-[#2f7d5b]' : care.countdown.armed ? 'bg-[#b5502c]' : 'bg-[#2a2d33]'}`}>
          <span aria-hidden>{active ? '💗' : '🛡️'}</span>
          {care.countdown.armed && !active && <span className="absolute -top-1 right-0 rounded-full bg-white px-1.5 text-[11px] font-bold text-[#b5502c]">{care.countdown.remaining_s}s</span>}
        </button>)}
      {open && (
        <div className="max-h-[560px] overflow-y-auto rounded-[22px] border border-white/10 bg-[#17191d]/95 p-4 shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center gap-2"><b className="text-[16px]">Cabin Care</b><span className="rounded bg-white/10 px-1.5 text-[10px]">MÔ PHỎNG</span>
            <span className="grow" /><button type="button" onClick={() => setOpen(false)} className="rounded-full bg-white/10 px-3 py-1">Thu gọn</button></div>

          {active ? (
            <>
              <p className="text-white/80">Đang chạy, {BY_VI[care.started_by ?? ''] ?? care.started_by}.</p>
              <ul className="mt-2 space-y-1">{care.plan.map((s) => <li key={s.tool} className="flex justify-between gap-2 rounded-lg bg-white/5 px-2 py-1.5"><span>{STEP_VI[s.tool] ?? s.tool}</span><span className="text-right text-white/70">{stepText(s)}</span></li>)}</ul>
              <button type="button" className="mt-3 w-full rounded-xl bg-white/10 py-2.5 font-semibold" onClick={() => void run((s) => api.careStop(s, 'PHONE'), 'Đã dừng Cabin Care. Sự cố vẫn mở.')}>Dừng chăm sóc</button>
            </>
          ) : (
            <>
              <div className="font-semibold">Ai đang ở trong xe?</div>
              <div className="mt-2 grid grid-cols-4 gap-1.5">{WHO.map(([id, icon, label]) => (
                <button key={id} type="button" aria-pressed={profile === id && !!care.responded_at}
                  onClick={() => void run((s) => api.careDeclare(s, id, 'PHONE'), `Đã ghi nhận: ${label}. Cảnh báo không đổi.`)}
                  className={`rounded-xl py-2 ${profile === id && care.responded_at ? 'bg-[#0a84ff] text-white' : 'bg-white/10'}`}><div className="text-[20px]">{icon}</div>{label}</button>))}</div>
              {care.suggestion && <p className="mt-3 rounded-xl bg-white/5 p-2.5 text-white/85">{care.suggestion.text}</p>}
              {(childLike || profile === 'ADULT') && (
                <label className="mt-2 flex items-center gap-2">Âm thanh
                  <select value={chooseMusic} onChange={(e) => setMusic(e.target.value)} className="grow rounded-lg bg-white/10 px-2 py-1.5">
                    <option value="off" className="text-black">Không bật âm thanh (mặc định)</option>
                    {(childLike ? [['twinkle', TRACKS.twinkle.label], ['brahms', TRACKS.brahms.label]] : ADULT_AUDIO).map(([id, label]) => <option key={id} value={id} className="text-black">{label}</option>)}
                  </select></label>)}
              <button type="button" className="mt-3 w-full rounded-xl bg-[#0a84ff] py-2.5 font-semibold text-white"
                onClick={() => void run((s) => api.careStart(s, { profile, music: profile === 'PET' || chooseMusic === 'off' ? undefined : chooseMusic }, 'PHONE'), 'Đã bật Cabin Care. Hãy quay lại xe.')}>
                {childLike ? 'Bật chăm sóc trẻ từ xa' : profile === 'ADULT' ? 'Bật chế độ cắm trại' : 'Bật chế độ thú cưng'}</button>
              <label className="mt-3 flex items-start gap-2 text-white/80">
                <input type="checkbox" checked={care.auto_consent} className="mt-0.5"
                  onChange={(e) => void run((s) => api.careConsent(s, e.target.checked, 'PHONE'), e.target.checked ? 'Đã cho phép tự bật khi bạn không phản hồi.' : 'Đã tắt tự bật. Chăm sóc chỉ bật khi có người yêu cầu.')} />
                <span>Tự bật chăm sóc nếu tôi không phản hồi trong {care.countdown.after_s} giây. {care.countdown.armed ? <b className="text-[#ffb08a]">Còn {care.countdown.remaining_s}s.</b> : care.responded_at || care.auto_consent === false ? 'Đã tạm dừng vì có người phản hồi hoặc tắt.' : 'Chỉ chạy khi dữ liệu còn mới.'}</span></label>
            </>
          )}
          <ol className="mt-3 space-y-0.5 border-t border-white/10 pt-2 text-[11px] text-white/60">
            <li>0 s · cảnh báo bạn, còi và tin nhắn mô phỏng theo luật</li>
            <li>{care.countdown.after_s} s · chưa ai phản hồi → tự bật chăm sóc (nếu bạn đã đồng ý)</li>
            <li>Luôn luôn · cảnh báo không tắt; chỉ đóng sự cố khi có người kiểm tra cabin</li>
          </ol>
          {care.notes.map((n) => <p key={n} className="mt-1 text-[11px] text-white/50">{n}</p>)}
        </div>)}
    </div>
  )
}
