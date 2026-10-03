import { isRecord } from './camera'

export interface PrivacyPreview { data_url: string; sequence: number; captured_at: string; width: number; height: number; detected_faces: number; masked_regions: number }

/** Presentation admission only; this never evaluates cabin risk. */
export function getPrivacyPreview(value: unknown, now = Date.now()): PrivacyPreview | undefined {
  if (!isRecord(value) || !isRecord(value.frame) || !isRecord(value.preview)) return
  const frame = value.frame, p = value.preview
  if (p.status !== 'PROCESSED' || p.method !== 'YUNET_SOFT_OVAL' || p.sequence !== frame.sequence || p.captured_at !== frame.captured_at ||
    p.width !== frame.width || p.height !== frame.height || typeof p.captured_at !== 'string' ||
    ![p.width, p.height, p.sequence].every(n => typeof n === 'number' && Number.isInteger(n) && n > 0) ||
    ![p.detected_faces, p.masked_regions].every(n => typeof n === 'number' && Number.isInteger(n) && n >= 0) ||
    typeof p.data_url !== 'string' || p.data_url.length > 8 * 1024 * 1024 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(p.data_url)) return
  const age = now - Date.parse(p.captured_at)
  if (!Number.isFinite(age) || age < 0 || age > 3000) return
  return p as unknown as PrivacyPreview
}
