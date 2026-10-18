import { useUi } from '../store/uiStore'

/** Closes any car panel and brings the owner phone on the judge page into view (it flashes). Without a phone on the page (cockpit-only view) it does nothing. */
export function focusPhone(): boolean {
  const el = document.querySelector<HTMLElement>('[data-testid=phone]')
  if (!el) return false
  useUi.getState().setOverlay(null)
  setTimeout(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('cm-flash'); setTimeout(() => el.classList.remove('cm-flash'), 2600)
  }, 80)
  return true
}
