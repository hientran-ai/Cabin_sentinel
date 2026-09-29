import { CameraOff, EyeOff, ScanFace } from 'lucide-react'
import type { AgentState } from '../../types/agent'

export function CabinFeed({ state }: { state: AgentState }) {
  const unavailable = state.cameraStatus !== 'OK'
  const privacyVerified = !state.objects.some((object) => object.class === 'person' && object.faceBlurred !== true)
  const evidenceUrl = safeEvidenceUrl(state.evidenceFrameUrl)
  const evidenceBlocked = Boolean(state.evidenceFrameUrl) && (!privacyVerified || !evidenceUrl)
  return <section className="panel cabin-panel" id="live-cabin">
    <div className="panel-heading"><div><span className="eyebrow">Privacy-safe evidence</span><h2>Cabin feed</h2></div><span className="privacy-chip"><EyeOff /> {privacyVerified ? 'Faces blurred at edge' : 'Evidence withheld'}</span></div>
    <div className={`feed ${unavailable ? 'feed-unavailable' : ''}`}>
      {evidenceUrl && privacyVerified && !unavailable
        ? <img src={evidenceUrl} alt="Privacy-blurred evidence from the cabin" referrerPolicy="no-referrer" />
        : unavailable
          ? <div className="feed-message"><CameraOff /><strong>Camera {state.cameraStatus.replace('_', ' ').toLowerCase()}</strong><span>No safety inference is made without a feed.</span></div>
          : evidenceBlocked
            ? <div className="feed-message"><EyeOff /><strong>Evidence withheld</strong><span>Blur verification or the evidence origin is not trusted.</span></div>
          : <div className="feed-placeholder"><div className="seat seat-left" /><div className="seat seat-right" /><ScanFace /><span>Privacy-blurred preview</span></div>}
      {!unavailable && state.objects.map((object, index) => <span className="detection" key={`${object.class}-${index}`}><strong>{object.class.replace('_', ' ')}</strong> {Math.round(object.confidence * 100)}%</span>)}
      <span className="live-chip"><span /> LIVE · EDGE</span>
    </div>
    <p className="privacy-note"><EyeOff aria-hidden="true" /> Raw face frames are neither rendered nor stored by this interface.</p>
  </section>
}

function safeEvidenceUrl(value?: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value, window.location.href)
    const apiOrigin = new URL(import.meta.env.VITE_API_BASE_URL || window.location.origin).origin
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    return url.origin === window.location.origin || url.origin === apiOrigin ? url.href : undefined
  } catch {
    return undefined
  }
}
