// Vehicle Modes screen. Camping uses the existing Cabin Care backend (same call as the cabin sheet). Baby is monitoring only.
// Pet and Car Wash are SIMULATED display modes: they send no command and never change the cabin risk rules.
import type { ReactNode } from 'react'
import { api } from '../../../e2e/api'
import { unlock } from '../../../e2e/comfortAudio'
import { useE2e } from '../../../e2e/store'
import { useUi } from '../../../store/uiStore'
import { useVehicle } from '../../../store/vehicleStore'
import { useView } from '../../../e2e/hooks'
import { Check, X as XIcon } from 'lucide-react'
import { GBaby, GCarWash, GPaw, GTent } from './glyphs'
import { useFrameCounts } from './useVinfast'
import { MODES, washBlockers, useCarUi, type CarMode } from './carUi'
import { IC, Panel, Seg, SimChip, Switch } from './parts'
import { AdultActions, ChildActions, PetActions } from './VinfastCareActions'

const ICON: Record<CarMode, (p: { size?: number }) => ReactNode> = { camping: GTent, baby: GBaby, pet: GPaw, wash: GCarWash }
const LEVELS: [number, string][] = [[0, 'Tắt'], [2, 'Thấp'], [4, 'Vừa'], [6, 'Cao']]
const levelOf = (enabled: boolean, fan: number) => (!enabled ? 0 : fan <= 2 ? 2 : fan <= 4 ? 4 : 6)
const LEVEL_TEXT = (l: number) => LEVELS.find(([n]) => n === l)?.[1] ?? '—'
const n0 = (x: number | null) => (x == null ? '—' : String(x))

/** Decorative scenes (not data). Each one is a small night/day vignette tinted by the mode accent. */
function Scene({ mode }: { mode: CarMode }) {
  const stars = [[28, 22, 1.6], [70, 40, 1.2], [118, 16, 1.8], [176, 34, 1.2], [232, 20, 1.6], [286, 46, 1.2], [340, 18, 1.4]] as const
  return (
    <svg className="vf-scene" viewBox="0 0 380 190" role="img" aria-hidden preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`sky-${mode}`} x1="0" y1="0" x2="0" y2="1">
          {mode === 'camping' && <><stop offset="0" stopColor="#0b1d44" /><stop offset="1" stopColor="#2b4a86" /></>}
          {mode === 'baby' && <><stop offset="0" stopColor="#14336e" /><stop offset="1" stopColor="#3b78c9" /></>}
          {mode === 'pet' && <><stop offset="0" stopColor="#0f3a46" /><stop offset="1" stopColor="#2f8f86" /></>}
          {mode === 'wash' && <><stop offset="0" stopColor="#0c3a6b" /><stop offset="1" stopColor="#38a5d8" /></>}
        </linearGradient>
        <radialGradient id="glow-warm" cx=".5" cy=".6" r=".6"><stop offset="0" stopColor="#ffd37a" stopOpacity=".9" /><stop offset="1" stopColor="#ffd37a" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="380" height="190" fill={`url(#sky-${mode})`} />
      {mode !== 'wash' && stars.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={.55 + (i % 3) * .15} />)}
      {mode === 'camping' && <>
        <path d="M0 150 Q70 118 140 140 T290 132 T380 144 V190 H0z" fill="#0a1f45" opacity=".9" />
        <path d="M0 168 Q90 146 180 162 T380 158 V190 H0z" fill="#07173a" />
        <circle cx="318" cy="46" r="17" fill="#f3f0dc" /><circle cx="326" cy="41" r="15" fill="#2b4a86" opacity=".55" />
        <ellipse cx="190" cy="150" rx="86" ry="46" fill="url(#glow-warm)" />
        <path d="M120 168 190 98 260 168z" fill="#e9eef8" /><path d="M190 98 260 168H190z" fill="#c6d3ea" /><path d="M172 168 190 134 208 168z" fill="#ffcf70" />
        {([[40, 150, 30], [64, 156, 24], [334, 150, 28], [356, 158, 22]] as const).map(([x, y, h], i) => <path key={i} d={`M${x} ${y - h} ${x - h * .36} ${y} ${x + h * .36} ${y}z`} fill="#0f2a58" />)}
      </>}
      {mode === 'baby' && <>
        <path d="M190 46v26M150 62v22M230 62v22" stroke="#cfe3ff" strokeWidth="1.5" opacity=".7" />
        <path d="M190 72l4 8 9 1-6.5 6 1.7 9-8.2-4.4-8.2 4.4 1.7-9-6.5-6 9-1z" fill="#ffe08a" />
        <circle cx="150" cy="88" r="7" fill="#9cc9ff" /><circle cx="230" cy="88" r="7" fill="#9cc9ff" />
        <path d="M118 176c0-34 20-62 72-62s72 28 72 62z" fill="#0f2d62" /><path d="M130 176c0-26 18-46 60-46s60 20 60 46z" fill="#1d4a94" />
        <circle cx="190" cy="124" r="15" fill="#ffd9b8" /><path d="M176 118c4-9 24-9 28 0" stroke="#7a5230" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M180 160h20" stroke="#f4f8ff" strokeWidth="3" strokeLinecap="round" opacity=".8" />
      </>}
      {mode === 'pet' && <>
        <path d="M0 160 Q100 138 200 152 T380 146 V190 H0z" fill="#0d3a40" /><path d="M0 176 Q120 158 240 170 T380 166 V190 H0z" fill="#082a30" />
        {([[70, 150, -12], [118, 128, 8], [176, 150, -6], [236, 122, 10], [300, 142, -8]] as const).map(([x, y, r], i) => (
          <g key={i} transform={`translate(${x} ${y}) rotate(${r}) scale(${1.05 - i * .06})`} fill="#e9fbf4" opacity={.9 - i * .1}>
            <ellipse cx="0" cy="6" rx="8" ry="6.4" /><ellipse cx="-10" cy="-3" rx="3.1" ry="4.2" /><ellipse cx="-3.4" cy="-9" rx="3.1" ry="4.4" /><ellipse cx="3.4" cy="-9" rx="3.1" ry="4.4" /><ellipse cx="10" cy="-3" rx="3.1" ry="4.2" /></g>))}
        <circle cx="330" cy="40" r="14" fill="#f3f0dc" opacity=".9" />
      </>}
      {mode === 'wash' && <>
        {([[60, 120, 16], [104, 86, 10], [150, 140, 22], [212, 100, 14], [262, 132, 18], [320, 90, 12], [300, 156, 8], [90, 160, 9]] as const).map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="rgba(255,255,255,.16)" stroke="rgba(255,255,255,.7)" strokeWidth="1.5" />)}
        {([[90, 20], [160, 14], [230, 22], [300, 12]] as const).map(([x, y], i) => <path key={i} d={`M${x} ${y}v34M${x - 8} ${y + 6}v26M${x + 8} ${y + 6}v26`} stroke="#d8f0ff" strokeWidth="2.4" strokeLinecap="round" opacity=".8" />)}
        <path d="M70 180c0-24 22-40 56-40h128c34 0 56 16 56 40z" fill="#07305f" opacity=".85" />
      </>}
    </svg>
  )
}

const INFO: Record<CarMode, { title: string; lead: string; does: string[]; doesnt: string[] }> = {
  camping: { title: 'Chế độ cắm trại', lead: 'Giữ điều hòa và nhạc nền cho người lớn nghỉ trong xe đỗ.',
    does: ['Giữ điều hòa mức bạn chọn (lệnh mô phỏng)', 'Phát nhạc nền êm', 'Vẫn gửi cảnh báo cabin tới điện thoại chủ xe'],
    doesnt: ['Không đóng sự cố cabin', 'Không khoá hay mở xe', 'Không thay đổi luật cảnh báo'] },
  baby: { title: 'Chế độ bé', lead: 'Giám sát cabin khi có trẻ nhỏ trong xe. Chế độ này chỉ theo dõi và cảnh báo.',
    does: ['Hiển thị trạng thái giám sát cabin hiện tại', 'Đếm người trong khung hình gần nhất', 'Cảnh báo tới điện thoại chủ xe khi có rủi ro'],
    doesnt: ['Không thay cho việc có người lớn trông trẻ', 'Không nhận diện tuổi nếu máy chủ chưa bật bộ phân loại', 'Không đóng sự cố'] },
  pet: { title: 'Chế độ thú cưng', lead: 'Hiển thị tình trạng cabin khi thú cưng ở trong xe đỗ. Đây là chế độ mô phỏng.',
    does: ['Hiển thị nhiệt độ cabin và mức quạt', 'Đếm chó và mèo trong khung hình gần nhất', 'Giữ nguyên luật cảnh báo xe nóng'],
    doesnt: ['Không gửi lệnh tới xe', 'Không chứng minh có người trông nom', 'Không đóng sự cố'] },
  wash: { title: 'Chế độ rửa xe', lead: 'Kiểm tra xe đã đóng kín trước khi rửa. Đây là chế độ mô phỏng hiển thị.',
    does: ['Kiểm tra cửa, cửa sổ, cổng sạc và cốp', 'Chỉ cho bật khi mọi thứ đã đóng'],
    doesnt: ['Không gửi lệnh tới xe', 'Không ảnh hưởng giám sát cabin'] },
}

function Stat({ k, v, sub, tone }: { k: string; v: ReactNode; sub?: string; tone?: 'ok' | 'warn' | 'muted' }) {
  return <div className={`vf-mstat ${tone ?? ''}`}><span className="k">{k}</span><b className="v">{v}</b>{sub && <small>{sub}</small>}</div>
}

export function VinfastCarMode() {
  const { selected, petOn: petSim, washOn, adultMusic, childMusic, set } = useCarUi()
  const v = useVehicle(), ui = useUi(), care = useE2e((s) => s.state?.care), run = useE2e((s) => s.care), view = useView(), counts = useFrameCounts()
  const level = levelOf(v.climate.enabled, v.climate.fanSpeed)
  const setLevel = (n: number) => v.setClimate(n === 0 ? { enabled: false } : { enabled: true, fanSpeed: n, autoMode: false })
  const campOn = care?.status === 'ACTIVE' && care.profile === 'ADULT', babyOn = care?.status === 'ACTIVE' && care.profile === 'CHILD'
  const petBackend = care?.status === 'ACTIVE' && care.profile === 'PET', petOn = petSim || petBackend
  const blockers = washBlockers({ windows: v.windows, doors: v.doors as Record<string, boolean>, chargingPortOpen: v.chargingPortOpen, frontTrunkOpen: v.frontTrunkOpen, rearTrunkOpen: v.rearTrunkOpen })
  const active: Record<CarMode, boolean> = { camping: campOn, baby: babyOn, pet: petOn, wash: washOn }
  const badge: Record<CarMode, string> = { camping: campOn ? 'Đang bật' : 'Tắt', baby: babyOn ? 'Đang dỗ bé' : 'Chỉ giám sát', pet: petOn ? 'Đang bật' : 'Tắt', wash: washOn ? 'Đang bật' : 'Tắt' }
  const info = INFO[selected], verified = view.kind === 'current'
  const temp = `${v.cabinTemperature.toFixed(1)}°C`
  let control: ReactNode = null, stats: ReactNode = null, extra: ReactNode = null
  if (selected === 'camping') {
    control = <Switch checked={campOn} label="Chế độ cắm trại" disabled={!campOn && !care?.can_start} onChange={(on) => { unlock(); void run((s) => (on ? api.careStart(s, { profile: 'ADULT', music: adultMusic }, 'COCKPIT') : api.careStop(s, 'COCKPIT')), on ? 'Đã bật chế độ cắm trại.' : 'Đã tắt chế độ cắm trại.').then((o) => { if (on && o.ok && adultMusic !== 'ambient') ui.setOverlay('media') }) }} />
    stats = <><Stat k="Nhiệt độ cabin" v={temp} /><Stat k="Quạt" v={LEVEL_TEXT(level)} /><Stat k="Trạng thái" v={campOn ? 'Đang chạy' : care?.can_start ? 'Sẵn sàng' : 'Chưa thể bật'} tone={campOn ? 'ok' : care?.can_start ? undefined : 'muted'} sub={campOn ? 'Cabin Care · mô phỏng' : care?.can_start ? undefined : 'máy chủ chưa cho phép lúc này'} /></>
    extra = <><AdultActions /><div className="vf-mfan"><span>Mức quạt (mô phỏng)</span><Seg value={level} options={LEVELS} onChange={setLevel} label="Mức quạt" /></div></>
  }
  if (selected === 'baby') {
    control = <button type="button" className="vf-btn vf-press" onClick={() => ui.setOverlay('cabin')}>Mở giám sát cabin</button>
    stats = <><Stat k="Giám sát cabin" v={verified ? view.headline : 'Chưa xác minh'} tone={verified ? undefined : 'warn'} sub={verified ? undefined : 'dữ liệu cũ, mất kết nối hoặc chưa có khung'} /><Stat k="Người trong khung" v={n0(counts.person)} sub={counts.status === 'CURRENT' ? 'khung gần nhất' : 'chưa có số hiện tại'} /><Stat k="Nhãn trẻ em" v={counts.child == null ? 'Chưa hỗ trợ' : n0(counts.child)} tone={counts.child == null ? 'muted' : undefined} sub={counts.child == null ? 'bộ phân loại tuổi chưa bật' : 'từ bộ phân loại tuổi'} /></>
    extra = <><ChildActions on={babyOn} canStart={!!care?.can_start} onToggle={(on) => { unlock(); void run((s) => (on ? api.careStart(s, { profile: 'CHILD', music: childMusic }, 'COCKPIT') : api.careStop(s, 'COCKPIT')), on ? 'Đã bật dỗ bé (mô phỏng). Hãy quay lại xe.' : 'Đã tắt dỗ bé. Sự cố vẫn mở.') }} /><p className="vf-note">Khai báo trẻ em được thực hiện trên điện thoại chủ xe. Đó là khai báo của người dùng, không phải kết quả nhận diện tuổi từ camera. Người trong khung không có nghĩa là trẻ em.</p></>
  }
  if (selected === 'pet') {
    control = <Switch checked={petOn} label="Chế độ thú cưng" disabled={!petOn && v.batteryLevel < 20} onChange={(on) => { set({ petOn: on }); if (on && care?.can_start && care.status !== 'ACTIVE') void run((s) => api.careStart(s, { profile: 'PET' }, 'COCKPIT'), 'Đã bật chế độ thú cưng (mô phỏng).'); if (!on && petBackend) void run((s) => api.careStop(s, 'COCKPIT'), 'Đã tắt chế độ thú cưng.') }} />
    stats = <><Stat k="Nhiệt độ cabin" v={temp} /><Stat k="Chó · mèo" v={counts.pet == null ? '—' : `${n0(counts.dog)} · ${n0(counts.cat)}`} sub={counts.pet == null ? 'chưa có số hiện tại' : 'khung gần nhất'} /><Stat k="Quạt" v={LEVEL_TEXT(level)} /></>
    extra = <><PetActions on={petOn} /><div className="vf-mfan"><span>Mức quạt (mô phỏng)</span><Seg value={level} options={LEVELS} onChange={setLevel} label="Mức quạt" /></div></>
  }
  if (selected === 'wash') {
    control = <Switch checked={washOn && !blockers.length} label="Chế độ rửa xe" disabled={!washOn && !!blockers.length} onChange={(on) => { if (!on || !blockers.length) set({ washOn: on }) }} />
    stats = <><Stat k="Cửa và cửa sổ" v={blockers.length ? `${blockers.length} chưa đóng` : 'Đã đóng kín'} tone={blockers.length ? 'warn' : 'ok'} sub={blockers.length ? blockers.join(', ') : undefined} /><Stat k="Chế độ" v={washOn ? 'Đang bật' : 'Tắt'} /></>
  }
  return (
    <Panel title="Chế độ xe" label="Chế độ xe" tag={<SimChip />}>
      <div className="vf-modes" data-testid="vf-carmode">
        <div className="vf-modelist" role="radiogroup" aria-label="Chế độ xe">
          {MODES.map((m) => { const I = ICON[m.id]; return (
            <button key={m.id} type="button" role="radio" aria-checked={selected === m.id} data-mode={m.id} className={`vf-modecard vf-press ${active[m.id] ? 'live' : ''}`} onClick={() => set({ selected: m.id })}>
              <span className="disc"><I size={32} /></span><span className="nm">{m.label}</span><small>{badge[m.id]}</small></button>) })}
        </div>
        <div className="vf-modedetail vf-tabpane" key={selected} data-mode={selected}>
          <div className="vf-mhero"><Scene mode={selected} />
            <div className="txt"><h3>{info.title}</h3><p>{info.lead}</p><div className="ctl">{control}{selected !== 'baby' && <span className="st">{active[selected] ? 'Đang bật' : 'Đang tắt'}</span>}</div></div></div>
          <div className="vf-mstats">{stats}</div>
          {extra}
          <div className="vf-mcols">
            <ul className="does">{info.does.map((t) => <li key={t}><Check {...IC} size={22} aria-hidden /><span>{t}</span></li>)}</ul>
            <ul className="doesnt">{info.doesnt.map((t) => <li key={t}><XIcon {...IC} size={22} aria-hidden /><span>{t}</span></li>)}</ul>
          </div>
        </div>
      </div>
    </Panel>
  )
}
