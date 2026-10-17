import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useUi } from '../../../store/uiStore'
import { useE2e } from '../../../e2e/store'
import { liveAge, useConnection } from '../../../e2e/hooks'
import { frameCounts, type FrameCounts, type TrackKey } from '../../../e2e/cabinCounts'

/** Skin-only preferences (ambient light hue). Persisted in this browser, never sent anywhere. */
export type Wallpaper = 'leaf' | 'aurora' | 'snow' | `wall-${number}`
/** Wallpapers: 'leaf' redrawn from the real display photo; the others are frames of the Aurora Vimeo clips 820393171 / 820383806. */
export const WALLPAPERS: { id: Wallpaper; label: string; thumb: string }[] = [
  { id: 'leaf', label: 'Lá VinFast', thumb: 'leaf-top.png' },
  { id: 'aurora', label: 'Cực quang', thumb: 'wall/aurora-band.jpg' },
  { id: 'snow', label: 'Núi tuyết', thumb: 'wall/snow-band.jpg' },
  ...([['Hồ đêm', 0], ['Sương núi', 1], ['Đồi xanh', 2], ['Hoàng hôn biển', 3], ['Chạng vạng', 4], ['Nước', 5], ['Thành phố', 6], ['Ánh đêm', 7]] as const)
    .map(([label, i]) => ({ id: `wall-${i}` as Wallpaper, label, thumb: `wall/thumb-${i}.jpg` })),
]
interface VinfastPrefs { ambientHue: number; setAmbientHue: (h: number) => void; wallpaper: Wallpaper; setWallpaper: (w: Wallpaper) => void; ion: boolean; setIon: (v: boolean) => void; show: Record<TrackKey, boolean>; setShow: (k: TrackKey, v: boolean) => void }
export const useVinfast = create<VinfastPrefs>()(persist((set) => ({
  ambientHue: 214, setAmbientHue: (ambientHue) => set({ ambientHue: Math.round(Math.max(0, Math.min(360, ambientHue))) }),
  wallpaper: 'leaf', setWallpaper: (wallpaper) => set({ wallpaper }), ion: false, setIon: (ion) => set({ ion }), show: { child: true, person: true, pet: true, items: true }, setShow: (k, v) => set((s) => ({ show: { ...s.show, [k]: v } })),
}), { name: 'vinfast-hmi-v1' }))

/** day/night. "auto" follows the local clock (06:00-18:00 day) and re-checks every minute. */
export function useMode(): 'light' | 'dark' {
  const appearance = useUi((s) => s.appearance)
  const [hour, setHour] = useState(() => new Date().getHours())
  useEffect(() => { const id = setInterval(() => setHour(new Date().getHours()), 60_000); return () => clearInterval(id) }, [])
  return appearance === 'light' ? 'light' : appearance === 'dark' ? 'dark' : hour >= 6 && hour < 18 ? 'light' : 'dark'
}

/** Count-per-frame of the latest accepted observation of THIS session; stale or lost link never shows as current. */
export function useFrameCounts(): FrameCounts {
  const state = useE2e((s) => s.state), session = useE2e((s) => s.session), received = useE2e((s) => s.receivedPerf)
  const connection = useConnection()
  const age = liveAge(state?.freshness.vision, received)
  const fresh = state?.freshness.vision.status === 'FRESH' && age != null && age <= (state.ttl_s?.vision ?? 3)
  return useMemo(() => frameCounts({ state, sessionId: session?.id ?? null, visionFresh: !!fresh, connection }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, session?.id, fresh, connection])
}
