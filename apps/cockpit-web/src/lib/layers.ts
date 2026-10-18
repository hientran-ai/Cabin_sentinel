// "Layers" = anything that covers the home screen: an app overlay (cabin monitor, car modes, map, camera...) or the Cabin Care screen.
// Each time the first layer opens we add ONE history entry; the browser Back button closes the top layer instead of leaving the page,
// and closing a layer from the UI (X, Esc, Home) takes that entry away again. No loops: Back never reopens what it closed.
import { careScreenVisible, hideCareScreen, useCareScreen } from '../e2e/careScreen'
import { useE2e } from '../e2e/store'
import { useUi } from '../store/uiStore'

export const layerOpen = () => useUi.getState().overlay !== null || careScreenVisible()

/** Closes the top-most layer. Returns false when there was nothing to close. */
export function closeTopLayer(): boolean {
  const overlay = useUi.getState().overlay
  // what is on top on screen goes first: the cabin dialog covers everything; the care screen sits above the other app panels
  if (overlay === 'cabin') { useUi.getState().setOverlay(null); return true }
  if (careScreenVisible()) { hideCareScreen(); return true }
  if (overlay !== null) { useUi.getState().setOverlay(null); return true }
  return false
}

/** Back to the plain home screen: every layer closed (a running care mode keeps running). */
export function goHome() {
  useUi.getState().setOverlay(null)
  hideCareScreen()
}

export function installLayerHistory(): () => void {
  let pushed = false
  const sync = () => {
    const open = layerOpen()
    if (open && !pushed) { history.pushState({ cs: 'layer' }, ''); pushed = true }
    else if (!open && pushed) { pushed = false; if ((history.state as { cs?: string } | null)?.cs === 'layer') history.back() }
  }
  const onPop = () => {
    if (!pushed) return
    pushed = false
    closeTopLayer()
    sync()   // another layer may still be open (overlay closed, care screen behind it): keep one entry for it
  }
  const unsubs = [useUi.subscribe(sync), useE2e.subscribe(sync), useCareScreen.subscribe(sync)]
  addEventListener('popstate', onPop)
  sync()
  return () => { unsubs.forEach((u) => u()); removeEventListener('popstate', onPop) }
}
