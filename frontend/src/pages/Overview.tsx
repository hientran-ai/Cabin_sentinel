import { AlertTriangle, Clock3, DatabaseZap, Radio, Wifi, WifiOff } from 'lucide-react'
import { useAgent } from '../store/AgentContext'
import { RiskBadge } from '../components/status/RiskBadge'
import { SensorGrid } from '../components/sensors/SensorGrid'
import { CabinFeed } from '../components/video/CabinFeed'
import { StateAlerts } from '../components/alerts/StateAlerts'
import { ActionProgress } from '../components/actions/ActionProgress'
import { EventHistory } from '../components/EventHistory'
import { DeviceHealth } from '../components/DeviceHealth'
import { SimulationPanel } from '../components/SimulationPanel'
import { FreshnessAlert } from '../components/status/FreshnessAlert'
import { DemoAnalysisPanel } from '../components/DemoAnalysisPanel'
import { DecisionInsights } from '../components/DecisionInsights'

export function Overview() {
  const { current, history, health, connection, error, simulate, analyze, analysisPending, capabilities, effectiveDataAgeMs } = useAgent()
  return <main className="content" id="overview">
    <header className="topbar">
      <div><span className="eyebrow">Vehicle {current.vehicleId} · Main cabin</span><h1>Safety overview</h1></div>
      <div className="connection-group">
        <span className={health.edgeConnected ? 'connected' : 'disconnected'}><Radio /> Edge {health.edgeConnected ? 'connected' : 'offline'}</span>
        <span className={current.internetAvailable ? 'connected' : 'disconnected'}>{current.internetAvailable ? <Wifi /> : <WifiOff />} Internet {current.internetAvailable ? 'online' : 'offline'}</span>
      </div>
    </header>
    <div className="live-announcer" aria-live="assertive" aria-atomic="true">Current risk state: {current.riskState}. {current.reason}</div>
    {connection !== 'CONNECTED' && <div className="connection-alert"><DatabaseZap /> Reconnecting to Edge. Last known risk state remains visible.</div>}
    <FreshnessAlert dataAgeMs={effectiveDataAgeMs} />
    {error && <div className="connection-alert stale"><AlertTriangle /> {error}</div>}
    <StateAlerts state={current} />
    <section className={`hero-status state-${current.riskState.toLowerCase()}`}>
      <div className="hero-status-copy"><span className="eyebrow">Backend-assigned risk state</span><RiskBadge state={current.riskState} large /><h2>{current.reason}</h2><div className="rule-line"><span>Rule <strong>{current.ruleId}</strong></span><span><Clock3 /> Updated {(effectiveDataAgeMs / 1000).toFixed(1)}s ago</span></div></div>
      <div className="risk-orbit"><span>{current.riskState === 'SAFE' ? 'MONITORING' : 'ACTIVE EVENT'}</span><strong>{current.objects.length}</strong><small>objects detected</small></div>
    </section>
    <SensorGrid state={current} />
    <div className="dashboard-grid">
      <div className="primary-column"><CabinFeed state={current} /><DecisionInsights state={current} /><EventHistory events={history} /></div>
      <aside className="secondary-column">
        <section className="panel objects-panel"><div className="panel-heading"><div><span className="eyebrow">Vision output</span><h2>Detected objects</h2></div><span className="count-chip">{current.objects.length}</span></div>
          {current.objects.length ? current.objects.map((object, index) => <div className="object-row" key={`${object.class}-${index}`}><span className="object-icon">{object.class.slice(0, 1).toUpperCase()}</span><div><strong>{object.class.replace('_', ' ')}</strong><span>{object.faceBlurred ? 'Face blur verified' : 'No face data'}</span></div><strong>{Math.round(object.confidence * 100)}%</strong></div>) : <div className="empty-state">No objects reported by backend</div>}
        </section>
        <section className="panel action-panel"><div className="panel-heading"><div><span className="eyebrow">Backend action results</span><h2>Response actions</h2></div></div><ActionProgress tools={current.toolResults} /></section>
        <DeviceHealth health={{ ...health, internetAvailable: current.internetAvailable, cameraStatus: current.cameraStatus }} connection={connection} />
        {capabilities.demoAnalysis && <DemoAnalysisPanel pending={analysisPending} visionReady={health.cameraStatus === 'OK'} error={error} onAnalyze={analyze} />}
        {capabilities.simulationControls && <SimulationPanel state={current} onUpdate={simulate} />}
      </aside>
    </div>
  </main>
}
