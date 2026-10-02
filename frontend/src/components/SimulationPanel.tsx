import { useEffect, useRef, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import type { AgentState, RiskState, SimulationUpdate } from '../types/agent'

export function SimulationPanel({ state, onUpdate }: { state: AgentState; onUpdate: (update: SimulationUpdate) => Promise<void> }) {
  const [temperature, setTemperature] = useState(state.sensors.temperatureC)
  const initialized = useRef(false)
  useEffect(() => {
    if (!initialized.current) { initialized.current = true; return }
    const timer = window.setTimeout(() => { void onUpdate({ temperatureC: temperature }) }, 350)
    return () => window.clearTimeout(timer)
  }, [temperature, onUpdate])
  const scenarios: RiskState[] = ['SAFE', 'NOTICE', 'WARNING', 'CRITICAL', 'ERROR']
  const chooseScenario = (scenario: RiskState) => {
    const temperatures: Record<RiskState, number> = { SAFE: 27, NOTICE: 28.2, WARNING: 33.4, CRITICAL: 38.7, ERROR: 29.1 }
    setTemperature(temperatures[scenario])
    void onUpdate({ scenario })
  }
  return <section className="panel simulation-panel" id="simulation">
    <div className="panel-heading"><div><span className="eyebrow">Mock-first tools</span><h2><FlaskConical /> Simulation controls</h2></div><span className="sim-chip">TEST MODE</span></div>
    <label className="range-label"><span>Cabin temperature <strong>{temperature.toFixed(0)}°C</strong></span><input type="range" min="20" max="50" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} /></label>
    <div className="toggle-row"><span><strong>Engine</strong><small>Ignition state</small></span><button type="button" className={`toggle ${state.sensors.engine === 'ON' ? 'on' : ''}`} aria-pressed={state.sensors.engine === 'ON'} onClick={() => void onUpdate({ engine: state.sensors.engine === 'ON' ? 'OFF' : 'ON' })}><span />{state.sensors.engine}</button></div>
    <div className="toggle-row"><span><strong>Doors</strong><small>Central locking</small></span><button type="button" className={`toggle ${state.sensors.doorsLocked ? 'on' : ''}`} aria-pressed={state.sensors.doorsLocked} onClick={() => void onUpdate({ doorsLocked: !state.sensors.doorsLocked })}><span />{state.sensors.doorsLocked ? 'LOCKED' : 'UNLOCKED'}</button></div>
    <div className="scenario-buttons"><span>Quick scenarios</span><div>{scenarios.map((scenario) => <button className={`scenario-${scenario.toLowerCase()}`} type="button" key={scenario} onClick={() => chooseScenario(scenario)}>{scenario}</button>)}</div></div>
    <p className="sim-note">Simulation inputs never calculate risk in the browser. The selected scenario represents a backend response.</p>
  </section>
}
