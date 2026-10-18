import { useEffect, useMemo, useState } from 'react'
import { onThumbInfo, type ThumbInfo } from './capture'
import { useE2e } from './store'
import { badgeOfObservation, summarizeSource, type SourceBadge, type SourceSummary } from './sourceModel'

/** Badge of the newest committed observation of this session (null when it is a camera-status event or there is none). */
export function useObservationBadge(): SourceBadge | null {
  const obs = useE2e((s) => s.state?.last_observation)
  return obs && obs.event_type === 'observation' ? badgeOfObservation(obs.source) : null
}

/** The one answer to "what is being observed right now". Every screen that names the source reads this. */
export function useSourceSummary(): SourceSummary {
  const source = useE2e((s) => s.source)
  const last = useObservationBadge()
  const frameId = useE2e((s) => s.state?.last_observation?.frame_id)
  return useMemo(
    () => summarizeSource({ kind: source.kind, running: source.running, localOnly: source.localOnly, label: source.label, lastObservation: last, runId: source.runId, lastFrameId: frameId }),
    [source.kind, source.running, source.localOnly, source.label, source.runId, frameId, last],
  )
}

/** The frame the model last analysed (what the evidence viewer draws boxes on). null after the source stops. */
export function useAnalysedFrame(): ThumbInfo | null {
  const [info, setInfo] = useState<ThumbInfo | null>(null)
  useEffect(() => onThumbInfo(setInfo), [])
  return info
}
