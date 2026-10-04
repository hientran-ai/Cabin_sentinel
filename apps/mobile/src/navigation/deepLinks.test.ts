import { describe, expect, it } from 'vitest'
import { parseDeepLink } from './deepLinks'
import { notificationDestination } from '../push/notificationAdapter'

describe('mobile notification and deep-link flow', () => {
  it('routes an incident hint without accepting a risk verdict', () => {
    const path = notificationDestination({ incidentId: 'incident-1042' })
    expect(path).toBe('/incidents/incident-1042')
    expect(parseDeepLink(`cabinsentinel://${path.slice(1)}`)).toEqual({ screen: 'incident', incidentId: 'incident-1042' })
  })

  it('routes vehicle links and rejects unrelated destinations', () => {
    expect(parseDeepLink('cabinsentinel://vehicles/vehicle-7')).toEqual({ screen: 'vehicle', vehicleId: 'vehicle-7' })
    expect(parseDeepLink('cabinsentinel://unsafe-state/CRITICAL')).toEqual({ screen: 'home' })
  })
})
