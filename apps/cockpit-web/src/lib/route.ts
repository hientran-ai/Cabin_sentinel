// The two page-level views of the VinFast demo (the judge page and the car screen alone) as real history entries:
// entering pushes one, leaving pushes the other, and the browser Back/Forward buttons walk between them. No page reload, so a camera
// or a running scenario survives the switch.
import { useSyncExternalStore } from 'react'
import { goHome, layerOpen } from './layers'

export type PageView = 'demo' | 'cockpit'
const EVENT = 'cs:view'

export const currentView = (): PageView => (new URLSearchParams(location.search).get('view') === 'cockpit' ? 'cockpit' : 'demo')

export function navigateView(view: PageView) {
  if (currentView() === view) return
  const go = () => {
    const url = new URL(location.href)
    if (view === 'cockpit') url.searchParams.set('view', 'cockpit'); else url.searchParams.delete('view')
    history.pushState({ cs: 'view' }, '', url)
    window.dispatchEvent(new Event(EVENT))
    window.scrollTo?.(0, 0)
  }
  // an open layer owns the newest history entry: take it off first (and wait for the browser to finish) so the new entry lands in order
  if ((history.state as { cs?: string } | null)?.cs === 'layer' && layerOpen()) {
    let done = false
    const once = () => { if (done) return; done = true; removeEventListener('popstate', once); go() }
    addEventListener('popstate', once)
    setTimeout(once, 400)
    goHome()
  } else go()
}

function subscribe(cb: () => void) {
  addEventListener('popstate', cb); addEventListener(EVENT, cb)
  return () => { removeEventListener('popstate', cb); removeEventListener(EVENT, cb) }
}
export const usePageView = (): PageView => useSyncExternalStore(subscribe, currentView, () => 'demo')
