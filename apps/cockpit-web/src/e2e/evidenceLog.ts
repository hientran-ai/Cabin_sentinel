// Evidence log: one line per frame or committed decision that this browser actually saw from the backend.
// It records what the pipeline did (model file, detections, timings, committed risk). It stores no image, no bbox pixels and no
// personal data, lives only in this browser (localStorage, capped) and can be exported or erased by the user.
// It is operating evidence, not an accuracy measurement: accuracy needs ground-truth labels, which a live run does not have.
import { create } from 'zustand'
import { useE2e } from './store'
import type { ServerState } from './types'

const KEY = 'cabin-evidence-log-v1'
export const LOG_MAX = 2000

export interface LogEntry {
  n: number
  /** client wall clock when this browser read the state */
  at: string
  session: string
  kind: 'frame' | 'decision'
  frame_id: string | null
  observed_at: string | null
  source: string | null
  accepted: boolean | null
  camera_status: string | null
  /** class, confidence and age label per detection; no coordinates */
  dets: { c: string; p: number; age?: string | null }[]
  age_classifier: string | null
  model_file: string | null
  model_sha: string | null
  infer_ms: number | null
  server_ms: number | null
  capture_age_ms: number | null
  revision: number
  risk: string
  rule: string
  occupancy: string
  current: boolean
}

export function entryFrom(state: ServerState, n: number, kind: LogEntry['kind'], now = new Date()): LogEntry {
  const o = state.last_observation
  const t = o?.timings_ms
  return {
    n, at: now.toISOString(), session: state.session_id.slice(0, 8), kind,
    frame_id: o?.frame_id ?? null, observed_at: o?.observed_at ?? null, source: o?.source_label ?? o?.source ?? null,
    accepted: o ? o.accepted : null, camera_status: o?.event_type === 'camera_status' ? o.camera_status ?? 'UNKNOWN' : state.camera_status,
    dets: (o?.vision?.detections ?? []).map((d) => ({ c: d.class, p: Math.round(d.confidence * 100) / 100, age: d.age_group ?? null })),
    age_classifier: o?.vision?.age_classifier?.status ?? state.model?.age_classifier ?? null,
    model_file: o?.model?.file ?? state.model?.file ?? null, model_sha: (o?.model?.sha256 ?? state.model?.sha256 ?? '').slice(0, 12) || null,
    infer_ms: t?.infer_detector ?? null, server_ms: t?.server_total ?? null, capture_age_ms: o?.capture_age_ms ?? null,
    revision: state.revision, risk: state.risk_level, rule: state.rule_id, occupancy: state.occupancy_state, current: state.decision_current,
  }
}

/** Append at most one entry per frame and one per revision; returns the same array when nothing is new. */
export function appendFrom(list: LogEntry[], state: ServerState, now = new Date()): LogEntry[] {
  const o = state.last_observation
  const last = list[list.length - 1]
  const seenFrame = o ? list.some((e) => e.session === state.session_id.slice(0, 8) && e.frame_id === o.frame_id) : true
  const seenRev = list.some((e) => e.session === state.session_id.slice(0, 8) && e.revision === state.revision)
  const n = (last?.n ?? 0) + 1
  if (!seenFrame) return [...list, entryFrom(state, n, 'frame', now)].slice(-LOG_MAX)
  if (!seenRev) return [...list, entryFrom(state, n, 'decision', now)].slice(-LOG_MAX)
  return list
}

export interface LogSummary {
  entries: number; frames: number; rejected: number; cameraFaults: number
  withPerson: number; withPet: number; withChildLabel: number; ageLabelFrames: number
  risk: Record<string, number>; notCurrent: number
  inferMeanMs: number | null; inferP95Ms: number | null; serverMeanMs: number | null
  firstAt: string | null; lastAt: string | null; spanS: number | null
  models: string[]
}

const pct = (xs: number[], q: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)] ?? null }
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** Descriptive counts only. Nothing here is precision, recall or accuracy. */
export function summarize(list: LogEntry[]): LogSummary {
  const frames = list.filter((e) => e.kind === 'frame')
  const accepted = frames.filter((e) => e.accepted && !e.camera_status?.match(/BLOCKED|DISCONNECTED/))
  const infer = accepted.map((e) => e.infer_ms).filter((x): x is number => x != null)
  const server = accepted.map((e) => e.server_ms).filter((x): x is number => x != null)
  const risk: Record<string, number> = {}
  for (const e of list) risk[e.risk] = (risk[e.risk] ?? 0) + 1
  const first = list[0]?.at ?? null, last = list[list.length - 1]?.at ?? null
  const ageFrames = accepted.filter((e) => e.age_classifier === 'ok')
  return {
    entries: list.length, frames: frames.length, rejected: frames.filter((e) => e.accepted === false).length,
    cameraFaults: frames.filter((e) => /BLOCKED|DISCONNECTED/.test(e.camera_status ?? '')).length,
    withPerson: accepted.filter((e) => e.dets.some((d) => d.c === 'person')).length,
    withPet: accepted.filter((e) => e.dets.some((d) => d.c === 'dog' || d.c === 'cat')).length,
    withChildLabel: ageFrames.filter((e) => e.dets.some((d) => d.c === 'person' && d.age === 'child')).length,
    ageLabelFrames: ageFrames.length,
    risk, notCurrent: list.filter((e) => !e.current).length,
    inferMeanMs: mean(infer), inferP95Ms: pct(infer, 0.95), serverMeanMs: mean(server),
    firstAt: first, lastAt: last, spanS: first && last ? (Date.parse(last) - Date.parse(first)) / 1000 : null,
    models: [...new Set(list.map((e) => (e.model_file ? `${e.model_file}${e.model_sha ? ` · ${e.model_sha.slice(0, 10)}` : ''}` : null)).filter((x): x is string => !!x))],
  }
}

export const DISCLAIMER = 'Nhật ký vận hành của một phiên demo mô phỏng: cho biết pipeline đã chạy gì, không phải độ chính xác. Không có ảnh, không có tọa độ khung, không có dữ liệu cá nhân. Không phát hiện người/thú không chứng minh xe trống. Đo độ chính xác cần dữ liệu có nhãn thật.'

export function toJsonl(list: LogEntry[], meta: { model?: unknown; now?: Date } = {}): string {
  const head = { type: 'meta', generated_at: (meta.now ?? new Date()).toISOString(), app: 'cabinsentinel-cockpit-vinfast', source: 'HOSTED_SIMULATION', model: meta.model ?? null, summary: summarize(list), disclaimer: DISCLAIMER }
  return [head, ...list.map((e) => ({ type: 'entry', ...e }))].map((x) => JSON.stringify(x)).join('\n') + '\n'
}

const q = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
export function toCsv(list: LogEntry[]): string {
  const head = ['n', 'at', 'session', 'kind', 'frame_id', 'observed_at', 'source', 'accepted', 'camera_status', 'person', 'dog', 'cat', 'child_label', 'adult_label', 'max_conf', 'age_classifier', 'model_file', 'model_sha', 'infer_ms', 'server_ms', 'capture_age_ms', 'revision', 'risk', 'rule', 'occupancy', 'decision_current']
  const rows = list.map((e) => {
    const c = (k: string) => e.dets.filter((d) => d.c === k).length
    const maxc = e.dets.length ? Math.max(...e.dets.map((d) => d.p)) : ''
    const age = (k: string) => (e.age_classifier === 'ok' ? e.dets.filter((d) => d.c === 'person' && d.age === k).length : '')
    return [e.n, e.at, e.session, e.kind, e.frame_id, e.observed_at, e.source, e.accepted, e.camera_status, c('person'), c('dog'), c('cat'), age('child'), age('adult'), maxc, e.age_classifier, e.model_file, e.model_sha, e.infer_ms, e.server_ms, e.capture_age_ms, e.revision, e.risk, e.rule, e.occupancy, e.current].map(q).join(',')
  })
  return [head.join(','), ...rows].join('\n') + '\n'
}

function load(): LogEntry[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.slice(-LOG_MAX) : [] } catch { return [] }
}
function save(list: LogEntry[]) { try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* quota or private mode: the log stays in memory */ } }

interface LogStore { entries: LogEntry[]; clear: () => void }
export const useEvidenceLog = create<LogStore>((set) => ({ entries: load(), clear: () => { save([]); set({ entries: [] }) } }))

let unsub: (() => void) | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
/** Start recording what the store receives. Safe to call twice; returns a stop function. */
export function startEvidenceLog(): () => void {
  if (unsub) return unsub
  const feed = () => {
    const st = useE2e.getState().state
    if (!st) return
    const cur = useEvidenceLog.getState().entries
    const next = appendFrom(cur, st)
    if (next === cur) return
    useEvidenceLog.setState({ entries: next })
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => save(useEvidenceLog.getState().entries), 800)
  }
  const off = useE2e.subscribe((s, p) => { if (s.state !== p.state) feed() })
  feed()
  unsub = () => { off(); unsub = null }
  return unsub
}

export function download(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
