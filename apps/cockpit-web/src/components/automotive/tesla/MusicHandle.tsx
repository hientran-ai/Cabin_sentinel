import { motion } from 'motion/react'
import { musicSwipeTarget } from './gesture'

export function MusicHandle({ expanded, onChange }: { expanded: boolean; onChange: (expanded: boolean) => void }) {
  return <motion.button type="button" className="tesla-music-handle" aria-label={expanded ? 'Vuốt xuống để thu gọn nhạc' : 'Vuốt lên để mở thư viện nhạc'} aria-expanded={expanded}
    data-testid="tesla-music-handle" onClick={() => onChange(!expanded)}
    onPanEnd={(_, info) => onChange(musicSwipeTarget(expanded, info.offset.y, info.velocity.y))}
    whileTap={{ scaleX: 1.16 }} transition={{ duration: .14 }}>
    <span />
  </motion.button>
}
