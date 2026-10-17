// Geometry of the VinFast HMI artboard, in canvas px at 1920 x 1080. Mirrors docs/vinfast/geometry-ledger.json.
// SOURCE_LABEL = size printed on Aurora A06 (VF 8 Home Screen Layout); PROPOSED = our placement; the screen is not an OEM inspect file.
export const VF_W = 1920, VF_H = 1080
export const VF_ARTBOARD_REM = { w: VF_W / 16, h: VF_H / 16 } as const

export type Basis = 'SOURCE_LABEL' | 'MEASURED_FROM_REFERENCE' | 'PROPOSED'
export interface Region { id: string; x: number; y: number; w: number; h: number; basis: Basis; note?: string }

export const REGIONS: Region[] = [
  { id: 'status', x: 0, y: 0, w: 1920, h: 64, basis: 'SOURCE_LABEL', note: 'A06 "Status Bar 1920x64"' },
  { id: 'airbag', x: 1724, y: 0, w: 196, h: 64, basis: 'SOURCE_LABEL', note: 'A06 "Airbag 196 x 64"; no airbag data exists, the slot shows "no data"' },
  { id: 'ipc', x: 0, y: 64, w: 584, h: 245, basis: 'SOURCE_LABEL' },
  { id: 'prompt', x: 0, y: 309, w: 584, h: 132, basis: 'SOURCE_LABEL', note: 'overlaps car-buddy; shown only while a prompt exists' },
  { id: 'carBuddy', x: 0, y: 309, w: 584, h: 659, basis: 'PROPOSED', note: 'A06 label is 584x723 and overlaps IPC/notification; clipped to the free column height' },
  { id: 'rail', x: 0, y: 309, w: 96, h: 575, basis: 'SOURCE_LABEL' },
  { id: 'notification', x: 104, y: 724, w: 480, h: 244, basis: 'PROPOSED', note: 'A06 label 584x284; inset by the 96 px rail so both stay visible' },
  { id: 'navigation', x: 608, y: 88, w: 632, h: 856, basis: 'SOURCE_LABEL' },
  { id: 'multimedia', x: 1264, y: 88, w: 632, h: 416, basis: 'SOURCE_LABEL' },
  { id: 'launcher', x: 1264, y: 528, w: 632, h: 416, basis: 'PROPOSED', note: 'A06 shows 3 x 2 app tiles under the multimedia widget' },
  { id: 'quick', x: 0, y: 968, w: 144, h: 112, basis: 'SOURCE_LABEL' },
  { id: 'climate', x: 144, y: 968, w: 1632, h: 112, basis: 'SOURCE_LABEL' },
  { id: 'library', x: 1776, y: 968, w: 144, h: 112, basis: 'SOURCE_LABEL' },
]
export const region = (id: string): Region => REGIONS.find((r) => r.id === id)!
/** Minimum touch target on the canvas (PROPOSED, not an OEM value). */
export const MIN_TOUCH = 64

/** Uniform fit of the 1920 x 1080 artboard into its container: never stretched. */
export function fitVinfast(width: number, height: number) {
  const scale = Math.max(0, Math.min(width / VF_W, height / VF_H))
  return { scale, x: (width - VF_W * scale) / 2, y: (height - VF_H * scale) / 2 }
}
