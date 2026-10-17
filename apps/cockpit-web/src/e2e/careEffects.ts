// The simulated car's response to a committed Cabin Care plan: climate on at the target, operation mode, cabin audio.
// It follows the backend plan only; nothing here starts or stops care by itself.
import { useEffect } from 'react'
import { useE2e } from './store'
import { useVehicle } from '../store/vehicleStore'
import { play, stop } from './comfortAudio'
import type { CareView } from './types'

const stepOf = (care: CareView | undefined, tool: string) => care?.plan.find((s) => s.tool === tool && s.status !== 'SKIPPED' && s.status !== 'failed')

export function useCareEffects() {
  const care = useE2e((s) => s.state?.care)
  const key = care?.status === 'ACTIVE' ? `${care.incident_id}:${care.started_at}` : null
  useEffect(() => {
    if (!key || !care) { stop(); return }
    const climate = stepOf(care, 'set_climate')
    if (climate) useVehicle.getState().setClimate({ enabled: true, driverTemperature: Number(climate.parameters?.target_c ?? 25), passengerTemperature: Number(climate.parameters?.target_c ?? 25) })
    const mode = stepOf(care, 'set_operation_mode')?.parameters?.mode as 'CAMP' | 'PET' | undefined
    if (mode) useE2e.getState().setSim({ mode })
    const audio = stepOf(care, 'play_comfort_audio')
    const source = String(audio?.parameters?.source ?? '')
    if (audio && source !== 'podcast_app' && source !== 'music_app') play(source); else stop()
    return () => { stop(); if (mode) useE2e.getState().setSim({ mode: 'NONE' }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
