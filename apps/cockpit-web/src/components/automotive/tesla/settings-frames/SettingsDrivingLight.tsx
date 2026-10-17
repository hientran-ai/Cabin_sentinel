import type { SettingsFrameProps } from '../settingsTypes'
import { motion } from 'motion/react'
const imgNavBg = "/cockpit/tesla-figma/panel-driving-light-imgNavBg.svg";
const imgGlovebox = "/cockpit/tesla-figma/panel-driving-light-imgGlovebox.svg";
const imgService = "/cockpit/tesla-figma/panel-driving-light-imgService.svg";
const imgSafetyAndSecurity = "/cockpit/tesla-figma/panel-driving-light-imgSafetyAndSecurity.svg";
const imgSteeringWheelSmall = "/cockpit/tesla-figma/panel-driving-light-imgSteeringWheelSmall.svg";
const imgModel3IconSmall = "/cockpit/tesla-figma/panel-driving-light-imgModel3IconSmall.svg";
const imgGroup = "/cockpit/tesla-figma/panel-driving-light-imgGroup.svg";
const imgLock = "/cockpit/tesla-figma/panel-driving-light-imgLock.svg";
const imgLights = "/cockpit/tesla-figma/panel-driving-light-imgLights.svg";
const imgQuickControls = "/cockpit/tesla-figma/panel-driving-light-imgQuickControls.svg";
const imgSettingsBg = "/cockpit/tesla-figma/panel-driving-light-imgSettingsBg.svg";
const imgExit = "/cockpit/tesla-figma/panel-driving-light-imgExit.svg";
export default function SettingsDrivingLight({
  onNavigate,
  onAction,
  active
}: SettingsFrameProps) {
  return <div className="drop-shadow-[0px_4px_2px_rgba(0,0,0,0.25)] relative size-full" data-node-id="497:13948" data-name="Settings / Light">
      <div className="absolute inset-0 overflow-clip" data-node-id="I497:13948;663:60352" data-name="Settings / Light">
        <div className="absolute contents left-0 top-0" data-node-id="I497:13948;663:60352;193:2055" data-name="Nav Tree">
          <div className="absolute bottom-0 right-[800px] top-0 w-[500px]" data-node-id="I497:13948;663:60352;88:127" data-name="nav-bg">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgNavBg} />
          </div>
          <div className="absolute contents left-[40px] top-[60px]" data-node-id="I497:13948;663:60352;88:363" data-name="Menu">
            <div className="absolute contents left-[40px] top-[900px]" data-node-id="I497:13948;663:60352;192:3708" data-name="Glovebox Button">
              <motion.button className="absolute bottom-[160px] h-[60px] right-[840px] w-[420px]" data-node-id="I497:13948;663:60352;192:2542" data-name="Glovebox" type="button" aria-label="Glovebox" data-setting-action="Glovebox" onClick={() => onAction('Glovebox')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }}>
                <div className="absolute border-2 border-[rgba(0,0,0,0.4)] border-solid inset-0 rounded-[50px]" data-node-id="I497:13948;663:60352;192:2542;18:3" />
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13948;663:60352;192:2542;18:2">
                  <p className="leading-[normal]">Glovebox</p>
                </div>
              </motion.button>
              <div className="absolute left-[56px] size-[48px] top-[906px]" data-node-id="I497:13948;663:60352;192:3637" data-name="glovebox">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgGlovebox} />
              </div>
            </div>
            <div className="absolute contents cursor-pointer right-[1123px] top-[620px]" data-node-id="I497:13948;663:60352;88:354" data-name="Service" data-nav-visual="service">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[620px]" data-node-id="I497:13948;663:60352;88:342" data-name="service">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgService} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[645.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13948;663:60352;88:353">
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
            <div className="absolute contents cursor-pointer right-[1028px] top-[540px]" data-node-id="I497:13948;663:60352;88:355" data-name="Safety & Security" data-nav-visual="safety">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[540px]" data-node-id="I497:13948;663:60352;88:325" data-name="safety and security">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgSafetyAndSecurity} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[565.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13948;663:60352;88:352">
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
            <div className="absolute contents cursor-pointer right-[1101px] top-[460px]" data-node-id="I497:13948;663:60352;88:356" data-name="Autopilot" data-nav-visual="autopilot">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[460px]" data-node-id="I497:13948;663:60352;88:296" data-name="steering wheel-small">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgSteeringWheelSmall} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[485.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13948;663:60352;88:351">
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
            <div className="absolute contents cursor-pointer right-[1123px] top-[380px]" data-node-id="I497:13948;663:60352;88:357" data-name="Driving" data-nav-visual="driving">
              <div className="absolute right-[1212px] size-[48px] top-[380px]" data-node-id="I497:13948;663:60352;88:176" data-name="model3-icon-small">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgModel3IconSmall} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] right-[1196px] text-[20px] text-black top-[405.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13948;663:60352;88:350">
                <p className="leading-[normal]">Driving</p>
              </div>
            <motion.button type="button" className="tesla-settings-nav-hit" style={{
              left: 24,
              top: 368,
              width: 450,
              height: 72
            }} aria-label="Driving" aria-current={"page"} onClick={() => onNavigate('driving')} whileTap={{
              backgroundColor: '#8883'
            }} /></div>
            <div className="absolute contents cursor-pointer right-[1123px] top-[300px]" data-node-id="I497:13948;663:60352;88:358" data-name="Display" data-nav-visual="display">
              <div className="absolute opacity-60 overflow-clip right-[1212px] size-[48px] top-[300px]" data-node-id="I497:13948;663:60352;88:170" data-name="display">
                <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[22px] left-1/2 top-1/2 w-[30px]" data-node-id="I497:13948;663:60352;88:170;170:0" data-name="Group">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgGroup} />
                </div>
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[325.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13948;663:60352;88:349">
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
            <div className="absolute contents cursor-pointer right-[1139px] top-[220px]" data-node-id="I497:13948;663:60352;88:359" data-name="Locks" data-nav-visual="locks">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[220px]" data-node-id="I497:13948;663:60352;88:163" data-name="lock">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgLock} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[245.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13948;663:60352;88:348">
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
            <div className="absolute contents cursor-pointer right-[1135px] top-[140px]" data-node-id="I497:13948;663:60352;88:360" data-name="Lights" data-nav-visual="lights">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[140px]" data-node-id="I497:13948;663:60352;88:159" data-name="lights">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgLights} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[165.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13948;663:60352;88:347">
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
            <div className="absolute contents cursor-pointer right-[1048px] top-[60px]" data-node-id="I497:13948;663:60352;88:361" data-name="Quick Controls" data-nav-visual="quick">
              <div className="absolute opacity-40 right-[1212px] size-[48px] top-[60px]" data-node-id="I497:13948;663:60352;88:141" data-name="quick controls">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgQuickControls} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-40 right-[1196px] text-[20px] text-black top-[85.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13948;663:60352;88:346">
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
        <div className="absolute contents left-[500px] top-0" data-node-id="I497:13948;663:60352;193:2445" data-name="Settings">
          <div className="absolute bottom-0 left-[500px] top-0 w-[800px]" data-node-id="I497:13948;663:60352;88:126" data-name="settings-bg">
            <div className="absolute inset-[0_-0.5%_-0.71%_-0.5%]">
              <img alt="" className="block max-w-none size-full" src={imgSettingsBg} />
            </div>
          </div>
          <div className="absolute contents left-[560px] top-[84px]" data-node-id="I497:13948;663:60352;192:399" data-name="Driving">
            <div className="absolute contents left-[560px] top-[579px]" data-node-id="I497:13948;663:60352;192:404" data-name="Group">
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[560px] text-[20px] text-[rgba(0,0,0,0.6)] top-[667.5px] whitespace-nowrap" data-node-id="I497:13948;663:60352;192:405">
                <p className="leading-[normal]">Slowly move forward when the brake pedal is released</p>
              </div>
              <motion.button className="absolute h-[60px] left-[560px] top-[579px] w-[220px]" data-node-id="I497:13948;663:60352;192:406" data-name="Creep" type="button" aria-label="Creep" data-setting-action="Creep" onClick={() => onAction('Creep')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }}>
                <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13948;663:60352;192:406;18:3" style={{
                backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.1) 100%), linear-gradient(90deg, rgb(219, 219, 219) 0%, rgb(219, 219, 219) 100%)"
              }} />
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13948;663:60352;192:406;18:2">
                  <p className="leading-[normal]">Creep</p>
                </div>
              </motion.button>
            </div>
            <div className="absolute contents left-[560px] top-[395px]" data-node-id="I497:13948;663:60352;192:400" data-name="Group">
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[560px] text-[20px] text-[rgba(0,0,0,0.6)] top-[526.5px] whitespace-nowrap" data-node-id="I497:13948;663:60352;192:401">
                <p className="leading-[normal]">Used to help vehicle stuck in sand, snow, or mud</p>
              </div>
              <motion.button className="absolute h-[60px] left-[560px] top-[438px] w-[220px]" data-node-id="I497:13948;663:60352;192:402" data-name="Slip Start" type="button" aria-label="Slip Start" data-setting-action="Slip Start" onClick={() => onAction('Slip Start')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }}>
                <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13948;663:60352;192:402;18:3" style={{
                backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.1) 100%), linear-gradient(90deg, rgb(219, 219, 219) 0%, rgb(219, 219, 219) 100%)"
              }} />
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13948;663:60352;192:402;18:2">
                  <p className="leading-[normal]">Slip Start</p>
                </div>
              </motion.button>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[560px] text-[20px] text-black top-[407.5px] whitespace-nowrap" data-node-id="I497:13948;663:60352;192:403">
                <p className="leading-[normal]">Traction Control</p>
              </div>
            </div>
            <div className="absolute contents left-[560px] top-[211px]" data-node-id="I497:13948;663:60352;192:407" data-name="Group">
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[560px] text-[20px] text-[rgba(0,0,0,0.6)] top-[342.5px] whitespace-nowrap" data-node-id="I497:13948;663:60352;192:408">
                <p className="leading-[normal]">Standard increases range and extends battery life</p>
              </div>
              <div className="absolute h-[60px] left-[560px] top-[254px] w-[680px]" data-node-id="I497:13948;663:60352;192:409" data-name="background">
                <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13948;663:60352;192:409;18:3" style={{
                backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.1) 100%), linear-gradient(90deg, rgb(219, 219, 219) 0%, rgb(219, 219, 219) 100%)"
              }} />
              </div>
              <motion.button className="absolute h-[60px] left-[560px] top-[254px] w-[340px]" data-node-id="I497:13948;663:60352;192:410" data-name="Standard" type="button" aria-label="regen:standard" data-setting-action="regen:standard" onClick={() => onAction('regen:standard')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }} aria-pressed={active('regen:standard')} data-choice="true" style={{
              background: active('regen:standard') ? '#fff' : 'transparent',
              borderRadius: 50,
              boxShadow: active('regen:standard') && true ? '0 3px 4px #0004' : undefined
            }}>
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13948;663:60352;192:410;18:2">
                  <p className="leading-[normal]">Standard</p>
                </div>
              </motion.button>
              <motion.button className="absolute h-[60px] left-[900px] top-[254px] w-[340px]" data-node-id="I497:13948;663:60352;192:411" data-name="Low" type="button" aria-label="regen:low" data-setting-action="regen:low" onClick={() => onAction('regen:low')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }} aria-pressed={active('regen:low')} data-choice="true" style={{
              background: active('regen:low') ? '#fff' : 'transparent',
              borderRadius: 50,
              boxShadow: active('regen:low') && true ? '0 3px 4px #0004' : undefined
            }}>
                <div className="absolute bg-white inset-0 rounded-[50px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]" data-node-id="I497:13948;663:60352;192:411;18:3" hidden={true} />
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13948;663:60352;192:411;18:2">
                  <p className="leading-[normal]">Low</p>
                </div>
              </motion.button>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[560px] text-[20px] text-black top-[223.5px] whitespace-nowrap" data-node-id="I497:13948;663:60352;192:412">
                <p className="leading-[normal]">Regenerative Braking</p>
              </div>
            </div>
            <div className="absolute contents left-[560px] top-[84px]" data-node-id="I497:13948;663:60352;192:413" data-name="Group">
              <div className="absolute h-[60px] left-[560px] top-[127px] w-[680px]" data-node-id="I497:13948;663:60352;192:414" data-name="background">
                <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13948;663:60352;192:414;18:3" style={{
                backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.1) 100%), linear-gradient(90deg, rgb(219, 219, 219) 0%, rgb(219, 219, 219) 100%)"
              }} />
              </div>
              <motion.button className="absolute h-[60px] left-[560px] top-[127px] w-[226px]" data-node-id="I497:13948;663:60352;192:415" data-name="comfort" type="button" aria-label="steering:comfort" data-setting-action="steering:comfort" onClick={() => onAction('steering:comfort')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }} aria-pressed={active('steering:comfort')} data-choice="true" style={{
              background: active('steering:comfort') ? '#fff' : 'transparent',
              borderRadius: 50,
              boxShadow: active('steering:comfort') && true ? '0 3px 4px #0004' : undefined
            }}>
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13948;663:60352;192:415;18:2">
                  <p className="leading-[normal]">Comfort</p>
                </div>
              </motion.button>
              <motion.button className="absolute h-[60px] left-[787px] top-[127px] w-[226px]" data-node-id="I497:13948;663:60352;192:416" data-name="standard" type="button" aria-label="steering:standard" data-setting-action="steering:standard" onClick={() => onAction('steering:standard')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }} aria-pressed={active('steering:standard')} data-choice="true" style={{
              background: active('steering:standard') ? '#fff' : 'transparent',
              borderRadius: 50,
              boxShadow: active('steering:standard') && true ? '0 3px 4px #0004' : undefined
            }}>
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13948;663:60352;192:416;18:2">
                  <p className="leading-[normal]">Standard</p>
                </div>
              </motion.button>
              <motion.button className="absolute h-[60px] left-[1014px] top-[127px] w-[226px]" data-node-id="I497:13948;663:60352;192:417" data-name="sport" type="button" aria-label="steering:sport" data-setting-action="steering:sport" onClick={() => onAction('steering:sport')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }} aria-pressed={active('steering:sport')} data-choice="true" style={{
              background: active('steering:sport') ? '#fff' : 'transparent',
              borderRadius: 50,
              boxShadow: active('steering:sport') && true ? '0 3px 4px #0004' : undefined
            }}>
                <div className="absolute bg-white inset-0 rounded-[50px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]" data-node-id="I497:13948;663:60352;192:417;18:3" hidden={true} />
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13948;663:60352;192:417;18:2">
                  <p className="leading-[normal]">Sport</p>
                </div>
              </motion.button>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[560px] text-[20px] text-black top-[96.5px] whitespace-nowrap" data-node-id="I497:13948;663:60352;192:418">
                <p className="leading-[normal]">Steering Mode</p>
              </div>
            </div>
          </div>
          <motion.button className="absolute block cursor-pointer left-[520px] size-[48px] top-[20px]" data-node-id="I497:13948;663:60352;86:936" data-name="exit" type="button" aria-label="close" data-setting-action="close" onClick={() => onAction('close')} whileTap={{
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
