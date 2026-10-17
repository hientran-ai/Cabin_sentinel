// Crisp vector glyphs redrawn after the VinFast HMI line icons seen in Aurora A13/A14 and the in-car photos
// (thin rounded strokes on a 24 grid). Redrawn here so they stay sharp at any scale; shapes follow the references,
// they are not exported OEM files.
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }
const base = ({ size = 40, ...p }: P) => ({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p })

/** Seat with heat waves; `tone` colours the whole glyph like the source (red driver heat, blue passenger). */
export const GSeat = ({ level = 0, flip = false, ...p }: P & { level?: number; flip?: boolean }) => (
  <svg {...base(p)}><g transform={flip ? 'translate(24 0) scale(-1 1)' : undefined}>
    <path d="M5.5 3.5c1.6-.3 2.4.5 2.6 2l1.2 8.2c.1.7.6 1.1 1.3 1.1h5.6c1 0 1.6.6 1.8 1.5l.6 3.2" />
    <path d="M5.5 3.5 4.7 13c-.1 1.2.3 2.3 1.1 3.1l2.2 2.4M9.5 18.6h6.6" />
    {[0, 1, 2].map((i) => <path key={i} d={`M${13.2 + i * 2.6} 4c-.9 1.1.9 2.1 0 3.2s.9 2.1 0 3.2`} opacity={level > i || level === 0 ? 1 : .35} />)}
  </g></svg>
)
export const GDefrostFront = (p: P) => <svg {...base(p)}><path d="M3 9.5C5.5 6.8 8.6 5.5 12 5.5s6.5 1.3 9 4l-2.2 6.2C16.8 14.6 14.5 14 12 14s-4.8.6-6.8 1.7z" /><path d="M9 19.5c-.9-1.2.9-2 0-3.2M12 20c-.9-1.2.9-2 0-3.2M15 19.5c-.9-1.2.9-2 0-3.2" /></svg>
export const GDefrostRear = (p: P) => <svg {...base(p)}><rect x="3.5" y="4.5" width="17" height="11" rx="2.5" /><path d="M8.5 20c-.9-1.2.9-2 0-3.2M12 20c-.9-1.2.9-2 0-3.2M15.5 20c-.9-1.2.9-2 0-3.2M7 8.5h10M7 11.5h10" /></svg>
export const GFan = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="1.6" /><path d="M12 10.4c-.8-3-.2-6 2.2-6.4 2.6-.4 3.3 3.5-.6 5.5M13.6 12c3-.8 6-.2 6.4 2.2.4 2.6-3.5 3.3-5.5-.6M12 13.6c.8 3 .2 6-2.2 6.4-2.6.4-3.3-3.5.6-5.5M10.4 12c-3 .8-6 .2-6.4-2.2-.4-2.6 3.5-3.3 5.5.6" /></svg>
export const GCarTop = (p: P) => <svg {...base(p)}><path d="M8.5 3.5h7c1.4 0 2.3.9 2.4 2.3l.4 12.4c0 1.4-1 2.3-2.4 2.3h-7.8c-1.4 0-2.4-.9-2.4-2.3l.4-12.4c.1-1.4 1-2.3 2.4-2.3z" /><path d="M7.5 8.5c3-1 6-1 9 0l-.6 2.6h-7.8zM8 15.5c2.7.8 5.3.8 8 0" /><path d="M6.2 9.2 4.8 8.6M17.8 9.2l1.4-.6" /></svg>
export const GGrid = (p: P) => <svg {...base(p)}><rect x="3.5" y="3.5" width="7" height="7" rx="1.8" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.8" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.8" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.8" /></svg>
export const GHome = (p: P) => <svg {...base(p)}><path d="M3.5 11 12 4l8.5 7M6 9.2V20h4.5v-5.2h3V20H18V9.2" /></svg>
export const GSun = (p: P) => <svg {...base(p)}><path d="M8 13.5a4 4 0 1 1 8 0" /><path d="M6.5 16.5h11M12 4.5V7M5.4 7.4l1.7 1.7M18.6 7.4l-1.7 1.7M3 12.5h2.3M19 12.5h2.3M9 19.5h6" /></svg>
export const GChevron = ({ dir = 'down', ...p }: P & { dir?: 'down' | 'up' | 'left' | 'right' }) => (
  <svg {...base(p)} strokeWidth={2}><path d={{ down: 'M6 9.5l6 6 6-6', up: 'M6 14.5l6-6 6 6', left: 'M14.5 6l-6 6 6 6', right: 'M9.5 6l6 6-6 6' }[dir]} /></svg>
)
export const GVideo = (p: P) => <svg {...base(p)}><rect x="3" y="6.5" width="12.5" height="11" rx="2.2" /><path d="m15.5 10.5 5.5-3v9l-5.5-3" /></svg>
export const GBattery = ({ pct = 70, ...p }: P & { pct?: number }) => (
  <svg {...base(p)} viewBox="0 0 30 16"><rect x="1" y="2" width="25" height="12" rx="3" /><path d="M28 6v4" /><rect x="3" y="4" width={Math.max(1, 21 * Math.min(1, pct / 100))} height="8" rx="1.6" fill="#2395FF" stroke="none" /></svg>
)
export const GAdas = (p: P) => <svg {...base(p)}><path d="M2.8 12S6.6 6.5 12 6.5 21.2 12 21.2 12 17.4 17.5 12 17.5 2.8 12 2.8 12z" /><circle cx="12" cy="12" r="3" /><path d="M10.6 11.2 12 13l1.4-1.8" /></svg>
export const GMuteWarn = (p: P) => <svg {...base(p)}><path d="M4 9.5h3l4-3.5v12l-4-3.5H4z" /><path d="m14.5 9.5 4.5 4.5M19 9.5l-4.5 4.5" /><path d="M16.8 16.5 15 20h3.6z" /></svg>
export const GTrunk = (p: P) => <svg {...base(p)}><path d="M2.8 15.5h18.4l-.6-3.2c-.2-1-1-1.7-2-1.8l-2.6-.3-2.8-2.8c-.5-.5-1.1-.7-1.8-.7H7.6c-.8 0-1.5.4-1.9 1.1L4 10.5l-.7 1.2z" /><path d="M16 9.6 19.6 5.5" /><circle cx="7" cy="16" r="1.6" /><circle cx="17" cy="16" r="1.6" /></svg>
export const GWiperInfo = (p: P) => <svg {...base(p)}><path d="M3 9.5C5.5 6.8 8.6 5.5 12 5.5s6.5 1.3 9 4l-2.2 6.2C16.8 14.6 14.5 14 12 14s-4.8.6-6.8 1.7z" /><path d="M12 8.6v.2M12 10.4V12.8" /></svg>
export const GWindow = (p: P) => <svg {...base(p)}><path d="M4 18.5V9.8c0-.7.3-1.3.9-1.7l4.4-3.1c.4-.3.9-.5 1.4-.5h8.8v14z" /><path d="M7 11.5h12.5M10 14.5l3 3M13.5 14.5l3 3" /></svg>
export const GGear = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6" /><circle cx="12" cy="12" r="6.3" /></svg>
export const GSnow = (p: P) => <svg {...base(p)}><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" /><path d="m9.8 4.8 2.2 2 2.2-2M9.8 19.2l2.2-2 2.2 2M4.6 10.4l3-.6-.8-3M19.4 13.6l-3 .6.8 3M4.6 13.6l3 .6-.8 3M19.4 10.4l-3-.6.8-3" /></svg>
export const GHand = (p: P) => <svg {...base(p)}><path d="M9 11V5.2a1.4 1.4 0 0 1 2.8 0V10M11.8 9.5V4a1.4 1.4 0 0 1 2.8 0v6M14.6 10V6a1.4 1.4 0 0 1 2.8 0v7.5c0 3.8-2.4 6.5-5.8 6.5-2.3 0-3.7-1-4.9-2.8L4.6 13.4c-.6-1 .4-2.2 1.5-1.6L9 13.5" /></svg>
export const GRecirc = (p: P) => <svg {...base(p)}><path d="M3 15.5h18l-.8-2.9c-.3-1-1.1-1.6-2.1-1.6H5.9c-1 0-1.8.6-2.1 1.6z" /><path d="M7 11 9 7.5h6L17 11" /><path d="M9 4.5c1.8-1 4.2-1 6 0l-1-1.6M15 4.5l-1.7.3" /><circle cx="7" cy="16" r="1.4" /><circle cx="17" cy="16" r="1.4" /></svg>
export const GIon = (p: P) => <svg {...base(p)}><path d="M13 19c5.5 0 7.5-5 7.5-12-5 0-9.5 1.5-9.5 7 0 1.5.5 3 2 5z" /><path d="M13 19c1-3 3-5.5 5.5-7.5" /><circle cx="5" cy="8" r="1.1" /><circle cx="7.5" cy="12.5" r="1.1" /><circle cx="4.5" cy="15.5" r="1.1" /></svg>
export const GThermo = (p: P) => <svg {...base(p)}><path d="M10 13.5V5a2 2 0 0 1 4 0v8.5a3.8 3.8 0 1 1-4 0z" /><path d="M12 9v6.5" /><circle cx="12" cy="16.6" r="1.4" fill="currentColor" /></svg>
/** Airflow targets drawn as a seated figure with arrows (face / feet / windshield), like the round buttons on the climate car. */
export const GAirFace = (p: P) => <svg {...base(p)}><circle cx="15" cy="5" r="1.8" /><path d="M15 7.5v5l3 4.5M15 12.5h-3" /><path d="M3.5 8h7l-1.8-1.8M10.5 8 8.7 9.8" /></svg>
export const GAirFeet = (p: P) => <svg {...base(p)}><circle cx="15" cy="5" r="1.8" /><path d="M15 7.5v5l3 4.5M15 12.5h-3" /><path d="M3.5 18h8l-1.8-1.8M11.5 18l-1.8 1.8" /></svg>
export const GAirScreen = (p: P) => <svg {...base(p)}><circle cx="15" cy="9" r="1.8" /><path d="M15 11.5v4.5l3 4M15 16h-3" /><path d="M4 9 9.5 3.5M9.5 3.5H6.5M9.5 3.5v3" /></svg>

export const GLock = (p: P) => <svg {...base(p)}><rect x="5" y="10.5" width="14" height="10" rx="2.4" /><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5M12 14.4v2.4" /></svg>
export const GBulb = (p: P) => <svg {...base(p)}><path d="M12 3.5a5.6 5.6 0 0 0-3.4 10.1c.7.6 1.1 1.3 1.1 2.1v.8h4.6v-.8c0-.8.4-1.5 1.1-2.1A5.6 5.6 0 0 0 12 3.5z" /><path d="M9.8 19.2h4.4M10.6 21h2.8" /></svg>
export const GHazard = (p: P) => <svg {...base(p)}><path d="M12 3.6 21 19.4H3z" /><path d="M12 9.6 16.8 18H7.2z" /></svg>
export const GTent = (p: P) => <svg {...base(p)}><path d="M2.8 19.5h18.4M12 4.5 4.6 19.5M12 4.5l7.4 15M12 4.5v15M12 13.2l-3.6 6.3M12 13.2l3.6 6.3" /></svg>
export const GBaby = (p: P) => <svg {...base(p)}><circle cx="12" cy="6.3" r="2.5" /><path d="M7.6 20v-6.4c0-2.3 1.8-4 4.4-4s4.4 1.7 4.4 4V20M6 20h12M9.4 13.6h5.2" /></svg>
export const GPaw = (p: P) => <svg {...base(p)}><ellipse cx="6.2" cy="11" rx="1.9" ry="2.5" /><ellipse cx="10" cy="6.6" rx="1.9" ry="2.6" /><ellipse cx="14" cy="6.6" rx="1.9" ry="2.6" /><ellipse cx="17.8" cy="11" rx="1.9" ry="2.5" /><path d="M7.4 17.4c0-2.8 2.1-5 4.6-5s4.6 2.2 4.6 5c0 1.7-1.3 2.4-2.6 2.1l-2-.5-2 .5c-1.3.3-2.6-.4-2.6-2.1z" /></svg>
export const GCarWash = (p: P) => <svg {...base(p)}><path d="M3 16.5h18l-.8-3.3c-.3-1-1.1-1.7-2.2-1.7H6c-1.1 0-1.9.7-2.2 1.7z" /><path d="M7 11.5 8.8 8h6.4l1.8 3.5" /><circle cx="7.2" cy="17" r="1.4" /><circle cx="16.8" cy="17" r="1.4" /><path d="M6 3.6v1.8M12 2.6v2.2M18 3.6v1.8" /></svg>
export const GCarMode = (p: P) => <svg {...base(p)}><path d="M3 15.5h18l-.8-3.4c-.3-1.1-1.1-1.8-2.2-1.8H6c-1.1 0-1.9.7-2.2 1.8z" /><path d="M7 10.3 8.6 7h6.8l1.6 3.3" /><circle cx="7.2" cy="16.2" r="1.5" /><circle cx="16.8" cy="16.2" r="1.5" /><path d="M5 20h14" /></svg>
export const GCabinEye = (p: P) => <svg {...base(p)}><path d="M3.5 8V5.8c0-1.2.9-2.3 2.3-2.3H8M16 3.5h2.2c1.2 0 2.3.9 2.3 2.3V8M20.5 16v2.2c0 1.2-.9 2.3-2.3 2.3H16M8 20.5H5.8c-1.2 0-2.3-.9-2.3-2.3V16" /><path d="M6.6 12S9 8.4 12 8.4 17.4 12 17.4 12 15 15.6 12 15.6 6.6 12 6.6 12z" /><circle cx="12" cy="12" r="1.8" /></svg>
