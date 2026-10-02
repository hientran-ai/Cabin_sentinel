import { AlertTriangle, Info } from 'lucide-react'
import type { AgentState } from '../../types/agent'

export function StateAlerts({ state }: { state: AgentState }) {
  if (state.riskState === 'NOTICE') return <div className="state-alert notice"><Info /><div><strong>Attention recommended</strong><span>{state.reason}</span></div></div>
  if (state.riskState === 'WARNING') return <div className="state-alert warning sticky-alert"><AlertTriangle /><div><strong>Occupant warning active</strong><span>{state.reason}</span></div></div>
  if (state.riskState === 'ERROR') return <div className="state-alert error"><AlertTriangle /><div><strong>Safety status unavailable</strong><span>{state.reason}</span></div></div>
  return null
}
