// What the cabin does once a tracked class is present, per vehicle mode. Everything here goes through the existing Cabin Care
// backend (same calls as the owner phone): climate, comfort audio, operation mode. The cockpit never starts care by itself,
// never resolves an incident, and the parked-car pet screen is a simulated display (there is no exterior screen on this demo).
import type { ReactNode } from 'react'
import { Check, Music2, Podcast, Radio } from 'lucide-react'
import { TRACKS } from '../../../e2e/comfortAudio'
import { STEP_VI, stepText } from '../../../e2e/CareSheet'
import { useE2e } from '../../../e2e/store'
import { useUi } from '../../../store/uiStore'
import { useVehicle } from '../../../store/vehicleStore'
import { GPaw } from './glyphs'
import { useCarUi } from './carUi'
import { IC, Switch } from './parts'

const ADULT: { id: string; title: string; sub: string; grad: string; real: boolean }[] = [
  { id: 'off', title: 'Không bật nhạc', sub: 'Mặc định; chỉ gợi ý nhạc khi bạn chọn', grad: 'linear-gradient(150deg,#26374c,#182a42)', real: false },
  { id: 'ambient', title: 'Nhạc thư giãn', sub: 'Không lời · phát thật trong trình duyệt', grad: 'linear-gradient(150deg,#2fb7a6,#31508f)', real: true },
  { id: 'music_app', title: 'Ứng dụng nhạc', sub: 'Mở ứng dụng để chọn bài · mô phỏng', grad: 'linear-gradient(150deg,#8f5bf0,#d85aa8)', real: false },
  { id: 'podcast_app', title: 'Podcast', sub: 'Mở ứng dụng podcast · mô phỏng', grad: 'linear-gradient(150deg,#f19a3a,#d9503f)', real: false },
]
const CHILD: { id: string; title: string; sub: string }[] = [
  { id: 'off', title: 'Không bật âm thanh', sub: 'Mặc định; chọn rõ một bài nếu muốn phát' },
  { id: 'twinkle', title: TRACKS.twinkle.label, sub: 'Giai điệu dân gian, tự tổng hợp' },
  { id: 'brahms', title: TRACKS.brahms.label, sub: 'Brahms 1868, tự tổng hợp' },
]

function Plan() {
  const care = useE2e((s) => s.state?.care)
  if (care?.status !== 'ACTIVE') return null
  return <ul className="vf-plan" aria-label="Kế hoạch backend đang chạy">{care.plan.map((s) => <li key={s.tool}><Check {...IC} size={20} aria-hidden /><b>{STEP_VI[s.tool] ?? s.tool}</b><span>{stepText(s)}</span></li>)}</ul>
}

function Ladder({ lines }: { lines: [string, string, 'live' | 'idea'][] }) {
  return <ol className="vf-ladder" aria-label="Thang xử lý theo thời gian">{lines.map(([t, x, k]) => <li key={t + x} className={k}><time>{t}</time><span>{x}</span><em>{k === 'live' ? 'đã có' : 'đề xuất'}</em></li>)}</ol>
}

function Card({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return <section className="vf-ract"><h4>{title}{sub && <small>{sub}</small>}</h4>{children}</section>
}

/** Adult (camping): choose the sound, Tesla-style cards. Opening the music app uses the existing media screen. */
export function AdultActions() {
  const music = useCarUi((s) => s.adultMusic), set = useCarUi((s) => s.set), ui = useUi()
  return (
    <Card title="Khi có người lớn nghỉ trong xe" sub="chọn nhạc trước khi bật chế độ">
      <div className="vf-music3" role="radiogroup" aria-label="Nhạc trong chế độ cắm trại">
        {ADULT.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={music === m.id} className="vf-press" onClick={() => set({ adultMusic: m.id })}>
            <span className="cv" style={{ background: m.grad }} aria-hidden>{m.id === 'ambient' ? <Radio {...IC} size={30} /> : m.id === 'music_app' ? <Music2 {...IC} size={30} /> : <Podcast {...IC} size={30} />}</span>
            <span className="t">{m.title}</span><small>{m.sub}</small>
          </button>))}
      </div>
      <div className="vf-ractrow"><button type="button" className="vf-btn vf-press" onClick={() => ui.setOverlay('media')}>Mở ứng dụng nhạc</button>
        <span className="vf-note">Điều hoà giữ mức bạn chọn. Chủ xe vẫn nhận cảnh báo.</span></div>
      <Plan />
    </Card>
  )
}

/** Child: calm care started from the cabin. Real synthesised lullabies only; copyrighted nursery songs stay off until licensed. */
export function ChildActions({ on, canStart, onToggle }: { on: boolean; canStart: boolean; onToggle: (on: boolean) => void }) {
  const music = useCarUi((s) => s.childMusic), set = useCarUi((s) => s.set)
  return (
    <Card title="Khi có trẻ em trong xe" sub="dỗ bé nhẹ nhàng, không thay người lớn trông trẻ">
      <div className="vf-ractrow"><Switch checked={on} label="Dỗ bé" disabled={!on && !canStart} onChange={onToggle} /><span className="vf-rlabel">{on ? 'Đang dỗ bé' : canStart ? 'Bật điều hoà êm và nhạc ru' : 'Chưa bật được: máy chủ chưa cho phép lúc này'}</span></div>
      <div className="vf-chips3" role="radiogroup" aria-label="Nhạc dỗ bé">
        {CHILD.map((m) => <button key={m.id} type="button" role="radio" aria-checked={music === m.id} className="vf-press" onClick={() => set({ childMusic: m.id })}><span className="t">{m.title}</span><small>{m.sub}</small></button>)}
        <button type="button" role="radio" aria-checked="false" aria-disabled="true" className="vf-press off"><span className="t">Ca khúc thiếu nhi (Baby Shark…)</span><small>Có bản quyền: cần giấy phép hoặc bản thu riêng</small></button>
      </div>
      <Plan />
      <Ladder lines={[['0 s', 'Cảnh báo chủ xe trên điện thoại, còi và tin nhắn theo luật', 'live'], ['sau N giây', 'Tự bật dỗ bé nếu chủ xe đã đồng ý trước và chưa phản hồi', 'live'], ['luôn luôn', 'Cảnh báo không tắt, chỉ đóng sự cố khi có người kiểm tra cabin', 'live'], ['sau đó', 'Đèn nháy và loa ngoài, rồi gọi hỗ trợ theo chính sách', 'idea']]} />
    </Card>
  )
}

/** Pet: Tesla-style parked-car screen preview (simulated) + keep-climate through Cabin Care. */
export function PetActions({ on }: { on: boolean }) {
  const name = useCarUi((s) => s.petName), kind = useCarUi((s) => s.petKind), set = useCarUi((s) => s.set)
  const temp = useVehicle((s) => s.cabinTemperature), battery = useVehicle((s) => s.batteryLevel)
  const shown = name.trim() || 'Thú cưng'
  return (
    <Card title="Khi có thú cưng trong xe" sub="màn hình đỗ xe báo người đi qua rằng thú cưng đang nghỉ ngơi">
      <div className="vf-petrow">
        <div className={`vf-petscreen ${on ? 'on' : ''}`} data-testid="vf-petscreen" aria-label="Màn hình khi đỗ xe (mô phỏng)">
          <GPaw size={56} className="paw" />
          <p className="m">Đừng lo! {shown} đang nghỉ ngơi</p>
          <p className="d">{temp.toFixed(0)}°</p>
          <small>{on ? 'Điều hoà đang giữ nhiệt độ' : 'Chế độ đang tắt'}</small>
        </div>
        <div className="vf-petform">
          <label>Tên thú cưng<input value={name} maxLength={16} onChange={(e) => set({ petName: e.target.value })} aria-label="Tên thú cưng" /></label>
          <div className="vf-seg" role="radiogroup" aria-label="Loại thú cưng">{([['dog', 'Chó'], ['cat', 'Mèo']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => set({ petKind: k })}>{l}</button>)}</div>
          <ul className="vf-rules"><li>Cửa sổ khoá khi chế độ bật</li><li>Báo về điện thoại khi pin còn 20%</li><li>Không bật khi pin dưới 20% {battery < 20 && <b>(pin hiện {battery}%)</b>}</li></ul>
        </div>
      </div>
      <Plan />
      <Ladder lines={[['0 s', 'Giữ điều hoà ở nhiệt độ mục tiêu, màn hình hiện lời nhắn', 'live'], ['0 s', 'Cảnh báo chủ xe nếu cabin nóng theo luật xe đỗ', 'live'], ['pin 20%', 'Báo điện thoại và nhắc chủ xe quay lại', 'idea'], ['sau đó', 'Còi hoặc đèn nháy khi nhiệt độ vượt ngưỡng', 'idea']]} />
    </Card>
  )
}

