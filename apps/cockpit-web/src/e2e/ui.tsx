import type { ReactNode } from 'react'
import { AlertOctagon, AlertTriangle, CircleHelp, ShieldCheck, Info } from 'lucide-react'
import type { Tone } from './view'

export const TONE_TEXT: Record<Tone, string> = { ok: 'text-ok', info: 'text-accent', warning: 'text-warning', critical: 'text-critical', unknown: 'text-text-2' }
export const TONE_ICON = { ok: ShieldCheck, info: Info, warning: AlertTriangle, critical: AlertOctagon, unknown: CircleHelp } as const

export function Chip({ children, tone, title }: { children: ReactNode; tone?: 'ok' | 'warning' | 'critical'; title?: string }) {
  return <span title={title} className={`px-chip ${tone ? `tone-${tone}` : ''}`}>{children}</span>
}
/** Labels that must stay next to anything simulated or unverified. */
export const SimBadge = () => <Chip title="Dữ liệu do bộ mô phỏng tạo ra, không phải xe thật">MÔ PHỎNG</Chip>
