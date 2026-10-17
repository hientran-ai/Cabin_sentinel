import { describe, it, expect } from 'vitest'
import { settingsAction } from './settingsAction'

describe('Tesla settings dispatch boundary', () => {
  it('maps supported choices to the existing simulator fields', () => {
    expect(settingsAction('headlights:on')).toEqual({ kind: 'vehicle', patch: { headlights: 'on' } })
    expect(settingsAction('steering:comfort')).toEqual({ kind: 'vehicle', patch: { steeringMode: 'comfort' } })
    expect(settingsAction('regen:low')).toEqual({ kind: 'vehicle', patch: { regenLevel: 'low' } })
    expect(settingsAction('units:imperial')).toEqual({ kind: 'ui', patch: { units: 'imperial' } })
    expect(settingsAction('appearance:light')).toEqual({ kind: 'ui', patch: { appearance: 'light' } })
  })
  it('keeps brightness in the existing readable 40..100 range', () => {
    expect(settingsAction('brightness', 0)).toEqual({ kind: 'ui', patch: { brightness: 40 } })
    expect(settingsAction('brightness', 150)).toEqual({ kind: 'ui', patch: { brightness: 100 } })
    expect(settingsAction('brightness', 63.4)).toEqual({ kind: 'ui', patch: { brightness: 63 } })
    expect(settingsAction('brightness', NaN)).toEqual({ kind: 'notice' })
  })
  it.each(['unlock','walk-up-unlock','child-lock','parking-brake','power-off','autosteer','headlights:parking','units:unknown'])('never turns unsupported or safety control %s into a state write', action => {
    expect(settingsAction(action)).toEqual({ kind: 'notice' })
  })
})
