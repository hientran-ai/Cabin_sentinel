import { useEffect, useMemo, useState } from 'react'
import { useE2e } from './store'
import { deriveView, type View } from './view'
import type { SourceAge } from './types'

/** Re-render every `ms` so ages keep counting between polls. */
export function useTick(ms = 1000) {
  const [n, setN] = useState(0)
  useEffect(() => { const id = setInterval(() => setN((x) => x + 1), ms); return () => clearInterval(id) }, [ms])
  return n
}

/** The link counts as lost after two failed polls, or when no answer arrived for 5 s (e.g. a throttled tab). */
export function connectionNow(): 'ok' | 'lost' {
  const { failures, connection, receivedPerf } = useE2e.getState()
  if (connection === 'lost' || failures >= 2) return 'lost'
  if (receivedPerf > 0 && performance.now() - receivedPerf > 5000) return 'lost'
  return 'ok'
}
export function useConnection(): 'ok' | 'lost' {
  useTick(1000)
  useE2e((s) => s.failures); useE2e((s) => s.connection); useE2e((s) => s.receivedPerf)
  return connectionNow()
}

export function useView(): View {
  const session = useE2e((s) => s.session), state = useE2e((s) => s.state)
  const connection = useConnection()
  return useMemo(() => deriveView({ hasSession: !!session, state, connection }), [session, state, connection])
}

/** Age of a source now = age when the backend answered + time since we received that answer. */
export function liveAge(src: SourceAge | undefined, receivedPerf: number): number | null {
  if (!src || src.age_s == null) return null
  return src.age_s + (receivedPerf > 0 ? (performance.now() - receivedPerf) / 1000 : 0)
}

export const clock = (iso: string | null | undefined, withSeconds = true) =>
  iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}) }) : '—'
