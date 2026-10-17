import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Appearance, CameraView, Language, Overlay, Units, VehicleTab } from '../types/vehicle'
import { translate, type StringKey } from '../i18n/strings'

export type CarView = 'threeQuarter' | 'side' | 'top' | 'rear'

interface UiState {
  // preferences (persisted)
  appearance: Appearance
  brightness: number // 40..100
  language: Language
  units: Units
  paint: Record<'tesla' | 'vinfast', string>
  // session
  overlay: Overlay
  vehicleTab: VehicleTab
  mediaExpanded: boolean
  cameraView: CameraView
  carView: CarView
  carViewNonce: number
  devOpen: boolean
  /** true on the end-to-end page: cabin data comes from the backend, never from the mock adapter */
  e2e: boolean
  /** which half the quick-control centre was pulled from */
  controlSide: 'driver' | 'passenger'
  /** home desktop: which pane is widened to 2/3 (null = thirds). Shared so the dock knows whether the music panel is open */
  paneWide: 'drive' | 'map' | 'music' | null
  setOverlay: (o: Overlay) => void
  toggleOverlay: (o: Exclude<Overlay, null>) => void
  set: (p: Partial<Omit<UiState, 'set' | 'setOverlay' | 'toggleOverlay' | 'resetCarView'>>) => void
  resetCarView: (v?: CarView) => void
}

export const useUi = create<UiState>()(persist((set, get) => ({
  appearance: 'auto', brightness: 100, language: 'vi', units: 'metric', paint: { tesla: 'white', vinfast: 'grey' },
  overlay: null, vehicleTab: 'quick', mediaExpanded: false, cameraView: 'rear', carView: 'threeQuarter', carViewNonce: 0, devOpen: false, e2e: false, controlSide: 'driver', paneWide: null,
  setOverlay: (overlay) => set({ overlay }),
  toggleOverlay: (o) => set({ overlay: get().overlay === o ? null : o }),
  set: (p) => set(p),
  resetCarView: (v) => set((s) => ({ carView: v ?? 'threeQuarter', carViewNonce: s.carViewNonce + 1 })),
}), {
  name: 'cockpit-ui-v1',
  partialize: (s) => ({ appearance: s.appearance, brightness: s.brightness, language: s.language, units: s.units, paint: s.paint }),
}))

export function useT() {
  const lang = useUi((s) => s.language)
  return (key: StringKey) => translate(lang, key)
}
