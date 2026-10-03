import { CriticalModal } from '../components/alerts/CriticalModal'
import { DemoIncidentControls } from '../components/actions/DemoIncidentControls'
import { AlertTriangle, Clock3, DatabaseZap, Radio, Wifi, WifiOff } from 'lucide-react'
import { useAgent } from '../store/AgentContext'
import { RiskBadge } from '../components/status/RiskBadge'
import { SensorGrid } from '../components/sensors/SensorGrid'
import { RealtimeCabinFeed } from '../components/video/RealtimeCabinFeed'
import { StateAlerts } from '../components/alerts/StateAlerts'
import { ActionProgress } from '../components/actions/ActionProgress'
import { EventHistory } from '../components/EventHistory'
import { DeviceHealth } from '../components/DeviceHealth'
import { SimulationPanel } from '../components/SimulationPanel'
import { FreshnessAlert } from '../components/status/FreshnessAlert'
import { DemoAnalysisPanel } from '../components/DemoAnalysisPanel'
import { DecisionInsights } from '../components/DecisionInsights'

export function Overview() {
  const agent = useAgent()
  const { current, history, health, connection, error, simulate, analyze, analysisPending, capabilities, effectiveDataAgeMs, historyError, cameraTracking, monitoringMode } = agent
  const currentAvailable = current.decisionCurrent === true && effectiveDataAgeMs <= 3000 && connection === 'CONNECTED' && !analysisPending
  return <main className="content" id="overview">
    <header className="topbar">
      <div><span className="eyebrow">Vehicle {current.vehicleId} · Main cabin</span><h1>Safety overview</h1></div>
      <div className="connection-group">
        <span className={health.edgeConnected ? 'connected' : 'disconnected'}><Radio /> REST backend {health.edgeConnected ? 'connected' : 'offline'}</span>
        <span className={connection === 'CONNECTED' ? 'connected' : 'disconnected'}>{connection === 'CONNECTED' ? <Wifi /> : <WifiOff />} State API {connection === 'CONNECTED' ? 'reachable' : 'unavailable'}</span>
      </div>
    </header>
    <div className="live-announcer" aria-live="assertive" aria-atomic="true">{currentAvailable ? `Current backend risk: ${current.riskState}. ${current.reason}` : 'Current decision unavailable. Check cabin evidence.'}</div>
    {connection !== 'CONNECTED' && <div className="connection-alert"><DatabaseZap /> Backend connection unavailable. Last reported evidence is historical.</div>}
    <FreshnessAlert dataAgeMs={effectiveDataAgeMs} />
    {error && <div className="connection-alert stale"><AlertTriangle /> {error}</div>}
    {currentAvailable && <StateAlerts state={current} />}
    <section className={`hero-status state-${currentAvailable ? current.riskState.toLowerCase() : 'error'}`}>
      <div className="hero-status-copy"><span className="eyebrow">Backend-assigned risk state</span>{currentAvailable ? <RiskBadge state={current.riskState} large /> : <span className="risk-badge large">UNKNOWN</span>}<h2>{currentAvailable ? current.reason : 'Current decision unavailable'}</h2>{!currentAvailable && <p>Last backend verdict: {current.riskState} · {current.reason}</p>}<div className="rule-line"><span>Rule <strong>{current.ruleId}</strong></span><span><Clock3 /> {monitoringMode === 'CAMERA' ? 'Captured/read' : 'Evaluated'} {current.revision ? new Date(current.timestamp).toLocaleString() : 'not yet'} · data age {(effectiveDataAgeMs / 1000).toFixed(1)}s</span></div></div>
      <div className="risk-orbit"><span>{!currentAvailable ? 'UNVERIFIED' : current.riskState === 'SAFE' ? 'MONITORING' : 'BACKEND DECISION'}</span><strong>{current.objects.length}</strong><small>objects detected</small></div>
    </section>
    <CriticalModal state={{ ...current, decisionCurrent: currentAvailable }} actionPending={agent.actionPending} acknowledgementPending={agent.acknowledgementPending} allowAction={agent.capabilities.manualEmergencyActions} allowAcknowledge={agent.capabilities.acknowledgement} onAction={agent.runEmergencyActions} onAcknowledge={agent.acknowledge} incidentControls={agent.monitoringMode === 'CAMERA' ? <><button className="button secondary" disabled={!agent.cameraTracking} onClick={() => void agent.stopCamera()}>Tắt camera</button><p>Dừng capture không xác nhận cabin an toàn hoặc mở khóa. Verdict cũ là lịch sử khi data unavailable.</p></> : <DemoIncidentControls />} />
    {current.dataQuality && <p role="status">Data quality: {current.dataQuality.status} · {current.dataQuality.issues.join(', ') || 'No issues reported'}</p>}
    <p className="sim-note">Vehicle scenario and response actions: Mô phỏng (SIMULATED). Vision: model inference. {monitoringMode === 'CAMERA' ? 'Camera frame analysis demo.' : 'This is an image analysis demo.'}</p>
    {monitoringMode === 'CAMERA' && <p>Camera API trả risk, freshness và detections; không trả giá trị telemetry xe. Các ô sensor dưới đây sẽ hiển thị UNKNOWN. Risk do backend quyết định từ scenario mô phỏng.</p>}
    <SensorGrid state={current} realtime={monitoringMode === 'CAMERA'} />
    <div className="dashboard-grid">
      <div className="primary-column"><RealtimeCabinFeed state={current} /><DecisionInsights state={{ ...current, decisionCurrent: currentAvailable }} /><EventHistory events={history} error={historyError} unsupportedReason={monitoringMode === 'CAMERA' ? 'Camera contract chưa cung cấp API event history; không có audit history cho phiên này trong UI.' : undefined} /></div>
      <aside className="secondary-column">
        <section className="panel objects-panel"><div className="panel-heading"><div><span className="eyebrow">Vision output</span><h2>Detected objects</h2></div><span className="count-chip">{current.objects.length}</span></div>
          {current.objects.length ? current.objects.map((object, index) => <div className="object-row" key={`${object.class}-${index}`}><span className="object-icon">{object.class.slice(0, 1).toUpperCase()}</span><div><strong>{object.class.replace('_', ' ')}</strong><span>{object.faceBlurred ? 'Face blur verified' : 'Face blur not verified'}</span></div><strong>{Math.round(object.confidence * 100)}%</strong></div>) : <div className="empty-state">No detections reported; this alone does not establish an empty cabin</div>}
        </section>
        <section className="panel action-panel"><div className="panel-heading"><div><span className="eyebrow">Backend action results</span><h2>Response actions</h2></div></div><ActionProgress tools={current.toolResults} />{monitoringMode === 'CAMERA' && <p>Includes the latest evaluation and recorded action receipts for this camera session. Actions are never replayed for repeated frames.</p>}</section>
        <DeviceHealth health={health} connection={connection} />
        {current.riskState !== 'CRITICAL' && <DemoIncidentControls />}
        {capabilities.demoAnalysis && <DemoAnalysisPanel pending={analysisPending} visionReady={health.cameraStatus === 'OK'} disabledReason={cameraTracking ? 'Camera monitoring đang chạy; dừng camera trước khi chuyển sang upload ảnh.' : undefined} error={error} onAnalyze={analyze} />}
        {capabilities.simulationControls && <SimulationPanel state={current} onUpdate={simulate} />}
      </aside>
    </div>
  </main>
}
