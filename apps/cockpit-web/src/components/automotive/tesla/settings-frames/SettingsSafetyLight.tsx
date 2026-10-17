import type { SettingsFrameProps } from '../settingsTypes'
import { motion } from 'motion/react'
const imgNavBg = "/cockpit/tesla-figma/panel-safety-light-imgNavBg.svg";
const imgGlovebox = "/cockpit/tesla-figma/panel-safety-light-imgGlovebox.svg";
const imgService = "/cockpit/tesla-figma/panel-safety-light-imgService.svg";
const imgSafetyAndSecurity = "/cockpit/tesla-figma/panel-safety-light-imgSafetyAndSecurity.svg";
const imgSteeringWheelSmall = "/cockpit/tesla-figma/panel-safety-light-imgSteeringWheelSmall.svg";
const imgModel3IconSmall = "/cockpit/tesla-figma/panel-safety-light-imgModel3IconSmall.svg";
const imgGroup = "/cockpit/tesla-figma/panel-safety-light-imgGroup.svg";
const imgLock = "/cockpit/tesla-figma/panel-safety-light-imgLock.svg";
const imgLights = "/cockpit/tesla-figma/panel-safety-light-imgLights.svg";
const imgQuickControls = "/cockpit/tesla-figma/panel-safety-light-imgQuickControls.svg";
const imgSettingsBg = "/cockpit/tesla-figma/panel-safety-light-imgSettingsBg.svg";
const imgEllipse2 = "/cockpit/tesla-figma/panel-safety-light-imgEllipse2.svg";
const imgEllipse18 = "/cockpit/tesla-figma/panel-safety-light-imgEllipse18.svg";
const imgExit = "/cockpit/tesla-figma/panel-safety-light-imgExit.svg";
export default function SettingsSafetyLight({
  onNavigate,
  onAction
}: SettingsFrameProps) {
  return <div className="drop-shadow-[0px_4px_2px_rgba(0,0,0,0.25)] relative size-full" data-node-id="497:13974" data-name="Settings / Light">
      <div className="absolute inset-0 overflow-clip" data-node-id="I497:13974;663:60352" data-name="Settings / Light">
        <div className="absolute contents left-0 top-0" data-node-id="I497:13974;663:60352;193:2055" data-name="Nav Tree">
          <div className="absolute bottom-0 right-[800px] top-0 w-[500px]" data-node-id="I497:13974;663:60352;88:127" data-name="nav-bg">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgNavBg} />
          </div>
          <div className="absolute contents left-[40px] top-[60px]" data-node-id="I497:13974;663:60352;88:363" data-name="Menu">
            <div className="absolute contents left-[40px] top-[900px]" data-node-id="I497:13974;663:60352;192:3708" data-name="Glovebox Button">
              <motion.button className="absolute bottom-[160px] h-[60px] right-[840px] w-[420px]" data-node-id="I497:13974;663:60352;192:2542" data-name="Glovebox" type="button" aria-label="Glovebox" data-setting-action="Glovebox" onClick={() => onAction('Glovebox')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }}>
                <div className="absolute border-2 border-[rgba(0,0,0,0.4)] border-solid inset-0 rounded-[50px]" data-node-id="I497:13974;663:60352;192:2542;18:3" />
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13974;663:60352;192:2542;18:2">
                  <p className="leading-[normal]">Glovebox</p>
                </div>
              </motion.button>
              <div className="absolute left-[56px] size-[48px] top-[906px]" data-node-id="I497:13974;663:60352;192:3637" data-name="glovebox">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgGlovebox} />
              </div>
            </div>
            <div className="absolute contents cursor-pointer right-[1123px] top-[620px]" data-node-id="I497:13974;663:60352;88:354" data-name="Service" data-nav-visual="service">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[620px]" data-node-id="I497:13974;663:60352;88:342" data-name="service">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgService} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[645.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13974;663:60352;88:353">
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
            <div className="absolute contents cursor-pointer right-[1028px] top-[540px]" data-node-id="I497:13974;663:60352;88:355" data-name="Safety & Security" data-nav-visual="safety">
              <div className="absolute right-[1212px] size-[48px] top-[540px]" data-node-id="I497:13974;663:60352;88:325" data-name="safety and security">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgSafetyAndSecurity} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] right-[1196px] text-[20px] text-black top-[565.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13974;663:60352;88:352">
                <p className="leading-[normal]">{`Safety & Security`}</p>
              </div>
            <motion.button type="button" className="tesla-settings-nav-hit" style={{
              left: 24,
              top: 528,
              width: 450,
              height: 72
            }} aria-label="Safety & Security" aria-current={"page"} onClick={() => onNavigate('safety')} whileTap={{
              backgroundColor: '#8883'
            }} /></div>
            <div className="absolute contents cursor-pointer right-[1101px] top-[460px]" data-node-id="I497:13974;663:60352;88:356" data-name="Autopilot" data-nav-visual="autopilot">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[460px]" data-node-id="I497:13974;663:60352;88:296" data-name="steering wheel-small">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgSteeringWheelSmall} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[485.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13974;663:60352;88:351">
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
            <div className="absolute contents cursor-pointer right-[1123px] top-[380px]" data-node-id="I497:13974;663:60352;88:357" data-name="Driving" data-nav-visual="driving">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[380px]" data-node-id="I497:13974;663:60352;88:176" data-name="model3-icon-small">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgModel3IconSmall} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[405.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13974;663:60352;88:350">
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
            <div className="absolute contents cursor-pointer right-[1123px] top-[300px]" data-node-id="I497:13974;663:60352;88:358" data-name="Display" data-nav-visual="display">
              <div className="absolute opacity-60 overflow-clip right-[1212px] size-[48px] top-[300px]" data-node-id="I497:13974;663:60352;88:170" data-name="display">
                <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[22px] left-1/2 top-1/2 w-[30px]" data-node-id="I497:13974;663:60352;88:170;170:0" data-name="Group">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgGroup} />
                </div>
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[325.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13974;663:60352;88:349">
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
            <div className="absolute contents cursor-pointer right-[1139px] top-[220px]" data-node-id="I497:13974;663:60352;88:359" data-name="Locks" data-nav-visual="locks">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[220px]" data-node-id="I497:13974;663:60352;88:163" data-name="lock">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgLock} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[245.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13974;663:60352;88:348">
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
            <div className="absolute contents cursor-pointer right-[1135px] top-[140px]" data-node-id="I497:13974;663:60352;88:360" data-name="Lights" data-nav-visual="lights">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[140px]" data-node-id="I497:13974;663:60352;88:159" data-name="lights">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgLights} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[165.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13974;663:60352;88:347">
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
            <div className="absolute contents cursor-pointer right-[1048px] top-[60px]" data-node-id="I497:13974;663:60352;88:361" data-name="Quick Controls" data-nav-visual="quick">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[60px]" data-node-id="I497:13974;663:60352;88:141" data-name="quick controls">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgQuickControls} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[85.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13974;663:60352;88:346">
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
        <div className="absolute contents left-[500px] top-0" data-node-id="I497:13974;663:60352;193:2445" data-name="Settings">
          <div className="absolute bottom-0 left-[500px] top-0 w-[800px]" data-node-id="I497:13974;663:60352;88:126" data-name="settings-bg">
            <div className="absolute inset-[0_-0.5%_-0.71%_-0.5%]">
              <img alt="" className="block max-w-none size-full" src={imgSettingsBg} />
            </div>
          </div>
          <div className="absolute contents left-[560px] top-[84px]" data-node-id="I497:13974;663:60352;189:0" data-name="Safety & Security">
            <div className="absolute contents left-[560px] top-[342px]" data-node-id="I497:13974;663:60352;192:2366" data-name="Group">
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[560px] text-[20px] text-[rgba(0,0,0,0.4)] top-[471.5px] whitespace-nowrap" data-node-id="I497:13974;663:60352;192:2441">
                <p className="leading-[normal]">Pressing the brake pedal will turn the car on again</p>
              </div>
              <motion.button className="absolute h-[60px] left-[560px] top-[383px] w-[220px]" data-node-id="I497:13974;663:60352;192:2430" data-name="Power Off" type="button" aria-label="power-off" data-setting-action="power-off" onClick={() => onAction('power-off')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }}>
                <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13974;663:60352;192:2430;18:3" style={{
                backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.1) 100%), linear-gradient(90deg, rgb(219, 219, 219) 0%, rgb(219, 219, 219) 100%)"
              }} />
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[#131313] text-[20px] text-center top-1/2" data-node-id="I497:13974;663:60352;192:2430;18:2">
                  <p className="leading-[normal]">Power Off</p>
                </div>
              </motion.button>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[561px] text-[20px] text-black top-[354.5px] whitespace-nowrap" data-node-id="I497:13974;663:60352;192:2368">
                <p className="leading-[normal]">Vehicle Power</p>
              </div>
            </div>
            <div className="absolute contents left-[560px] top-[84px]" data-node-id="I497:13974;663:60352;189:21" data-name="Group">
              <motion.button className="absolute h-[177px] left-[560px] top-[125px] w-[330px]" data-node-id="I497:13974;663:60352;192:1596" data-name="Parking Brake" type="button" aria-label="parking-brake" data-setting-action="parking-brake" onClick={() => onAction('parking-brake')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }}>
                <div className="absolute inset-0 overflow-clip" data-node-id="I497:13974;663:60352;192:1596;192:1577" data-name="Parking Brake - Off">
                  <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13974;663:60352;192:1596;192:1577;192:1478" style={{
                  backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.1) 100%), linear-gradient(90deg, rgb(219, 219, 219) 0%, rgb(219, 219, 219) 100%)"
                }} />
                  <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[25px] justify-center leading-[0] left-[20px] right-[20px] text-[#131313] text-[20px] text-center top-[calc(50%+46px)] uppercase" data-node-id="I497:13974;663:60352;192:1596;192:1577;192:1479">
                    <p className="leading-[normal]">BRAKE IS OFF</p>
                  </div>
                  <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[25px] justify-center leading-[0] left-[124px] right-[20px] text-[#131313] text-[20px] text-center top-[calc(50%-23px)] uppercase" data-node-id="I497:13974;663:60352;192:1596;192:1577;192:1566">
                    <p className="leading-[normal] mb-0">Parking</p>
                    <p className="leading-[normal]">Brake</p>
                  </div>
                  <div className="absolute contents left-[60px] top-[40px]" data-node-id="I497:13974;663:60352;192:1596;192:1577;192:1565" data-name="Parking Brake Icon">
                    <div className="-translate-x-1/2 absolute left-[calc(50%-73px)] overflow-clip size-[48px] top-[40.96px]" data-node-id="I497:13974;663:60352;192:1596;192:1577;192:1481" data-name="Cruise Setting">
                      <div className="absolute left-0 size-[48px] top-0" data-node-id="I497:13974;663:60352;192:1596;192:1577;192:1481;12:1">
                        <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse2} />
                      </div>
                      <div className="-translate-x-1/2 -translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[24px] text-[#131313] text-[27px] text-center top-[24px] w-[48px]" data-node-id="I497:13974;663:60352;192:1596;192:1577;192:1481;12:2">
                        <p className="leading-[normal]">P</p>
                      </div>
                    </div>
                    <div className="absolute h-[50.519px] left-[60px] top-[40px] w-[64px]" data-node-id="I497:13974;663:60352;192:1596;192:1577;192:1564">
                      <div className="absolute inset-[-3.96%_-3.13%_-3.96%_-3.12%]">
                        <img alt="" className="block max-w-none size-full" src={imgEllipse18} />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.button>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[561px] text-[20px] text-black top-[96.5px] whitespace-nowrap" data-node-id="I497:13974;663:60352;189:26">
                <p className="leading-[normal]">Parking Brake</p>
              </div>
              <div className="-translate-x-1/2 -translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[25px] justify-center leading-[0] left-[1095px] text-[20px] text-[rgba(0,0,0,0.4)] text-center top-[220.5px] w-[330px]" data-node-id="I497:13974;663:60352;193:0">
                <p className="leading-[normal] mb-0">Selecting park on the steering column will aslo set the</p>
                <p className="leading-[normal]">parking brake</p>
              </div>
            </div>
          </div>
          <motion.button className="absolute block cursor-pointer left-[520px] size-[48px] top-[20px]" data-node-id="I497:13974;663:60352;86:936" data-name="exit" type="button" aria-label="close" data-setting-action="close" onClick={() => onAction('close')} whileTap={{
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
