import type { DisplayRisk } from '../../api/fleet'
import { RiskBadge } from './RiskBadge'

/** Non-current or unavailable verdicts render as UNKNOWN, never as SAFE. */
export function DisplayRiskBadge({ risk }: { risk: DisplayRisk }) {
  return risk === 'UNKNOWN' ? <span className="risk-badge risk-error">UNKNOWN</span> : <RiskBadge state={risk} />
}
