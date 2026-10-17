import { create } from 'zustand'

export type NoticeLevel = 'info' | 'warning' | 'critical'
export interface Notice { id: number; key: string; level: NoticeLevel; title: string; body?: string; at: number }

interface NotificationState {
  items: Notice[]
  push: (n: { key?: string; level: NoticeLevel; title: string; body?: string }) => void
  dismiss: (id: number) => void
  clearKey: (key: string) => void
}

let seq = 1
const LIFETIME: Record<NoticeLevel, number | null> = { info: 5000, warning: 9000, critical: null }   // critical stays until dismissed

export const useNotifications = create<NotificationState>((set, get) => ({
  items: [],
  push: ({ key, level, title, body }) => {
    const k = key ?? title
    const id = seq++
    // the same message replaces its previous copy instead of stacking
    set((s) => ({ items: [{ id, key: k, level, title, body, at: Date.now() }, ...s.items.filter((n) => n.key !== k)].slice(0, 4) }))
    const life = LIFETIME[level]
    if (life) setTimeout(() => get().dismiss(id), life)
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((n) => n.id !== id) })),
  clearKey: (key) => set((s) => ({ items: s.items.filter((n) => n.key !== key) })),
}))
export const notify = (n: Parameters<NotificationState['push']>[0]) => useNotifications.getState().push(n)
