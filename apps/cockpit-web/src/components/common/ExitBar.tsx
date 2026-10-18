// Shared "way out" for every full-window mode: a real <a>/<button> with a label, always on top, never inside the scaled artboard.
// Also shows that a camera is on and lets the user switch it off from here, so leaving a mode never leaves a camera running unseen.
import { ArrowLeft, VideoOff } from 'lucide-react'
import { stopSource } from '../../e2e/capture'
import { useDeviceCamera } from '../../e2e/deviceCamera'
import './exitBar.css'

export function ExitBar({ label, onExit, href, hint = 'Esc' }: { label: string; onExit?: () => void; href?: string; hint?: string }) {
  const camera = useDeviceCamera((s) => s.phase) === 'live'
  const content = <><ArrowLeft size={20} strokeWidth={2} aria-hidden /><span>{label}</span>{hint && <kbd aria-hidden>{hint}</kbd>}</>
  return (
    <div className="xb" role="navigation" aria-label="Thoát chế độ" data-testid="exit-bar">
      {href
        ? <a className="xb-btn" href={href} data-testid="exit-mode">{content}</a>
        : <button type="button" className="xb-btn" data-testid="exit-mode" onClick={onExit}>{content}</button>}
      {camera && <button type="button" className="xb-btn xb-cam" data-testid="exit-camera-off" onClick={() => stopSource()}><span className="xb-dot" aria-hidden /><VideoOff size={18} aria-hidden /><span>Camera đang bật · Tắt</span></button>}
    </div>
  )
}
