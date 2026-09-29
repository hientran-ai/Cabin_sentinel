import { Camera, Car, LockKeyhole, Thermometer } from 'lucide-react'
import type { AgentState } from '../../types/agent'

function SensorCard({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone?: string }) {
  return <article className="sensor-card">
    <span className={`sensor-icon ${tone ?? ''}`}>{icon}</span>
    <div><span className="eyebrow">{label}</span><strong>{value}</strong><small>{detail}</small></div>
  </article>
}

export function SensorGrid({ state }: { state: AgentState }) {
  return <div className="sensor-grid">
    <SensorCard icon={<Thermometer />} label="Cabin temperature" value={`${state.sensors.temperatureC.toFixed(1)}°C`} detail={state.sensors.temperatureC >= 35 ? 'Above safe threshold' : 'Within monitored range'} tone={state.sensors.temperatureC >= 35 ? 'danger' : 'brand'} />
    <SensorCard icon={<Car />} label="Engine" value={state.sensors.engine} detail={state.sensors.engine === 'ON' ? 'Vehicle is running' : 'Vehicle is stationary'} />
    <SensorCard icon={<LockKeyhole />} label="Doors" value={state.sensors.doorsLocked ? 'LOCKED' : 'UNLOCKED'} detail={state.sensors.doorsLocked ? 'All doors secured' : 'Cabin accessible'} />
    <SensorCard icon={<Camera />} label="Camera" value={state.cameraStatus.replace('_', ' ')} detail={state.cameraStatus === 'OK' ? 'Privacy blur active' : 'Safety cannot be verified'} tone={state.cameraStatus === 'OK' ? 'brand' : 'danger'} />
  </div>
}
