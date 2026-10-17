import type { Ref } from 'react'
import { X } from 'lucide-react'
import { NavigationMap, type MapControls } from '../navigation/NavigationMap'
import { useUi } from '../../../store/uiStore'
/** One persistent live map, shared by the source controls and route search. */
export function TeslaNavigation({ controlsRef, chargersVisible }: { controlsRef: Ref<MapControls>; chargersVisible: boolean }) {
  const ui = useUi()
  const open = ui.overlay === 'map'
  return <section className="tesla-navigation" aria-label="Tesla Navigation">
    <NavigationMap dark={ui.appearance !== 'light'} full showInterface={open} controlsRef={controlsRef} chargersVisible={chargersVisible} />
    {open && <button type="button" className="tesla-navigation-close" aria-label="Đóng bản đồ" onClick={() => ui.setOverlay(null)}><X /></button>}
  </section>
}
