import type { Appearance, Headlights, Units, VehicleState } from '../../../types/vehicle'
export type SettingsEffect = { kind: 'ui'; patch: { brightness?: number; appearance?: Appearance; units?: Units } } | { kind: 'vehicle'; patch: Partial<Pick<VehicleState, 'headlights' | 'steeringMode' | 'regenLevel'>> } | { kind: 'notice' }
export function settingsAction(action: string, value?: number): SettingsEffect {
  if (action === 'brightness' && value !== undefined && Number.isFinite(value)) return { kind: 'ui', patch: { brightness: Math.min(100, Math.max(40, Math.round(value))) } }
  const [group, choice = ''] = action.split(':')
  if (group === 'appearance' && ['light', 'dark', 'auto'].includes(choice)) return { kind: 'ui', patch: { appearance: choice as Appearance } }
  if (group === 'units' && ['metric', 'imperial'].includes(choice)) return { kind: 'ui', patch: { units: choice as Units } }
  if (group === 'headlights' && ['off', 'on', 'auto'].includes(choice)) return { kind: 'vehicle', patch: { headlights: choice as Headlights } }
  if (group === 'steering' && ['comfort', 'standard', 'sport'].includes(choice)) return { kind: 'vehicle', patch: { steeringMode: choice as VehicleState['steeringMode'] } }
  if (group === 'regen' && ['low', 'standard'].includes(choice)) return { kind: 'vehicle', patch: { regenLevel: choice as VehicleState['regenLevel'] } }
  return { kind: 'notice' }
}
