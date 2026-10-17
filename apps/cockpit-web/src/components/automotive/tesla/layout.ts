/** Preserve the original 1920 × 1200 geometry, including inside the end-to-end demo column. */
export function fitArtboard(width: number, height: number) {
  const scale = Math.max(0, Math.min(width / 1920, height / 1200))
  return { scale, x: (width - 1920 * scale) / 2, y: (height - 1200 * scale) / 2 }
}
