import { PanelHeader, Sheet } from '../ui'
import { Camera, Car, Fan, GearSix, Lightning, MusicNotes, NavigationArrow, Scan } from '@phosphor-icons/react'
import { useUi, useT } from '../../../store/uiStore'
import { useNavigation } from '../../../store/navigationStore'

// One colour per app, like a phone home screen (our own palette, Phosphor glyphs (MIT), not Xiaomi's icons)
const APP_BG: Record<string, string> = {
  nav: 'linear-gradient(160deg, #3ad59f, #12a37a)', music: 'linear-gradient(160deg, #ff6b8b, #d6345f)', camera: 'linear-gradient(160deg, #4aa3ff, #1f5fe0)',
  climate: 'linear-gradient(160deg, #5fd0ff, #1b8fd6)', vehicle: 'linear-gradient(160deg, #9aa0a8, #5b6068)', charging: 'linear-gradient(160deg, #7ee04f, #35a51c)',
  settings: 'linear-gradient(160deg, #8a8f98, #4b5059)', cabin: 'linear-gradient(160deg, #4a515c, #2c3139)',
}

/** App list: every tile opens a working screen or overlay. */
export function AppLauncher() {
  const t = useT()
  const ui = useUi()
  const apps = [
    { id: 'nav', label: t('navigation'), Icon: NavigationArrow, go: () => { ui.setOverlay('map'); useNavigation.getState().set({ searchOpen: true }) } },
    { id: 'music', label: t('music'), Icon: MusicNotes, go: () => ui.setOverlay('media') },
    { id: 'camera', label: t('camera'), Icon: Camera, go: () => ui.setOverlay('camera') },
    { id: 'climate', label: t('climate'), Icon: Fan, go: () => ui.setOverlay('climate') },
    { id: 'vehicle', label: t('vehicle'), Icon: Car, go: () => ui.set({ overlay: 'vehicle', vehicleTab: 'quick' }) },
    { id: 'charging', label: t('chargingTab'), Icon: Lightning, go: () => ui.set({ overlay: 'vehicle', vehicleTab: 'charging' }) },
    { id: 'settings', label: t('settings'), Icon: GearSix, go: () => ui.set({ overlay: 'vehicle', vehicleTab: 'settings' }) },
    { id: 'cabin', label: t('cabinMonitoring'), Icon: Scan, go: () => ui.setOverlay('cabin') },
  ]
  return (
    <Sheet label={t('appsTitle')} onClose={() => ui.setOverlay(null)}>
      <PanelHeader title={t('appsTitle')} />
      <div className="grid grid-cols-6 gap-x-[2rem] gap-y-[2.5rem] px-[10rem] pt-[2rem]">
        {apps.map(({ id, label, Icon, go }) => (
          <button key={id} type="button" onClick={go} className="flex flex-col items-center gap-[.9rem] py-[1rem] text-center t-body text-white/85">
            <span className="su-app" style={{ background: APP_BG[id], width: '6rem', height: '6rem', borderRadius: 'var(--r-lg)' }}><Icon size="3.1rem" weight="fill" /></span><span className="leading-tight">{label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
