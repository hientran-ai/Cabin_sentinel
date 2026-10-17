import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Simulated playback: titles, stations and progress only. No audio is played and nothing is streamed.
export type MediaSource = 'radio' | 'bluetooth' | 'streaming' | 'local'
export interface Station { id: string; name: string; freq: string; hue: number; tracks: Track[] }
export interface Track { title: string; artist: string; len: number; hue: number }

const T = (title: string, artist: string, len: number, hue: number): Track => ({ title, artist, len, hue })
export const STATIONS: Station[] = [
  { id: 'r1', name: 'Radio 1', freq: '91.0 FM', hue: 210, tracks: [T('Bản tin giao thông', 'Phát thanh viên', 180, 210), T('Đường về phía biển', 'Nhóm Gió Muộn', 214, 200)] },
  { id: 'r2', name: 'Radio 2', freq: '96.5 FM', hue: 28, tracks: [T('Phố thức ban mai', 'Linh Lam', 198, 28), T('Mùa hạ cuối', 'An Nhiên', 205, 40)] },
  { id: 'chill', name: 'Chill FM', freq: '104.0 FM', hue: 268, tracks: [T('Mưa trên kính xe', 'Trạm Số 9', 241, 268), T('Đêm cao tốc', 'Trạm Số 9', 205, 250)] },
  { id: 'vov1', name: 'VOV1', freq: '100.0 FM', hue: 0, tracks: [T('Thời sự', 'Đài phát thanh', 600, 0)] },
  { id: 'vovgt', name: 'VOV Giao thông', freq: '91.0 FM', hue: 140, tracks: [T('Tình hình giao thông', 'Đài phát thanh', 300, 140)] },
]
export const LIBRARY: Record<Exclude<MediaSource, 'radio'>, { device: string; tracks: Track[] }> = {
  bluetooth: { device: 'iPhone của chủ xe', tracks: [T('Chậm lại một chút', 'An Nhiên', 226, 340), T('Đồi thông', 'Nhóm Gió Muộn', 187, 150)] },
  streaming: { device: 'Danh sách: Lái xe buổi sáng', tracks: [T('Đường về phía biển', 'Nhóm Gió Muộn', 214, 212), T('Phố thức ban mai', 'Linh Lam', 198, 28), T('Mưa trên kính xe', 'Trạm Số 9', 241, 268)] },
  local: { device: 'USB · 128 bài', tracks: [T('Đêm cao tốc', 'Trạm Số 9', 205, 190), T('Mùa hạ cuối', 'An Nhiên', 205, 40)] },
}

interface MediaState {
  source: MediaSource
  stationId: string
  trackIdx: number
  pos: number
  playing: boolean
  volume: number // 0..10
  muted: boolean
  favorites: string[]
  showFavorites: boolean
  current: () => { track: Track; station?: Station; device?: string }
  setSource: (s: MediaSource) => void
  setStation: (id: string) => void
  togglePlay: () => void
  skip: (dir: 1 | -1) => void
  toggleFavorite: (id: string) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  tick: (dt: number) => void
  set: (p: Partial<MediaState>) => void
}

const tracksOf = (s: MediaState) => (s.source === 'radio' ? STATIONS.find((x) => x.id === s.stationId)!.tracks : LIBRARY[s.source].tracks)

export const useMedia = create<MediaState>()(persist((set, get) => ({
  source: 'radio', stationId: 'chill', trackIdx: 0, pos: 64, playing: true, volume: 6, muted: false, favorites: ['chill'], showFavorites: false,
  current: () => {
    const s = get(), list = tracksOf(s)
    const track = list[s.trackIdx % list.length]!
    return s.source === 'radio' ? { track, station: STATIONS.find((x) => x.id === s.stationId) } : { track, device: LIBRARY[s.source].device }
  },
  setSource: (source) => set({ source, trackIdx: 0, pos: 0, playing: true }),
  setStation: (stationId) => set({ source: 'radio', stationId, trackIdx: 0, pos: 0, playing: true }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  skip: (dir) => {
    const s = get()
    if (s.source === 'radio') {                                  // on radio, next/previous change station
      const i = STATIONS.findIndex((x) => x.id === s.stationId)
      set({ stationId: STATIONS[(i + dir + STATIONS.length) % STATIONS.length]!.id, trackIdx: 0, pos: 0, playing: true })
    } else set({ trackIdx: (s.trackIdx + dir + tracksOf(s).length) % tracksOf(s).length, pos: 0, playing: true })
  },
  toggleFavorite: (id) => set((s) => ({ favorites: s.favorites.includes(id) ? s.favorites.filter((x) => x !== id) : [...s.favorites, id] })),
  setVolume: (v) => set({ volume: Math.max(0, Math.min(10, Math.round(v))), muted: false }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  tick: (dt) => {
    const s = get()
    if (!s.playing) return
    const list = tracksOf(s), len = list[s.trackIdx % list.length]!.len
    const pos = s.pos + dt
    if (pos >= len) set({ pos: 0, trackIdx: (s.trackIdx + 1) % list.length })
    else set({ pos })
  },
  set: (p) => set(p),
}), { name: 'cockpit-media-v1', partialize: (s) => ({ volume: s.volume, favorites: s.favorites, source: s.source, stationId: s.stationId }) }))
