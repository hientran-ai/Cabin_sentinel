// Small shared controls. Touch-first, keyboard reachable, sized in rem so they scale with the screen.
import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { SPRING_PAGE } from '../../lib/motion'
import { X } from 'lucide-react'

export function IconButton({ label, onClick, active, disabled, children, className = '', size = 'md' }: {
  label: string; onClick?: () => void; active?: boolean; disabled?: boolean; children: ReactNode; className?: string; size?: 'sm' | 'md' | 'lg'
}) {
  const s = size === 'lg' ? 'h-16 min-w-16 px-3' : size === 'sm' ? 'h-12 min-w-12 px-2' : 'h-14 min-w-14 px-2.5'
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={active ?? undefined} disabled={disabled} onClick={onClick}
      className={`cx-btn ${s} ${active ? 'is-on' : 'text-text'} ${className}`}>{children}</button>
  )
}

export function Seg<T extends string | number>({ value, options, onChange, label, disabled }: {
  value: T; options: [T, string][]; onChange: (v: T) => void; label: string; disabled?: boolean
}) {
  return (
    <div className="cx-seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={v === value} disabled={disabled} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  )
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className="cx-switch disabled:opacity-40" />
}

export function Row({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[4.5rem] items-center justify-between gap-6 border-b cx-hair py-3 last:border-b-0">
      <div className="min-w-0"><div className="text-base">{title}</div>{sub && <div className="text-xs text-text-2">{sub}</div>}</div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

/** Function panel: fills the right content area in place of the map. One panel at a time, no backdrop, no nested modal;
 *  the vehicle overview on the left and the dock stay visible. `onClose` is wired to the panel's close button. */
export function Sheet({ children, onClose, label }: { children: ReactNode; onClose: () => void; className?: string; label: string }) {
  return (
    <motion.section role="region" aria-label={label} className="absolute inset-0 z-30 flex flex-col overflow-hidden rounded-[var(--r-panel)] bg-[#19222E]"
      initial={{ opacity: 0, y: 28, scale: 0.985, filter: 'blur(.5rem)' }} animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0rem)' }} exit={{ opacity: 0, y: 12, scale: 0.99, filter: 'blur(.3rem)' }} transition={SPRING_PAGE}>
      {children}
      <button type="button" aria-label="Đóng" onClick={onClose} className="cx-btn absolute right-[var(--pad)] top-[var(--pad)] z-10 h-[var(--touch)] w-[var(--touch)] bg-white/10 text-white/70"><X size="1.9rem" /></button>
    </motion.section>
  )
}

/** Panel header: one title, optional short status chip; leaves room for the close button. */
export function PanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  return <header className="flex items-center gap-4 pl-[var(--pad)] pr-[calc(var(--touch)+var(--pad)*2)]" style={{ minHeight: 'calc(var(--touch) + var(--pad) * 2)' }}><h2 className="t-title">{title}</h2>{children}</header>
}

export function SimTag({ text }: { text: string }) {
  return <span className="cx-chip cx-sim">{text}</span>
}
