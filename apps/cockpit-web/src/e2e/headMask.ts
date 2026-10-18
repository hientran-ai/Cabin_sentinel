/** Display privacy only. A missing/invalid region requires full-frame masking, never an empty mask. */
export type MaskRect = [number, number, number, number]
export function headMaskRegions(detections: readonly { class?: string; bbox?: unknown }[], width: number, height: number): MaskRect[] | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || !detections.length) return null
  const regions: MaskRect[] = []
  for (const detection of detections) {
    if (!['person', 'dog', 'cat', 'pet', 'pet_unknown'].includes(detection.class ?? '')) return null
    const box = detection.bbox
    if (!Array.isArray(box) || box.length !== 4 || !box.every(v => typeof v === 'number' && Number.isFinite(v))) return null
    const [x1, y1, x2, y2] = box as MaskRect
    if (x2 <= x1 || y2 <= y1) return null
    const dx = (x2 - x1) * .15, head = (y2 - y1) * .4, dy = head * .15
    const rect: MaskRect = [Math.max(0, Math.floor(x1 - dx)), Math.max(0, Math.floor(y1 - dy)), Math.min(width, Math.ceil(x2 + dx)), Math.min(height, Math.ceil(y1 + head + dy))]
    if (rect[2] <= rect[0] || rect[3] <= rect[1]) return null
    regions.push(rect)
  }
  return regions
}
