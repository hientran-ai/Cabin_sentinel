import { useEffect } from 'react'
import { useVehicle } from '../store/vehicleStore'
import { useNavigation } from '../store/navigationStore'
import { useMedia } from '../store/mediaStore'
import { useCabin } from '../store/cabinStore'
import { BRANDS, step } from '../lib/vehicleSimulation'

/** Drives the whole simulated car at 10 Hz: speed, energy, charging, position on the map, media progress. */
export function useVehicleSimulation() {
  useEffect(() => {
    let last = performance.now()
    const started = last
    const timer = setInterval(() => {
      const now = performance.now()
      const dt = Math.min(0.5, (now - last) / 1000)
      last = now
      const v = useVehicle.getState()
      const patch = step(v, { t: (now - started) / 1000, dt, spec: BRANDS[v.brand] })
      if (Object.keys(patch).length) v.apply(patch)
      const speed = patch.speed ?? v.speed
      if (speed > 0.1) useNavigation.getState().advance(((speed / 3.6) * dt) * (v.gear === 'R' ? -0.2 : 1))
      useMedia.getState().tick(dt)
      useCabin.getState().refresh()
    }, 100)
    return () => clearInterval(timer)
  }, [])
}
