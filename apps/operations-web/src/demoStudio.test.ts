import { describe, expect, it } from 'vitest'
import type { V1DemoStatus, V1DemoVehicle } from '@cabinsentinel/contracts'
import { agoLabel, computeChecklist, ownerLink, expectedRisk, formatTemperature, pollWhenVisible, riskTone, scenarioSync } from './demoStudio'

const vehicle = (overrides: Partial<V1DemoVehicle> = {}): V1DemoVehicle => ({
  vehicle_id: 'VF8-DEMO-01', name: 'Family SUV', scenario: 'SAFE', risk_level: 'SAFE', online: true, temperature_c: 24, active_incident: null, data_source: 'SIMULATED', ...overrides,
})
const status = (vehicles: V1DemoVehicle[] = [vehicle()], recent: V1DemoStatus['notifications']['recent'] = []): V1DemoStatus => ({
  enabled: true, label: 'SIMULATED', scenarios: [], vehicles, notifications: { ntfy: true, telegram: false, recent }, last_error: null,
})
const states = (steps: ReturnType<typeof computeChecklist>) => steps.map(step => `${step.id}:${step.state}`)

describe('computeChecklist', () => {
  it('starts at step 1 on a quiet fleet, with step 6 left to a manual look at the owner site', () => {
    expect(states(computeChecklist({ status: status(), incidents: [], commands: [], devices: [] }))).toEqual([
      'critical:current', 'incident-alert:todo', 'assign-command:todo', 'resolve:todo', 'virtual-device:todo', 'owner-view:manual',
    ])
  })

  it('marks CRITICAL done, and incident+alert done only once a notification was really delivered', () => {
    const critical = status([vehicle({ scenario: 'CRITICAL', risk_level: 'CRITICAL', active_incident: 'i-1' })])
    const incident = { incident_id: 'i-1', vehicle_id: 'VF8-DEMO-01', status: 'OPEN', risk_level: 'CRITICAL', ops: { assignee: null } }
    expect(states(computeChecklist({ status: critical, incidents: [incident], commands: [], devices: [] })).slice(0, 3)).toEqual(['critical:done', 'incident-alert:current', 'assign-command:todo'])
    const delivered = status(critical.vehicles, [{ at: '2026-10-12T02:00:00Z', channel: 'ntfy', ok: true, detail: 'sent' }])
    expect(states(computeChecklist({ status: delivered, incidents: [incident], commands: [], devices: [] })).slice(0, 3)).toEqual(['critical:done', 'incident-alert:done', 'assign-command:current'])
    const failed = status(critical.vehicles, [{ at: '2026-10-12T02:00:00Z', channel: 'ntfy', ok: false, detail: 'timeout' }])
    expect(states(computeChecklist({ status: failed, incidents: [incident], commands: [], devices: [] }))[1]).toBe('incident-alert:current')
  })

  it('needs both an assignee and a horn command for step 3, and a resolved incident for step 4', () => {
    const base = { status: status([vehicle({ risk_level: 'CRITICAL', scenario: 'CRITICAL' })], [{ at: 'x', channel: 'ntfy', ok: true, detail: '' }]), devices: [] }
    const open = { incident_id: 'i-1', vehicle_id: 'VF8-DEMO-01', status: 'OPEN', risk_level: 'CRITICAL', ops: { assignee: 'admin' } }
    expect(states(computeChecklist({ ...base, incidents: [open], commands: [] }))[2]).toBe('assign-command:current')
    expect(states(computeChecklist({ ...base, incidents: [open], commands: [{ type: 'sms' }] }))[2]).toBe('assign-command:current')
    const withHorn = computeChecklist({ ...base, incidents: [open], commands: [{ type: 'horn', status: 'acknowledged' }] })
    expect(states(withHorn).slice(2, 4)).toEqual(['assign-command:done', 'resolve:current'])
    const resolved = { ...open, status: 'RESOLVED' }
    expect(states(computeChecklist({ ...base, incidents: [resolved], commands: [{ type: 'horn' }] }))[3]).toBe('resolve:done')
  })

  it('counts only an online, non-revoked virtual-web device for step 5', () => {
    const input = (devices: Array<Record<string, unknown>>) => computeChecklist({ status: status(), incidents: [], commands: [], devices })
    const stateOf = (devices: Array<Record<string, unknown>>) => input(devices).find(step => step.id === 'virtual-device')?.state
    expect(stateOf([{ online: true, firmware: 'virtual-web-1.0', status: 'active' }])).toBe('done')
    expect(stateOf([{ online: false, firmware: 'virtual-web-1.0', status: 'active' }])).not.toBe('done')
    expect(stateOf([{ online: true, firmware: 'virtual-web-1.0', status: 'revoked' }])).not.toBe('done')
    expect(stateOf([{ online: true, firmware: 'edge-2.1', status: 'active' }])).not.toBe('done')
  })

  it('does not crash before the status has loaded', () => {
    expect(computeChecklist({ status: undefined, incidents: [], commands: [], devices: [] })[0]?.state).toBe('current')
  })
})

describe('scenario state', () => {
  it('expects what the rules engine should decide for each scenario', () => {
    expect(expectedRisk('SAFE')).toEqual(['SAFE'])
    expect(expectedRisk('RAMP')).toEqual(['WARNING', 'CRITICAL'])
    expect(expectedRisk('OFFLINE')).toEqual(['UNKNOWN', 'ERROR'])
  })

  it('reports settling until the live risk catches up with the chosen scenario', () => {
    expect(scenarioSync(vehicle({ scenario: 'CRITICAL', risk_level: 'WARNING' }))).toBe('settling')
    expect(scenarioSync(vehicle({ scenario: 'CRITICAL', risk_level: 'CRITICAL' }))).toBe('synced')
    expect(scenarioSync(vehicle({ scenario: 'RAMP', risk_level: 'WARNING' }))).toBe('synced')
    expect(scenarioSync(vehicle({ scenario: 'SAFE', risk_level: 'SAFE', online: false }))).toBe('settling')
  })

  it('never treats an offline vehicle as safe: OFFLINE is synced only when the vehicle is actually offline', () => {
    expect(scenarioSync(vehicle({ scenario: 'OFFLINE', risk_level: 'SAFE', online: true }))).toBe('settling')
    expect(scenarioSync(vehicle({ scenario: 'OFFLINE', risk_level: 'ERROR', online: false }))).toBe('synced')
  })

  it('maps risk to a tone, with unknown values neutral rather than safe', () => {
    expect(riskTone('SAFE')).toBe('ok')
    expect(riskTone('warning')).toBe('warn')
    expect(riskTone('CRITICAL')).toBe('danger')
    expect(riskTone('ERROR')).toBe('neutral')
    expect(riskTone(undefined)).toBe('neutral')
  })

  it('formats temperature and shows a dash when there is none', () => {
    expect(formatTemperature(39.2)).toBe('39.2 °C')
    expect(formatTemperature(null)).toBe('—')
  })
})

describe('pollWhenVisible', () => {
  it('polls every interval while visible and stops while the tab is hidden', () => {
    let hidden = false
    const interval = pollWhenVisible(2_000, () => hidden)
    expect(interval()).toBe(2_000)
    hidden = true
    expect(interval()).toBe(false)
    hidden = false
    expect(interval()).toBe(2_000)
  })
})

describe('agoLabel and ownerLink', () => {
  const now = Date.parse('2026-10-12T03:00:00Z')
  it('describes time in Vietnamese or English', () => {
    expect(agoLabel('2026-10-12T02:59:58Z', now, true)).toBe('vừa xong')
    expect(agoLabel('2026-10-12T02:59:40Z', now, true)).toBe('20 giây trước')
    expect(agoLabel('2026-10-12T02:57:00Z', now, false)).toBe('3 min ago')
    expect(agoLabel(undefined, now, true)).toBe('')
    expect(agoLabel('not a date', now, true)).toBe('')
  })
  it('builds owner deep links from the owner entry URL', () => {
    expect(ownerLink('https://cabin.example/overview', '/cabin#live-camera')).toBe('https://cabin.example/cabin#live-camera')
    expect(ownerLink('', '/cabin#live-camera')).toBe('/cabin#live-camera')
  })
})
