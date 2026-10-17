// Swipe rules (PROPOSED web timing, docs/vinfast/motion-ledger.json). Pure so the boundary can be tested.
export const SWIPE_DISTANCE_PX = 96
export const SWIPE_VELOCITY_PX_MS = 0.65

/** Confirm a dismiss swipe by distance OR by flick velocity (motion reports px/s). Anything else springs back. */
export function swipeDismiss(offsetPx: number, velocityPxPerS: number): boolean {
  if (!Number.isFinite(offsetPx) || !Number.isFinite(velocityPxPerS)) return false
  const v = velocityPxPerS / 1000
  if (offsetPx <= 0) return false                       // wrong direction never dismisses
  return offsetPx >= SWIPE_DISTANCE_PX || (offsetPx > 12 && v >= SWIPE_VELOCITY_PX_MS)
}

/** A swipe must never count as the tap that acknowledges or resolves an incident. */
export function isTap(moved: number, ms: number): boolean { return moved < 10 && ms < 500 }
