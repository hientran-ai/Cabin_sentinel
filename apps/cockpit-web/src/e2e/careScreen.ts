// Visibility of the in-car Cabin Care screen. The screen takes over the content area while a care mode (camping, baby, pet) is on,
// so it must always be possible to go back to the home screen WITHOUT stopping the mode: hiding it is a display choice only.
// The mode itself (climate, audio, alerts) keeps running on the backend plan until someone stops it.
import { create } from 'zustand'
import { useE2e } from './store'
import type { CareView } from './types'

/** One key per care run, so a new run (or an auto-start) shows the screen again and an old "hidden" choice does not stick to it. */
export const careKeyOf = (care: CareView | undefined | null): string | null =>
  care?.status === 'ACTIVE' ? `${care.incident_id ?? 'none'}:${care.started_at ?? ''}` : null

export const useCareScreen = create<{ hiddenKey: string | null }>(() => ({ hiddenKey: null }))

export const CARE_NAME: Record<string, string> = { ADULT: 'cắm trại', CHILD: 'dỗ bé', UNKNOWN: 'dỗ bé', PET: 'thú cưng' }

/** `active` = a care mode is running; `visible` = its screen is on; `hidden` = running but sent back to the home screen. */
export function useCareState() {
  const care = useE2e((s) => s.state?.care)
  const hiddenKey = useCareScreen((s) => s.hiddenKey)
  const key = careKeyOf(care)
  return { care, key, active: key !== null, visible: key !== null && hiddenKey !== key, hidden: key !== null && hiddenKey === key, name: care ? CARE_NAME[care.profile] ?? 'chăm sóc' : '' }
}

export function careScreenVisible(): boolean {
  const key = careKeyOf(useE2e.getState().state?.care)
  return key !== null && useCareScreen.getState().hiddenKey !== key
}
export function hideCareScreen() {
  const key = careKeyOf(useE2e.getState().state?.care)
  if (key) useCareScreen.setState({ hiddenKey: key })
}
export function showCareScreen() { useCareScreen.setState({ hiddenKey: null }) }
