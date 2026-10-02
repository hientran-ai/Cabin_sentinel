import { CabinSentinelClient } from '@cabinsentinel/api-client'

export const vehicleId = import.meta.env.VITE_VEHICLE_ID || 'CAR_1'
export const client = new CabinSentinelClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  credentials: 'omit',
})
export const getState = () => client.v1State(vehicleId)
export const getEvents = () => client.v1Events(vehicleId, 50)
export const getHealth = () => client.health()
