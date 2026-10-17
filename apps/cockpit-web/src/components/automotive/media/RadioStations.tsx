import { Heart } from 'lucide-react'
import { STATIONS, useMedia } from '../../../store/mediaStore'
import { useT } from '../../../store/uiStore'

/** Horizontal station cards; a Favorites filter shows only starred stations. */
export function RadioStations() {
  const t = useT()
  const m = useMedia()
  const list = m.showFavorites ? STATIONS.filter((s) => m.favorites.includes(s.id)) : STATIONS
  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex gap-2">
        <button type="button" aria-pressed={!m.showFavorites} onClick={() => m.set({ showFavorites: false })} className={`cx-chip ${!m.showFavorites ? 'bg-surface-2 text-text' : 'text-text-2'}`}>{t('radio')}</button>
        <button type="button" aria-pressed={m.showFavorites} onClick={() => m.set({ showFavorites: true })} className={`cx-chip ${m.showFavorites ? 'bg-surface-2 text-text' : 'text-text-2'}`}><Heart size="1.1rem" />{t('favorites')}</button>
      </div>
      {list.length === 0 && <div className="py-4 text-sm text-text-2">{t('noFavorites')}</div>}
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {list.map((s) => {
          const on = m.source === 'radio' && m.stationId === s.id
          return (
            <li key={s.id}>
              <button type="button" onClick={() => m.setStation(s.id)} aria-pressed={on}
                className={`cx-btn relative h-24 w-40 flex-col items-start justify-end rounded-xl border p-3 text-left ${on ? 'border-accent' : 'cx-hair'}`}
                style={{ background: `linear-gradient(160deg, hsl(${s.hue} 45% 45% / .22), transparent 70%)` }}>
                {m.favorites.includes(s.id) && <Heart size="1.1rem" className="absolute right-3 top-3 text-critical" fill="currentColor" />}
                <span className="t-label font-semibold">{s.name}</span>
                <span className="text-xs text-text-2">{s.freq}{on && m.playing ? ` · ${t('nowPlaying')}` : ''}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
