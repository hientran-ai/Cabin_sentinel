import { AlertCircle, AlertTriangle, CheckCircle2, CircleAlert, Info } from 'lucide-react'
import type { RiskState } from '../../types/agent'

const icons = { SAFE: CheckCircle2, NOTICE: Info, WARNING: AlertTriangle, CRITICAL: CircleAlert, ERROR: AlertCircle }

export function RiskBadge({ state, large = false }: { state: RiskState; large?: boolean }) {
  const Icon = icons[state]
  return <span className={`risk-badge risk-${state.toLowerCase()} ${large ? 'risk-badge-large' : ''}`}>
    <Icon aria-hidden="true" /> {state}
  </span>
}
