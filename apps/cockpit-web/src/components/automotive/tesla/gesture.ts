/** UI gesture thresholds only; unrelated to any vehicle/safety policy. */
export function musicSwipeTarget(expanded: boolean, offsetY: number, velocityY: number): boolean {
  if (offsetY < -48 || (offsetY < -12 && velocityY < -450)) return true
  if (offsetY > 48 || (offsetY > 12 && velocityY > 450)) return false
  return expanded
}
