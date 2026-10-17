// V6 motion: 180 ms, cubic-bezier(0.2, 0, 0, 1), translateY at most 8 px, reduced motion = 0 ms (spec section 4).
// Xiaomi publishes no timing values; these are the numbers of the V6 spec, not Xiaomi's.
import type { Transition } from 'motion/react'

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const make = (): Transition => ({ duration: reduced() ? 0 : 0.18, ease: [0.2, 0, 0, 1] })
export const SPRING: Transition = make()
export const SPRING_PAGE: Transition = make()
export const SPRING_TAP: Transition = make()
export const SPRING_ROLL: Transition = make()
export const EASE_SOFT: Transition = make()
export const MAX_SHIFT_PX = 8

export const tap = { whileTap: { scale: 0.97 }, transition: SPRING_TAP } as const
export const lift = { whileTap: { scale: 0.97 }, transition: SPRING_TAP } as const
