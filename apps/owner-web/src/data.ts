import { CabinSentinelClient } from '@cabinsentinel/api-client'
import type { Incident, Page, Vehicle } from '@cabinsentinel/contracts'
import { incident as incidentFixture, vehicles as vehicleFixtures } from '@cabinsentinel/test-fixtures'

export const fixtureMode = import.meta.env.VITE_USE_FIXTURES === 'true'
export const client = new CabinSentinelClient({ baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000' })
export async function getVehicles(): Promise<Page<Vehicle>> { return fixtureMode ? { items: structuredClone(vehicleFixtures) } : client.vehicles() }
export async function getIncident(id: string): Promise<Incident> { return fixtureMode ? { ...incidentFixture(), id } : client.incident(id) }
