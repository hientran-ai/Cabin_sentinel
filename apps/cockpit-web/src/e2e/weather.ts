// Real outside temperature for the simulated parked car. Fixed demo coordinates (central Hà Nội): nothing about the visitor
// (location, IP-derived position, camera) is sent. Open-Meteo is keyless; the value only feeds the SIMULATED cabin heat model.
export const WEATHER_PLACE = { name: 'Hà Nội', lat: 21.03, lon: 105.85 }
const URL_ = `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_PLACE.lat}&longitude=${WEATHER_PLACE.lon}&current=temperature_2m&timezone=auto`

export interface Weather { temperatureC: number; observedAt: string }

export async function fetchWeather(signal?: AbortSignal): Promise<Weather> {
  const r = await fetch(URL_, { signal, cache: 'no-store' })
  if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`)
  const j = await r.json() as { current?: { temperature_2m?: number; time?: string } }
  const t = j.current?.temperature_2m
  if (typeof t !== 'number' || !Number.isFinite(t)) throw new Error('Open-Meteo returned no temperature')
  return { temperatureC: Math.min(55, Math.max(-20, t)), observedAt: j.current?.time ?? '' }
}
