import type { SettingsFrameProps } from '../settingsTypes'
import { motion } from 'motion/react'
const imgNavBg = "/cockpit/tesla-figma/panel-service-light-imgNavBg.svg";
const imgGlovebox = "/cockpit/tesla-figma/panel-service-light-imgGlovebox.svg";
const imgService = "/cockpit/tesla-figma/panel-service-light-imgService.svg";
const imgSafetyAndSecurity = "/cockpit/tesla-figma/panel-service-light-imgSafetyAndSecurity.svg";
const imgSteeringWheelSmall = "/cockpit/tesla-figma/panel-service-light-imgSteeringWheelSmall.svg";
const imgModel3IconSmall = "/cockpit/tesla-figma/panel-service-light-imgModel3IconSmall.svg";
const imgGroup = "/cockpit/tesla-figma/panel-service-light-imgGroup.svg";
const imgLock = "/cockpit/tesla-figma/panel-service-light-imgLock.svg";
const imgLights = "/cockpit/tesla-figma/panel-service-light-imgLights.svg";
const imgQuickControls = "/cockpit/tesla-figma/panel-service-light-imgQuickControls.svg";
const imgSettingsBg = "/cockpit/tesla-figma/panel-service-light-imgSettingsBg.svg";
const imgHeadlightsSmall = "/cockpit/tesla-figma/panel-service-light-imgHeadlightsSmall.svg";
const imgWiper = "/cockpit/tesla-figma/panel-service-light-imgWiper.svg";
const imgExit = "/cockpit/tesla-figma/panel-service-light-imgExit.svg";
export default function SettingsServiceLight({
  onNavigate,
  onAction
}: SettingsFrameProps) {
  return <div className="drop-shadow-[0px_4px_2px_rgba(0,0,0,0.25)] relative size-full" data-node-id="497:13987" data-name="Settings / Light">
      <div className="absolute inset-0 overflow-clip" data-node-id="I497:13987;663:60352" data-name="Settings / Light">
        <div className="absolute contents left-0 top-0" data-node-id="I497:13987;663:60352;193:2055" data-name="Nav Tree">
          <div className="absolute bottom-0 right-[800px] top-0 w-[500px]" data-node-id="I497:13987;663:60352;88:127" data-name="nav-bg">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgNavBg} />
          </div>
          <div className="absolute contents left-[40px] top-[60px]" data-node-id="I497:13987;663:60352;88:363" data-name="Menu">
            <div className="absolute contents left-[40px] top-[900px]" data-node-id="I497:13987;663:60352;192:3708" data-name="Glovebox Button">
              <motion.button className="absolute bottom-[160px] h-[60px] right-[840px] w-[420px]" data-node-id="I497:13987;663:60352;192:2542" data-name="Glovebox" type="button" aria-label="Glovebox" data-setting-action="Glovebox" onClick={() => onAction('Glovebox')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }}>
                <div className="absolute border-2 border-[rgba(0,0,0,0.4)] border-solid inset-0 rounded-[50px]" data-node-id="I497:13987;663:60352;192:2542;18:3" />
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13987;663:60352;192:2542;18:2">
                  <p className="leading-[normal]">Glovebox</p>
                </div>
              </motion.button>
              <div className="absolute left-[56px] size-[48px] top-[906px]" data-node-id="I497:13987;663:60352;192:3637" data-name="glovebox">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgGlovebox} />
              </div>
            </div>
            <div className="absolute contents cursor-pointer right-[1123px] top-[620px]" data-node-id="I497:13987;663:60352;88:354" data-name="Service" data-nav-visual="service">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[620px]" data-node-id="I497:13987;663:60352;88:342" data-name="service">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgService} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[645.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13987;663:60352;88:353">
                <p className="leading-[normal]">Service</p>
              </div>
            <motion.button type="button" className="tesla-settings-nav-hit" style={{
              left: 24,
              top: 608,
              width: 450,
              height: 72
            }} aria-label="Service" aria-current={"page"} onClick={() => onNavigate('service')} whileTap={{
              backgroundColor: '#8883'
            }} /></div>
            <div className="absolute contents cursor-pointer right-[1028px] top-[540px]" data-node-id="I497:13987;663:60352;88:355" data-name="Safety & Security" data-nav-visual="safety">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[540px]" data-node-id="I497:13987;663:60352;88:325" data-name="safety and security">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgSafetyAndSecurity} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[565.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13987;663:60352;88:352">
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
            <div className="absolute contents cursor-pointer right-[1101px] top-[460px]" data-node-id="I497:13987;663:60352;88:356" data-name="Autopilot" data-nav-visual="autopilot">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[460px]" data-node-id="I497:13987;663:60352;88:296" data-name="steering wheel-small">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgSteeringWheelSmall} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[485.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13987;663:60352;88:351">
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
            <div className="absolute contents cursor-pointer right-[1123px] top-[380px]" data-node-id="I497:13987;663:60352;88:357" data-name="Driving" data-nav-visual="driving">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[380px]" data-node-id="I497:13987;663:60352;88:176" data-name="model3-icon-small">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgModel3IconSmall} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[405.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13987;663:60352;88:350">
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
            <div className="absolute contents cursor-pointer right-[1123px] top-[300px]" data-node-id="I497:13987;663:60352;88:358" data-name="Display" data-nav-visual="display">
              <div className="absolute opacity-60 overflow-clip right-[1212px] size-[48px] top-[300px]" data-node-id="I497:13987;663:60352;88:170" data-name="display">
                <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[22px] left-1/2 top-1/2 w-[30px]" data-node-id="I497:13987;663:60352;88:170;170:0" data-name="Group">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgGroup} />
                </div>
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[325.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13987;663:60352;88:349">
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
            <div className="absolute contents cursor-pointer right-[1139px] top-[220px]" data-node-id="I497:13987;663:60352;88:359" data-name="Locks" data-nav-visual="locks">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[220px]" data-node-id="I497:13987;663:60352;88:163" data-name="lock">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgLock} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[245.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13987;663:60352;88:348">
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
            <div className="absolute contents cursor-pointer right-[1135px] top-[140px]" data-node-id="I497:13987;663:60352;88:360" data-name="Lights" data-nav-visual="lights">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[140px]" data-node-id="I497:13987;663:60352;88:159" data-name="lights">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgLights} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[165.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13987;663:60352;88:347">
                <p className="leading-[normal]">Lights</p>
              </div>
            <motion.button type="button" className="tesla-settings-nav-hit" style={{
              left: 24,
              top: 128,
              width: 450,
              height: 72
            }} aria-label="Lights" aria-current={undefined} onClick={() => onNavigate('lights')} whileTap={{
              backgroundColor: '#8883'
            }} /></div>
            <div className="absolute contents cursor-pointer right-[1048px] top-[60px]" data-node-id="I497:13987;663:60352;88:361" data-name="Quick Controls" data-nav-visual="quick">
              <div className="absolute right-[1212px] size-[48px] top-[60px]" data-node-id="I497:13987;663:60352;88:141" data-name="quick controls">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgQuickControls} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] right-[1196px] text-[20px] text-black top-[85.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13987;663:60352;88:346">
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
        <div className="absolute contents left-[500px] top-0" data-node-id="I497:13987;663:60352;193:2445" data-name="Settings">
          <div className="absolute bottom-0 left-[500px] top-0 w-[800px]" data-node-id="I497:13987;663:60352;88:126" data-name="settings-bg">
            <div className="absolute inset-[0_-0.5%_-0.71%_-0.5%]">
              <img alt="" className="block max-w-none size-full" src={imgSettingsBg} />
            </div>
          </div>
          <div className="absolute contents left-[560px] top-[80px]" data-node-id="I497:13987;663:60352;193:394" data-name="Service">
            <motion.button className="absolute h-[177px] left-[560px] overflow-clip top-[437px] w-[330px]" data-node-id="I497:13987;663:60352;193:396" data-name="steering wheel" type="button" aria-label="headlight-reset" data-setting-action="headlight-reset" onClick={() => onAction('headlight-reset')} whileTap={{
            scale: .97
          }} transition={{
            duration: .14
          }}>
              <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13987;663:60352;193:397" style={{
              backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.1) 100%), linear-gradient(90deg, rgb(219, 219, 219) 0%, rgb(219, 219, 219) 100%)"
            }} />
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[25px] justify-center leading-[0] left-[20px] right-[20px] text-[20px] text-black text-center top-[calc(50%+46px)] uppercase" data-node-id="I497:13987;663:60352;193:398">
                <p className="leading-[normal]">Headlight Reset</p>
              </div>
              <div className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%+1px)] size-[48px] top-[calc(50%-9.5px)]" data-node-id="I497:13987;663:60352;193:1622" data-name="headlights-small">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgHeadlightsSmall} />
              </div>
            </motion.button>
            <motion.button className="absolute h-[177px] left-[560px] overflow-clip top-[220px] w-[330px]" data-node-id="I497:13987;663:60352;193:400" data-name="headlights" type="button" aria-label="adjust-headlights" data-setting-action="adjust-headlights" onClick={() => onAction('adjust-headlights')} whileTap={{
            scale: .97
          }} transition={{
            duration: .14
          }}>
              <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13987;663:60352;193:401" style={{
              backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.1) 100%), linear-gradient(90deg, rgb(219, 219, 219) 0%, rgb(219, 219, 219) 100%)"
            }} />
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[25px] justify-center leading-[0] left-[20px] right-[20px] text-[20px] text-black text-center top-[calc(50%+46px)] uppercase" data-node-id="I497:13987;663:60352;193:402">
                <p className="leading-[normal]">Adjust Headlights</p>
              </div>
              <div className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%+1px)] size-[48px] top-[calc(50%-9.5px)]" data-node-id="I497:13987;663:60352;193:1638" data-name="headlights-small">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgHeadlightsSmall} />
              </div>
            </motion.button>
            <div className="absolute contents left-[560px] top-[80px]" data-node-id="I497:13987;663:60352;193:1355" data-name="Glovebox Button">
              <motion.button className="absolute bottom-[980px] h-[60px] right-[340px] w-[400px]" data-node-id="I497:13987;663:60352;193:1356" data-name="Glovebox" type="button" aria-label="wiper-service" data-setting-action="wiper-service" onClick={() => onAction('wiper-service')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }}>
                <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13987;663:60352;193:1356;18:3" style={{
                backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.1) 100%), linear-gradient(90deg, rgb(219, 219, 219) 0%, rgb(219, 219, 219) 100%)"
              }} />
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13987;663:60352;193:1356;18:2">
                  <p className="leading-[normal]">Wiper Service Mode</p>
                </div>
              </motion.button>
              <div className="absolute left-[572.95px] size-[48px] top-[86px]" data-node-id="I497:13987;663:60352;193:1357" data-name="wiper">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgWiper} />
              </div>
            </div>
          </div>
          <motion.button className="absolute block cursor-pointer left-[520px] size-[48px] top-[20px]" data-node-id="I497:13987;663:60352;86:936" data-name="exit" type="button" aria-label="close" data-setting-action="close" onClick={() => onAction('close')} whileTap={{
          scale: .97
        }} transition={{
          duration: .14
        }}>
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgExit} />
          </motion.button>
        </div>
      </div>
    </div>;
}
