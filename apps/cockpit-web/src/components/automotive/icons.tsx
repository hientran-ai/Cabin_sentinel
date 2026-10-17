// Icons that lucide does not have (defrost, seat heat, wipers). Same 24-grid, 1.75 stroke as lucide.
import type { SVGProps } from 'react'

const base = (p: SVGProps<SVGSVGElement>) => ({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, width: '2.2rem', height: '2.2rem', ...p })

export const FrontDefrost = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 15q9-11 18 0" /><path d="M8 20c-1.2-1.6 1.2-2.8 0-4.4M12 20c-1.2-1.6 1.2-2.8 0-4.4M16 20c-1.2-1.6 1.2-2.8 0-4.4" /></svg>
)
export const RearDefrost = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="3" y="5" width="18" height="10" rx="2" /><path d="M8 20c-1.2-1.6 1.2-2.8 0-4.4M12 20c-1.2-1.6 1.2-2.8 0-4.4M16 20c-1.2-1.6 1.2-2.8 0-4.4" /></svg>
)
export const SeatHeat = ({ level = 0, ...p }: SVGProps<SVGSVGElement> & { level?: number }) => (
  <svg {...base(p)}>
    <path d="M6 4h3l1.5 9H17l1 6" /><path d="M6 4 5 13l2 6" />
    {[0, 1, 2].map((i) => <path key={i} d={`M${12 + i * 3} 3.5c-.9 1 .9 2 0 3`} opacity={i < level ? 1 : 0.25} stroke={i < level ? '#E8693C' : 'currentColor'} />)}
  </svg>
)
export const Wipers = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 17a12 12 0 0 1 18 0" /><path d="M8 18 13 8M15 18l4-7" /></svg>
)
export const SteeringWheel = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2" /><path d="M3.5 10h6.5M14 10h6.5M12 14v7" /></svg>
)
