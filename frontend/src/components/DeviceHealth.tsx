import { Camera, Cloud, Cpu, WifiOff } from 'lucide-react'
import type { ConnectionState, SystemHealth } from '../types/agent'

export function DeviceHealth({ health, connection }: { health: SystemHealth; connection: ConnectionState }) {
  const items = [
    { label: 'Backend / database', value: health.edgeConnected ? 'Connected' : 'Offline', Icon: Cpu, ok: health.edgeConnected },
    { label: 'Session polling', value: connection === 'CONNECTED' ? 'Connected' : 'Reconnecting', Icon: connection === 'CONNECTED' ? Cloud : WifiOff, ok: connection === 'CONNECTED' },
    { label: 'HTTP reachability', value: health.internetAvailable ? 'Available' : 'Unavailable', Icon: Cloud, ok: health.internetAvailable },
    { label: 'Vision model', value: health.cameraStatus.replace('_', ' '), Icon: Camera, ok: health.cameraStatus === 'OK' },
  ]
  return <section className="panel health-panel" id="health"><div className="panel-heading"><div><span className="eyebrow">System checks</span><h2>Device health</h2></div></div><div className="health-grid">{items.map(({ label, value, Icon, ok }) => <div className="health-item" key={label}><span className={ok ? 'ok' : 'bad'}><Icon /></span><div><small>{label}</small><strong>{value}</strong></div></div>)}</div></section>
}
