import { CabinSentinelClient } from '@cabinsentinel/api-client'
export const vehicleId = import.meta.env.VITE_VEHICLE_ID || 'CAR_1'
export const client = new CabinSentinelClient({ baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000', credentials: 'omit' })
