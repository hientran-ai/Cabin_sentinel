import { Music2, ScanEye } from 'lucide-react'
import type { ReactNode } from 'react'
import { LIBRARY, STATIONS, useMedia, type MediaSource } from '../../../store/mediaStore'
import { notify } from '../../../store/notificationStore'
import { useNavigation } from '../../../store/navigationStore'
import { useUi } from '../../../store/uiStore'
import { APP_CABIN_BG, AppImg } from './VinfastHomeWidgets'
import { Panel, Row, Seg, SimChip, Switch, Todo } from './parts'

/** Expanded player: source, stations or tracks, volume. Simulated playback, no audio output. */
export function VinfastMediaPanel() {
  const m = useMedia()
  const cur = m.current()
  const list = m.source === 'radio' ? STATIONS.map((s) => ({ id: s.id, title: s.name, sub: s.freq, hue: s.hue, on: m.stationId === s.id, pick: () => m.setStation(s.id) }))
    : LIBRARY[m.source].tracks.map((t, i) => ({ id: String(i), title: t.title, sub: t.artist, hue: t.hue, on: m.trackIdx === i, pick: () => m.set({ trackIdx: i, pos: 0, playing: true }) }))
  return (
    <Panel title="Âm nhạc" label="Âm nhạc" tag={<SimChip text="MÔ PHỎNG · không phát âm thanh" />}>
      <div className="vf-content" data-testid="vf-media-panel">
        <Seg value={m.source} options={[['radio', 'Radio'], ['bluetooth', 'Bluetooth'], ['streaming', 'Trực tuyến'], ['local', 'USB']] as [MediaSource, string][]} onChange={m.setSource} label="Nguồn phát" />
        <p className="vf-cap" style={{ margin: '10px 0' }}>Đang phát: {cur.track.title} · {cur.track.artist}</p>
        {list.map((it) => (
          <button key={it.id} type="button" className="vf-place vf-press" aria-pressed={it.on} onClick={it.pick} style={it.on ? { background: 'var(--vf-chip)' } : undefined}>
            <span className="vf-appicon sm" style={{ background: `linear-gradient(140deg, hsl(${it.hue} 70% 48%), hsl(${(it.hue + 50) % 360} 70% 32%))`, width: 56, height: 56, borderRadius: 16 }}><Music2 size={30} strokeWidth={1.5} /></span>
            <span style={{ flex: 1, textAlign: 'left' }}><span className="vf-body" style={{ display: 'block' }}>{it.title}</span><span className="vf-cap">{it.sub}</span></span>
            {it.on && <span className="vf-chip">{m.playing ? 'đang phát' : 'tạm dừng'}</span>}
          </button>))}
        <Row title="Âm lượng"><input type="range" className="vf-slider" min={0} max={10} value={m.muted ? 0 : m.volume} aria-label="Âm lượng" onChange={(e) => m.setVolume(+e.target.value)} /><Switch checked={m.muted} onChange={m.toggleMute} label="Tắt tiếng" /><span className="vf-cap">tắt</span></Row>
      </div>
    </Panel>
  )
}

/** App library: the integrated apps open, everything else says it is not integrated and sends nothing. Icons are crops of Aurora A14. */
export function VinfastLibrary() {
  const ui = useUi(), nav = useNavigation()
  const App = ({ label, icon, onClick, todo }: { label: string; icon: ReactNode; onClick?: () => void; todo?: boolean }) => (
    <button type="button" className="vf-app vf-press" aria-disabled={todo} aria-label={todo ? `${label}: chưa tích hợp` : label}
      onClick={() => { if (todo) notify({ key: 'vf-todo', level: 'info', title: `${label} · chưa tích hợp`, body: 'Không có lệnh nào được gửi tới xe hay điện thoại.' }); else onClick?.() }}>
      {icon}{label}{todo && <span className="vf-badge">Chưa tích hợp</span>}</button>)
  return (
    <Panel title="Thư viện ứng dụng" label="Thư viện ứng dụng">
      <div className="vf-content" data-testid="vf-library">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
          <App label="Camera" icon={<AppImg id="camera" />} onClick={() => ui.setOverlay('camera')} />
          <App label="Giám sát cabin" icon={<span className="vf-appicon" style={{ background: APP_CABIN_BG }}><ScanEye size={52} strokeWidth={1.5} /></span>} onClick={() => ui.setOverlay('cabin')} />
          <App label="Điện thoại" icon={<AppImg id="phone" />} onClick={() => ui.setOverlay('phone')} />
          <App label="Âm nhạc" icon={<AppImg id="music" />} onClick={() => ui.setOverlay('media')} />
          <App label="Sạc / EV" icon={<AppImg id="ev" />} onClick={() => { ui.setOverlay('map'); nav.set({ searchOpen: true }) }} />
          <App label="Cài đặt" icon={<AppImg id="settings" />} onClick={() => ui.setOverlay('vehicle')} />
          <App label="Radio" icon={<AppImg id="radio" />} onClick={() => { useMedia.getState().setSource('radio'); ui.setOverlay('media') }} />
          <App label="Apple CarPlay" icon={<AppImg id="carplay" />} todo />
          <App label="Android Auto" icon={<AppImg id="auto" />} todo />
          <App label="Drive Aids" icon={<AppImg id="driveAids" />} todo />
          <App label="Trình duyệt" icon={<AppImg id="globe" />} todo />
          <App label="Hướng dẫn" icon={<AppImg id="manual" />} todo />
          <App label="Chiếu màn hình" icon={<AppImg id="cast" />} todo />
          <App label="Vị trí xe" icon={<AppImg id="pin" />} todo />
          <App label="Dịch vụ" icon={<AppImg id="tools" />} todo />
          <App label="Giọng nói" icon={<AppImg id="voice" />} todo />
        </div>
        <p className="vf-note" style={{ marginTop: 18 }}>Các ứng dụng đánh dấu “Chưa tích hợp” chỉ là ô giữ chỗ theo bộ icon nguồn. <Todo>Không phải ứng dụng VinFast thật</Todo></p>
      </div>
    </Panel>
  )
}
