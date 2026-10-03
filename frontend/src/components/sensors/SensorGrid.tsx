import { Camera, Car, LockKeyhole, Thermometer } from 'lucide-react'
import type { AgentState } from '../../types/agent'

function SensorCard({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone?: string }) {
  return <article className="sensor-card">
    <span className={`sensor-icon ${tone ?? ''}`}>{icon}</span>
    <div><span className="eyebrow">{label}</span><strong>{value}</strong><small>{detail}</small></div>
  </article>
}

export function SensorGrid({ state, realtime = false }: { state: AgentState; realtime?: boolean }) {
  return <div className="sensor-grid">
    <SensorCard icon={<Thermometer />} label="Cabin temperature" value={state.sensors.temperatureC === null ? 'UNKNOWN' : `${state.sensors.temperatureC.toFixed(1)}°C`} detail={state.simulation ? 'Mô phỏng · vehicle scenario' : 'Reported by backend; risk is evaluated by backend'} />
    <SensorCard icon={<Car />} label="Engine" value={state.sensors.engine} detail="Reported power state; does not establish cabin safety" />
    <SensorCard icon={<LockKeyhole />} label="Doors" value={state.sensors.doorsLocked === null ? 'UNKNOWN' : state.sensors.doorsLocked ? 'LOCKED' : 'UNLOCKED'} detail="Reported door state" />
    <SensorCard icon={<Camera />} label="Camera" value={state.cameraStatus.replace('_', ' ')} detail={state.cameraStatus === 'OK' ? realtime ? 'Camera frame evidence; see capture time below' : 'Backend image evidence; no live feed supplied' : 'Evidence unavailable'} tone={state.cameraStatus === 'OK' ? 'brand' : 'danger'} />
  </div>
}
