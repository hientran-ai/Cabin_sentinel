import { useState, type ComponentType } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useUi } from '../../../store/uiStore'
import { useVehicle } from '../../../store/vehicleStore'
import { notify } from '../../../store/notificationStore'
import { settingsAction } from './settingsAction'
import { allowFigmaReference } from './reference'
import type { SettingsFrameProps, TeslaSettingsTab } from './settingsTypes'
import SettingsQuickDark from './settings-frames/SettingsQuickDark'
import SettingsLightsDark from './settings-frames/SettingsLightsDark'
import SettingsLocksDark from './settings-frames/SettingsLocksDark'
import SettingsDisplayDark from './settings-frames/SettingsDisplayDark'
import SettingsDrivingDark from './settings-frames/SettingsDrivingDark'
import SettingsAutopilotDark from './settings-frames/SettingsAutopilotDark'
import SettingsSafetyDark from './settings-frames/SettingsSafetyDark'
import SettingsServiceDark from './settings-frames/SettingsServiceDark'
import SettingsQuickLight from './settings-frames/SettingsQuickLight'
import SettingsLightsLight from './settings-frames/SettingsLightsLight'
import SettingsLocksLight from './settings-frames/SettingsLocksLight'
import SettingsDisplayLight from './settings-frames/SettingsDisplayLight'
import SettingsDrivingLight from './settings-frames/SettingsDrivingLight'
import SettingsAutopilotLight from './settings-frames/SettingsAutopilotLight'
import SettingsSafetyLight from './settings-frames/SettingsSafetyLight'
import SettingsServiceLight from './settings-frames/SettingsServiceLight'

const frames: Record<'dark'|'light', Record<TeslaSettingsTab, ComponentType<SettingsFrameProps>>> = {
  dark: { quick: SettingsQuickDark, lights: SettingsLightsDark, locks: SettingsLocksDark, display: SettingsDisplayDark, driving: SettingsDrivingDark, autopilot: SettingsAutopilotDark, safety: SettingsSafetyDark, service: SettingsServiceDark },
  light: { quick: SettingsQuickLight, lights: SettingsLightsLight, locks: SettingsLocksLight, display: SettingsDisplayLight, driving: SettingsDrivingLight, autopilot: SettingsAutopilotLight, safety: SettingsSafetyLight, service: SettingsServiceLight },
}
export function TeslaSettings() {
  const [tab, setTab] = useState<TeslaSettingsTab>('quick')
  const ui=useUi(), v=useVehicle()
  const reference=allowFigmaReference(location.search)
  const mode=ui.appearance==='light'?'light':'dark'
  const Frame=frames[mode][tab]
  const active=(action:string)=>{
    const [group,value]=action.split(':')
    if(reference) return action==='headlights:auto'||action==='appearance:dark'||action==='units:imperial'||action==='temperature:f'||action==='steering:sport'||action==='regen:low'||action==='dome:auto'
    return group==='headlights'?v.headlights===value:group==='appearance'?ui.appearance===value:group==='units'?ui.units===value:group==='temperature'?(ui.units==='metric'?'c':'f')===value:group==='steering'?v.steeringMode===value:group==='regen'?v.regenLevel===value:action==='dome:auto'
  }
  const onAction=(action:string,value?:number)=>{
    if(action==='close'){ui.setOverlay(null);return}
    // Temperature and distance follow the existing shared Units preference.
    const resolved=action==='temperature:c'?'units:metric':action==='temperature:f'?'units:imperial':action
    const effect=settingsAction(resolved,value)
    if(effect.kind==='ui')ui.set(effect.patch)
    else if(effect.kind==='vehicle')v.set(effect.patch)
    else notify({key:'tesla-settings-info',level:'info',title:action+' · MÔ PHỎNG',body:'Mục tham chiếu Figma, chưa tích hợp thao tác này. Không có lệnh xe nào được gửi.'})
  }
  return <motion.section className="tesla-settings" role="region" aria-label="Tesla Settings" initial={{opacity:0,y:32}} animate={{opacity:1,y:0}} exit={{opacity:0,y:24}}>
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={tab+'-'+mode} className="tesla-settings-frame" initial={{opacity:0,x:12}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-8}} transition={{duration:.16}}>
        <Frame onNavigate={setTab} onAction={onAction} active={active} brightness={reference?10:ui.brightness} parkingBrake={reference?false:v.parkingBrake}/>
      </motion.div>
    </AnimatePresence>
    <p className="tesla-settings-notice">SIMULATED · Cài đặt tiện nghi mô phỏng. Khóa / Autopilot / Service là mẫu tham chiếu.</p>
  </motion.section>
}
