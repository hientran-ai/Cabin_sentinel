import { create } from 'zustand'
import { useUi } from '../store/uiStore'

export type CabinTab = 'overview' | 'how' | 'evidence'
export const useCabinTab = create<{ tab: CabinTab }>(() => ({ tab: 'overview' }))

/** Opens the Giám sát cabin dialog on a given tab (from the judge page, the cockpit tile, or a link inside the dialog). */
export function openCabinMonitor(tab: CabinTab = 'overview') {
  useCabinTab.setState({ tab })
  useUi.getState().setOverlay('cabin')
}
