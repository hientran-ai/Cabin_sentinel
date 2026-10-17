import { AnimatePresence, motion } from 'motion/react'
import { SPRING_ROLL } from '../../lib/motion'

/** A number whose digits roll up or down when they change (like the dock temperature on the SU7). */
export function RollNumber({ value, className = '' }: { value: string; className?: string }) {
  const chars = value.split('')
  return (
    <span className={`inline-flex overflow-hidden tabular-nums ${className}`} aria-label={value} style={{ height: '1lh' }}>
      {chars.map((c, i) => (
        <span key={`${chars.length - i}`} className="relative inline-block" aria-hidden>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={c} className="inline-block" initial={{ y: '70%', opacity: 0, filter: 'blur(3px)' }} animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
              exit={{ y: '-70%', opacity: 0, filter: 'blur(3px)' }} transition={SPRING_ROLL}>{c}</motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  )
}
