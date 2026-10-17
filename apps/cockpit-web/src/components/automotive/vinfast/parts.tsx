// Small shared pieces of the VinFast skin. One icon family: lucide, stroke 1.6, rounded.
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { motion } from 'motion/react'
import { useUi } from '../../../store/uiStore'

export const IC = { size: 34, strokeWidth: 1.6 } as const

export function Panel({ title, label, onClose, children, className = '' }: { title: string; label: string; onClose?: () => void; children: ReactNode; tag?: ReactNode; className?: string }) {
  const close = onClose ?? (() => useUi.getState().setOverlay(null))
  // open: opacity 0->1, x 32->0, 260 ms (.2,.8,.2,1); close: 200 ms (.4,0,1,1). Alerts never go through this component.
  return (
    <motion.section role="region" aria-label={label} className={`vf-panel vf-glass ${className}`}
      initial={{ opacity: 0, x: 32 }} animate={{ opacity: 1, x: 0, transition: { duration: .26, ease: [.2, .8, .2, 1] } }} exit={{ opacity: 0, x: 32, transition: { duration: .2, ease: [.4, 0, 1, 1] } }}>
      <button type="button" className="vf-close vf-press" aria-label="Đóng" onClick={close}><X {...IC} /></button>
      <header><h2 className="vf-title">{title}</h2></header>
      {children}
    </motion.section>
  )
}

export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return <div className="vf-seg" role="radiogroup" aria-label={label}>{options.map(([v, l]) => <button key={String(v)} type="button" role="radio" aria-checked={v === value} onClick={() => onChange(v)}>{l}</button>)}</div>
}
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" className="vf-switchwrap" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}><span className="vf-switch" aria-hidden data-on={checked} style={{ background: checked ? 'var(--vf-primary)' : undefined }} /></button>
}
export function Row({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return <div className="vf-row"><div className="t"><div className="vf-body">{title}</div>{sub && <small>{sub}</small>}</div><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>{children}</div></div>
}
/** Not available on this demo vehicle: plain muted text, no tag box. */
export const Todo = ({ children = 'Chưa có' }: { children?: ReactNode }) => <span className="vf-todo">{children}</span>
/** The simulation notice lives once on the demo page header and in row descriptions; panels carry no badge. */
export const SimChip = (_: { text?: string }) => null

/** Glyphs matted out of the Aurora A13 screen (public/vinfast/icons, extracted from the reference raster as-is). `mono` glyphs are dark strokes, inverted on the dark theme. */
const MONO = new Set(['sun', 'wiper', 'door', 'defrost-f', 'fan', 'defrost-r', 'grid', 'logo'])
export function VfIcon({ n, h = 44, className = '' }: { n: 'battery' | 'sun' | 'wiper' | 'door' | 'seat-l' | 'seat-r' | 'down-l' | 'up-l' | 'down-r' | 'up-r' | 'defrost-f' | 'defrost-r' | 'fan' | 'grid' | 'logo'; h?: number; className?: string }) {
  return <img src={`${import.meta.env.BASE_URL}vinfast/icons/${n}.png`} alt="" aria-hidden draggable={false} className={`vf-ic ${MONO.has(n) ? 'mono' : ''} ${className}`} style={{ height: h, width: 'auto', display: 'block' }} />
}
