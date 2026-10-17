import type { SettingsFrameProps } from '../settingsTypes'
import { motion } from 'motion/react'
const imgNavBg = "/cockpit/tesla-figma/panel-lights-imgNavBg.svg";
const imgGlovebox = "/cockpit/tesla-figma/panel-lights-imgGlovebox.svg";
const imgService = "/cockpit/tesla-figma/panel-lights-imgService.svg";
const imgSafetyAndSecurity = "/cockpit/tesla-figma/panel-lights-imgSafetyAndSecurity.svg";
const imgSteeringWheelSmall = "/cockpit/tesla-figma/panel-lights-imgSteeringWheelSmall.svg";
const imgModel3IconSmall = "/cockpit/tesla-figma/panel-lights-imgModel3IconSmall.svg";
const imgGroup = "/cockpit/tesla-figma/panel-lights-imgGroup.svg";
const imgLock = "/cockpit/tesla-figma/panel-lights-imgLock.svg";
const imgLights = "/cockpit/tesla-figma/panel-lights-imgLights.svg";
const imgQuickControls = "/cockpit/tesla-figma/panel-lights-imgQuickControls.svg";
const imgSettingsBg = "/cockpit/tesla-figma/panel-lights-imgSettingsBg.svg";
const imgExit = "/cockpit/tesla-figma/panel-lights-imgExit.svg";
export default function SettingsLightsDark({
  onNavigate,
  onAction,
  active
}: SettingsFrameProps) {
  return <div className="relative size-full" data-node-id="193:3243" data-name="Settings">
      <div className="absolute contents left-0 top-0" data-node-id="I193:3243;193:2055" data-name="Nav Tree">
        <div className="absolute bottom-0 right-[800px] top-0 w-[500px]" data-node-id="I193:3243;88:127" data-name="nav-bg">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgNavBg} />
        </div>
        <div className="absolute contents left-[40px] top-[60px]" data-node-id="I193:3243;88:363" data-name="Menu">
          <div className="absolute contents left-[40px] top-[900px]" data-node-id="I193:3243;192:3708" data-name="Glovebox Button">
            <motion.button className="absolute bottom-[160px] h-[60px] right-[840px] w-[420px]" data-node-id="I193:3243;192:2542" data-name="Glovebox" type="button" aria-label="Glovebox" data-setting-action="Glovebox" onClick={() => onAction('Glovebox')} whileTap={{
            scale: .97
          }} transition={{
            duration: .14
          }}>
              <div className="absolute border-2 border-[rgba(255,255,255,0.4)] border-solid inset-0 rounded-[50px]" data-node-id="I193:3243;192:2542;18:3" />
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-center text-white top-1/2" data-node-id="I193:3243;192:2542;18:2">
                <p className="leading-[normal]">Glovebox</p>
              </div>
            </motion.button>
            <div className="absolute left-[56px] size-[48px] top-[906px]" data-node-id="I193:3243;192:3637" data-name="glovebox">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgGlovebox} />
            </div>
          </div>
          <div className="absolute contents cursor-pointer right-[1122px] top-[620px]" data-node-id="I193:3243;88:354" data-name="Service" data-nav-visual="service">
            <div className="absolute opacity-40 right-[1212px] size-[48px] top-[620px]" data-node-id="I193:3243;88:342" data-name="service">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgService} />
            </div>
            <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-40 right-[1195px] text-[20px] text-white top-[645.5px] translate-x-full whitespace-nowrap" data-node-id="I193:3243;88:353">
              <p className="leading-[normal]">Service</p>
            </div>
          <motion.button type="button" className="tesla-settings-nav-hit" style={{
            left: 24,
            top: 608,
            width: 450,
            height: 72
          }} aria-label="Service" aria-current={undefined} onClick={() => onNavigate('service')} whileTap={{
            backgroundColor: '#8883'
          }} /></div>
          <div className="absolute contents cursor-pointer right-[1027px] top-[540px]" data-node-id="I193:3243;88:355" data-name="Safety & Security" data-nav-visual="safety">
            <div className="absolute opacity-40 right-[1212px] size-[48px] top-[540px]" data-node-id="I193:3243;88:325" data-name="safety and security">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgSafetyAndSecurity} />
            </div>
            <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-40 right-[1195px] text-[20px] text-white top-[565.5px] translate-x-full whitespace-nowrap" data-node-id="I193:3243;88:352">
              <p className="leading-[normal]">{`Safety & Security`}</p>
            </div>
          <motion.button type="button" className="tesla-settings-nav-hit" style={{
            left: 24,
            top: 528,
            width: 450,
            height: 72
          }} aria-label="Safety & Security" aria-current={undefined} onClick={() => onNavigate('safety')} whileTap={{
            backgroundColor: '#8883'
          }} /></div>
          <div className="absolute contents cursor-pointer right-[1101px] top-[460px]" data-node-id="I193:3243;88:356" data-name="Autopilot" data-nav-visual="autopilot">
            <div className="absolute opacity-40 right-[1212px] size-[48px] top-[460px]" data-node-id="I193:3243;88:296" data-name="steering wheel-small">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgSteeringWheelSmall} />
            </div>
            <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-40 right-[1196px] text-[20px] text-white top-[485.5px] translate-x-full whitespace-nowrap" data-node-id="I193:3243;88:351">
              <p className="leading-[normal]">Autopilot</p>
            </div>
          <motion.button type="button" className="tesla-settings-nav-hit" style={{
            left: 24,
            top: 448,
            width: 450,
            height: 72
          }} aria-label="Autopilot" aria-current={undefined} onClick={() => onNavigate('autopilot')} whileTap={{
            backgroundColor: '#8883'
          }} /></div>
          <div className="absolute contents cursor-pointer right-[1121px] top-[380px]" data-node-id="I193:3243;88:357" data-name="Driving" data-nav-visual="driving">
            <div className="absolute opacity-40 right-[1212px] size-[48px] top-[380px]" data-node-id="I193:3243;88:176" data-name="model3-icon-small">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgModel3IconSmall} />
            </div>
            <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-40 right-[1194px] text-[20px] text-white top-[405.5px] translate-x-full whitespace-nowrap" data-node-id="I193:3243;88:350">
              <p className="leading-[normal]">Driving</p>
            </div>
          <motion.button type="button" className="tesla-settings-nav-hit" style={{
            left: 24,
            top: 368,
            width: 450,
            height: 72
          }} aria-label="Driving" aria-current={undefined} onClick={() => onNavigate('driving')} whileTap={{
            backgroundColor: '#8883'
          }} /></div>
          <div className="absolute contents cursor-pointer right-[1121px] top-[300px]" data-node-id="I193:3243;88:358" data-name="Display" data-nav-visual="display">
            <div className="absolute opacity-40 overflow-clip right-[1212px] size-[48px] top-[300px]" data-node-id="I193:3243;88:170" data-name="display">
              <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[22px] left-1/2 top-1/2 w-[30px]" data-node-id="I193:3243;88:170;170:0" data-name="Group">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgGroup} />
              </div>
            </div>
            <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-40 right-[1194px] text-[20px] text-white top-[325.5px] translate-x-full whitespace-nowrap" data-node-id="I193:3243;88:349">
              <p className="leading-[normal]">Display</p>
            </div>
          <motion.button type="button" className="tesla-settings-nav-hit" style={{
            left: 24,
            top: 288,
            width: 450,
            height: 72
          }} aria-label="Display" aria-current={undefined} onClick={() => onNavigate('display')} whileTap={{
            backgroundColor: '#8883'
          }} /></div>
          <div className="absolute contents cursor-pointer right-[1138px] top-[220px]" data-node-id="I193:3243;88:359" data-name="Locks" data-nav-visual="locks">
            <div className="absolute opacity-40 right-[1212px] size-[48px] top-[220px]" data-node-id="I193:3243;88:163" data-name="lock">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgLock} />
            </div>
            <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-40 right-[1195px] text-[20px] text-white top-[245.5px] translate-x-full whitespace-nowrap" data-node-id="I193:3243;88:348">
              <p className="leading-[normal]">Locks</p>
            </div>
          <motion.button type="button" className="tesla-settings-nav-hit" style={{
            left: 24,
            top: 208,
            width: 450,
            height: 72
          }} aria-label="Locks" aria-current={undefined} onClick={() => onNavigate('locks')} whileTap={{
            backgroundColor: '#8883'
          }} /></div>
          <div className="absolute contents cursor-pointer right-[1132px] top-[140px]" data-node-id="I193:3243;88:360" data-name="Lights" data-nav-visual="lights">
            <div className="absolute right-[1212px] size-[48px] top-[140px]" data-node-id="I193:3243;88:159" data-name="lights">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgLights} />
            </div>
            <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] right-[1193px] text-[20px] text-white top-[165.5px] translate-x-full whitespace-nowrap" data-node-id="I193:3243;88:347">
              <p className="leading-[normal]">Lights</p>
            </div>
          <motion.button type="button" className="tesla-settings-nav-hit" style={{
            left: 24,
            top: 128,
            width: 450,
            height: 72
          }} aria-label="Lights" aria-current={"page"} onClick={() => onNavigate('lights')} whileTap={{
            backgroundColor: '#8883'
          }} /></div>
          <div className="absolute contents cursor-pointer right-[1046px] top-[60px]" data-node-id="I193:3243;88:361" data-name="Quick Controls" data-nav-visual="quick">
            <div className="absolute right-[1212px] size-[48px] top-[60px]" data-node-id="I193:3243;88:141" data-name="quick controls">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgQuickControls} />
            </div>
            <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] right-[1194px] text-[20px] text-[rgba(255,255,255,0.4)] top-[85.5px] translate-x-full whitespace-nowrap" data-node-id="I193:3243;88:346">
              <p className="leading-[normal]">Quick Controls</p>
            </div>
          <motion.button type="button" className="tesla-settings-nav-hit" style={{
            left: 24,
            top: 48,
            width: 450,
            height: 72
          }} aria-label="Quick Controls" aria-current={undefined} onClick={() => onNavigate('quick')} whileTap={{
            backgroundColor: '#8883'
          }} /></div>
        </div>
      </div>
      <div className="absolute contents left-[500px] top-0" data-node-id="I193:3243;193:2445" data-name="Settings">
        <div className="absolute bottom-0 left-[500px] top-0 w-[800px]" data-node-id="I193:3243;88:126" data-name="settings-bg">
          <div className="absolute inset-[0_-0.5%_-0.71%_-0.5%]">
            <img alt="" className="block max-w-none size-full" src={imgSettingsBg} />
          </div>
        </div>
        <div className="absolute contents left-[560px] top-[84px]" data-node-id="I193:3243;188:1800" data-name="Lights">
          <motion.button className="absolute h-[60px] left-[560px] top-[582px] w-[220px]" data-node-id="I193:3243;188:1801" data-name="Ambient Lights" type="button" aria-label="Ambient Lights" data-setting-action="Ambient Lights" onClick={() => onAction('Ambient Lights')} whileTap={{
          scale: .97
        }} transition={{
          duration: .14
        }}>
            <div className="absolute bg-[#0e0e0e] border-2 border-[rgba(255,255,255,0.4)] border-solid inset-0 rounded-[50px]" data-node-id="I193:3243;188:1801;18:3" />
            <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-center text-white top-1/2" data-node-id="I193:3243;188:1801;18:2">
              <p className="leading-[normal]">Ambient Lights</p>
            </div>
          </motion.button>
          <div className="absolute contents left-[560px] top-[502px]" data-node-id="I193:3243;188:1802" data-name="Dome Lights Slider">
            <div className="absolute h-[60px] left-[560px] top-[502px] w-[510px]" data-node-id="I193:3243;188:1803" data-name="background">
              <div className="absolute inset-0 rounded-[50px]" data-node-id="I193:3243;188:1803;18:3" style={{
              backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.1) 100%), linear-gradient(90deg, rgb(14, 14, 14) 0%, rgb(14, 14, 14) 100%)"
            }} />
            </div>
            <motion.button className="absolute h-[60px] left-[560px] top-[502px] w-[169.5px]" data-node-id="I193:3243;188:1804" data-name="off" type="button" aria-label="dome:off" data-setting-action="dome:off" onClick={() => onAction('dome:off')} whileTap={{
            scale: .97
          }} transition={{
            duration: .14
          }} aria-pressed={active('dome:off')} data-choice="true" style={{
            background: active('dome:off') ? '#6c6c6c' : 'transparent',
            borderRadius: 50,
            boxShadow: active('dome:off') && false ? '0 3px 4px #0004' : undefined
          }}>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-center text-white top-1/2" data-node-id="I193:3243;188:1804;18:2">
                <p className="leading-[normal]">Off</p>
              </div>
            </motion.button>
            <motion.button className="absolute h-[60px] left-[730.25px] top-[502px] w-[169.5px]" data-node-id="I193:3243;188:1805" data-name="on" type="button" aria-label="dome:on" data-setting-action="dome:on" onClick={() => onAction('dome:on')} whileTap={{
            scale: .97
          }} transition={{
            duration: .14
          }} aria-pressed={active('dome:on')} data-choice="true" style={{
            background: active('dome:on') ? '#6c6c6c' : 'transparent',
            borderRadius: 50,
            boxShadow: active('dome:on') && false ? '0 3px 4px #0004' : undefined
          }}>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-center text-white top-1/2" data-node-id="I193:3243;188:1805;18:2">
                <p className="leading-[normal]">On</p>
              </div>
            </motion.button>
            <motion.button className="absolute h-[60px] left-[900.5px] top-[502px] w-[169.5px]" data-node-id="I193:3243;188:1806" data-name="auto" type="button" aria-label="dome:auto" data-setting-action="dome:auto" onClick={() => onAction('dome:auto')} whileTap={{
            scale: .97
          }} transition={{
            duration: .14
          }} aria-pressed={active('dome:auto')} data-choice="true" style={{
            background: active('dome:auto') ? '#6c6c6c' : 'transparent',
            borderRadius: 50,
            boxShadow: active('dome:auto') && false ? '0 3px 4px #0004' : undefined
          }}>
              <div className="absolute inset-0 rounded-[50px]" data-node-id="I193:3243;188:1806;18:3" style={{
              backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.4) 100%), linear-gradient(90deg, rgb(14, 14, 14) 0%, rgb(14, 14, 14) 100%)"
            }} hidden={true} />
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-center text-white top-1/2" data-node-id="I193:3243;188:1806;18:2">
                <p className="leading-[normal]">Auto</p>
              </div>
            </motion.button>
          </div>
          <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[560px] text-[20px] text-white top-[471.5px] whitespace-nowrap" data-node-id="I193:3243;188:1807">
            <p className="leading-[normal]">Dome Lights</p>
          </div>
          <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[560px] text-[26px] text-white top-[419px] whitespace-nowrap" data-node-id="I193:3243;188:1808">
            <p className="leading-[normal]">Interior</p>
          </div>
          <motion.button className="absolute h-[60px] left-[560px] top-[263px] w-[220px]" data-node-id="I193:3243;188:1809" data-name="front fog" type="button" aria-label="front fog" data-setting-action="front fog" onClick={() => onAction('front fog')} whileTap={{
          scale: .97
        }} transition={{
          duration: .14
        }}>
            <div className="absolute bg-[#0e0e0e] border-2 border-[rgba(255,255,255,0.4)] border-solid inset-0 rounded-[50px]" data-node-id="I193:3243;188:1809;18:3" />
            <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-center text-white top-1/2" data-node-id="I193:3243;188:1809;18:2">
              <p className="leading-[normal]">FRONT FOG</p>
            </div>
          </motion.button>
          <div className="absolute contents left-[560px] top-[183px]" data-node-id="I193:3243;188:1810" data-name="Lights Slider">
            <div className="absolute h-[60px] left-[560px] top-[183px] w-[680px]" data-node-id="I193:3243;188:1811" data-name="background">
              <div className="absolute inset-0 rounded-[50px]" data-node-id="I193:3243;188:1811;18:3" style={{
              backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.1) 100%), linear-gradient(90deg, rgb(14, 14, 14) 0%, rgb(14, 14, 14) 100%)"
            }} />
            </div>
            <motion.button className="absolute block cursor-pointer h-[60px] left-[560px] top-[183px] w-[170px]" data-node-id="I193:3243;188:1812" data-name="off" type="button" aria-label="headlights:off" data-setting-action="headlights:off" onClick={() => onAction('headlights:off')} whileTap={{
            scale: .97
          }} transition={{
            duration: .14
          }} aria-pressed={active('headlights:off')} data-choice="true" style={{
            background: active('headlights:off') ? '#6c6c6c' : 'transparent',
            borderRadius: 50,
            boxShadow: active('headlights:off') && false ? '0 3px 4px #0004' : undefined
          }}>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-center text-white top-1/2" data-node-id="I193:3243;188:1812;18:2">
                <p className="leading-[normal]">Off</p>
              </div>
            </motion.button>
            <motion.button className="absolute h-[60px] left-[730px] top-[183px] w-[170px]" data-node-id="I193:3243;188:1813" data-name="parking" type="button" aria-label="headlights:parking" data-setting-action="headlights:parking" onClick={() => onAction('headlights:parking')} whileTap={{
            scale: .97
          }} transition={{
            duration: .14
          }} aria-pressed={active('headlights:parking')} data-choice="true" style={{
            background: active('headlights:parking') ? '#6c6c6c' : 'transparent',
            borderRadius: 50,
            boxShadow: active('headlights:parking') && false ? '0 3px 4px #0004' : undefined
          }}>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-center text-white top-1/2" data-node-id="I193:3243;188:1813;18:2">
                <p className="leading-[normal]">Parking</p>
              </div>
            </motion.button>
            <motion.button className="absolute h-[60px] left-[900px] top-[183px] w-[170px]" data-node-id="I193:3243;188:1814" data-name="on" type="button" aria-label="headlights:on" data-setting-action="headlights:on" onClick={() => onAction('headlights:on')} whileTap={{
            scale: .97
          }} transition={{
            duration: .14
          }} aria-pressed={active('headlights:on')} data-choice="true" style={{
            background: active('headlights:on') ? '#6c6c6c' : 'transparent',
            borderRadius: 50,
            boxShadow: active('headlights:on') && false ? '0 3px 4px #0004' : undefined
          }}>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-center text-white top-1/2" data-node-id="I193:3243;188:1814;18:2">
                <p className="leading-[normal]">On</p>
              </div>
            </motion.button>
            <motion.button className="absolute h-[60px] left-[1070px] top-[183px] w-[170px]" data-node-id="I193:3243;188:1815" data-name="auto" type="button" aria-label="headlights:auto" data-setting-action="headlights:auto" onClick={() => onAction('headlights:auto')} whileTap={{
            scale: .97
          }} transition={{
            duration: .14
          }} aria-pressed={active('headlights:auto')} data-choice="true" style={{
            background: active('headlights:auto') ? '#6c6c6c' : 'transparent',
            borderRadius: 50,
            boxShadow: active('headlights:auto') && false ? '0 3px 4px #0004' : undefined
          }}>
              <div className="absolute inset-0 rounded-[50px]" data-node-id="I193:3243;188:1815;18:3" style={{
              backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.4) 100%), linear-gradient(90deg, rgb(14, 14, 14) 0%, rgb(14, 14, 14) 100%)"
            }} hidden={true} />
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-center text-white top-1/2" data-node-id="I193:3243;188:1815;18:2">
                <p className="leading-[normal]">Auto</p>
              </div>
            </motion.button>
          </div>
          <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[560px] text-[20px] text-white top-[152.5px] whitespace-nowrap" data-node-id="I193:3243;188:1816">
            <p className="leading-[normal]">Headlights</p>
          </div>
          <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[560px] text-[26px] text-white top-[100px] whitespace-nowrap" data-node-id="I193:3243;188:1817">
            <p className="leading-[normal]">Exterior</p>
          </div>
        </div>
        <motion.button className="absolute block cursor-pointer left-[520px] size-[48px] top-[20px]" data-node-id="I193:3243;86:936" data-name="exit" type="button" aria-label="close" data-setting-action="close" onClick={() => onAction('close')} whileTap={{
        scale: .97
      }} transition={{
        duration: .14
      }}>
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgExit} />
        </motion.button>
      </div>
    </div>;
}
