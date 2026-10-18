// Soft music generated in the browser with WebAudio, standing in for the car's speakers. The melodies are traditional /
// public-domain (Twinkle Twinkle; Brahms' Wiegenlied, 1868), synthesised here, so no recording is copied or streamed.
import { useE2e } from './store'
type Note = [string | null, number] // [pitch, beats]; null = rest

const SEMI: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }
function hz(n: string): number { const oct = Number(n.slice(-1)); return 440 * 2 ** (((SEMI[n[0] ?? 'A'] ?? 0) + (n[1] === '#' ? 1 : 0) + (oct - 4) * 12) / 12) }
const seq = (s: string): Note[] => s.trim().split(/\s+/).map((t) => { const [p, b] = t.split(':'); return [!p || p === '-' ? null : p, Number(b || 1)] })

interface Track { label: string; bpm: number; notes: Note[]; pad?: boolean }
export const TRACKS = {
  twinkle: { label: 'Twinkle Twinkle (hát ru)', bpm: 66, notes: seq(`C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2
    G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 -:2`) },
  brahms: { label: 'Brahms Lullaby (hát ru)', bpm: 60, notes: seq(`E4:0.5 E4:0.5 G4:2 E4:0.5 E4:0.5 G4:2 E4:0.5 G4:0.5 C5:1 B4:1.5 A4:0.5 A4:1 G4:1
    D4:0.5 E4:0.5 F4:1 D4:1 D4:0.5 E4:0.5 F4:2 D4:0.5 F4:0.5 B4:0.5 A4:0.5 G4:1 B4:1 C5:2
    C4:0.5 C4:0.5 C5:2 A4:0.5 F4:0.5 G4:2 E4:0.5 C4:0.5 F4:1 G4:1 A4:1 G4:2 -:2`) },
  ambient: { label: 'Nhạc thư giãn (không lời)', bpm: 40, pad: true, notes: seq('C4:4 A3:4 F3:4 G3:4') },
} satisfies Record<string, Track>
export const trackOf = (id: string): Track | undefined => (TRACKS as Record<string, Track>)[id]
const PAD: Record<string, string[]> = { C4: ['C4', 'E4', 'G4', 'B4'], A3: ['A3', 'C4', 'E4', 'G4'], F3: ['F3', 'A3', 'C4', 'E4'], G3: ['G3', 'B3', 'D4', 'F4'] }

let ctx: AudioContext | null = null
let master: GainNode | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let playing: string | null = null
const listeners = new Set<() => void>()
const safetyBlocked = () => { const s = useE2e.getState(); return !s.state?.decision_current || s.connection !== 'ok' || s.state.risk_level === 'CRITICAL' }
export const audioState = () => ({ playing, blocked: !!ctx && ctx.state !== 'running' && !!playing, safetyBlocked: safetyBlocked() })
export function onAudio(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } }
const emit = () => listeners.forEach((l) => l())

function ensure(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain(); master.gain.value = 0.12
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800
    master.connect(lp).connect(ctx.destination)
    ctx.onstatechange = emit
  }
  return ctx
}

function tone(f: number, at: number, dur: number, peak: number) {
  const c = ctx!, o = c.createOscillator(), g = c.createGain()
  o.type = 'triangle'; o.frequency.value = f
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + Math.min(0.08, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g).connect(master!); o.start(at); o.stop(at + dur + 0.05)
}

function schedule(id: string) {
  const track: Track = trackOf(id) ?? TRACKS.twinkle; const c = ensure(); const beat = 60 / track.bpm
  let t = c.currentTime + 0.1
  for (const [p, b] of track.notes) {
    if (p) {
      if (track.pad) for (const n of PAD[p] ?? [p]) tone(hz(n), t, b * beat * 1.1, 0.18)
      else tone(hz(p), t, b * beat * 0.95, 0.5)
    }
    t += b * beat
  }
  timer = setTimeout(() => { if (playing === id) schedule(id) }, (t - c.currentTime - 0.2) * 1000)
}

/** Start a track. Browsers block sound until the page has had a click; `blocked` then tells the UI to ask for one. */
export function play(id: string) {
  if (!trackOf(id) || safetyBlocked()) { stop(); return }
  const key = id
  if (playing === key) { void ctx?.resume(); return }
  stop(); playing = key
  void ensure().resume().catch(() => undefined).finally(emit)
  schedule(key); emit()
}
export function stop() { if (timer) clearTimeout(timer); timer = null; playing = null; if (master && ctx) { master.disconnect(); master = null; ctx.close().catch(() => undefined); ctx = null } emit() }
export function unlock() { if (!safetyBlocked()) void ctx?.resume().catch(() => undefined).finally(emit) }
