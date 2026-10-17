import type { SettingsFrameProps } from '../settingsTypes'
import { motion } from 'motion/react'
const imgNavBg = "/cockpit/tesla-figma/panel-display-light-imgNavBg.svg";
const imgGlovebox = "/cockpit/tesla-figma/panel-display-light-imgGlovebox.svg";
const imgService = "/cockpit/tesla-figma/panel-display-light-imgService.svg";
const imgSafetyAndSecurity = "/cockpit/tesla-figma/panel-display-light-imgSafetyAndSecurity.svg";
const imgSteeringWheelSmall = "/cockpit/tesla-figma/panel-display-light-imgSteeringWheelSmall.svg";
const imgModel3IconSmall = "/cockpit/tesla-figma/panel-display-light-imgModel3IconSmall.svg";
const imgGroup = "/cockpit/tesla-figma/panel-display-light-imgGroup.svg";
const imgLock = "/cockpit/tesla-figma/panel-display-light-imgLock.svg";
const imgLights = "/cockpit/tesla-figma/panel-display-light-imgLights.svg";
const imgQuickControls = "/cockpit/tesla-figma/panel-display-light-imgQuickControls.svg";
const imgSettingsBg = "/cockpit/tesla-figma/panel-display-light-imgSettingsBg.svg";
const imgBrightness = "/cockpit/tesla-figma/panel-display-light-imgBrightness.svg";
const imgExit = "/cockpit/tesla-figma/panel-display-light-imgExit.svg";
export default function SettingsDisplayLight({
  onNavigate,
  onAction,
  active,
  brightness
}: SettingsFrameProps) {
  return <div className="drop-shadow-[0px_4px_2px_rgba(0,0,0,0.25)] relative size-full" data-node-id="497:13935" data-name="Settings / Light">
      <div className="absolute inset-0 overflow-clip" data-node-id="I497:13935;663:60352" data-name="Settings / Light">
        <div className="absolute contents left-0 top-0" data-node-id="I497:13935;663:60352;193:2055" data-name="Nav Tree">
          <div className="absolute bottom-0 right-[800px] top-0 w-[500px]" data-node-id="I497:13935;663:60352;88:127" data-name="nav-bg">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgNavBg} />
          </div>
          <div className="absolute contents left-[40px] top-[60px]" data-node-id="I497:13935;663:60352;88:363" data-name="Menu">
            <div className="absolute contents left-[40px] top-[900px]" data-node-id="I497:13935;663:60352;192:3708" data-name="Glovebox Button">
              <motion.button className="absolute bottom-[160px] h-[60px] right-[840px] w-[420px]" data-node-id="I497:13935;663:60352;192:2542" data-name="Glovebox" type="button" aria-label="Glovebox" data-setting-action="Glovebox" onClick={() => onAction('Glovebox')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }}>
                <div className="absolute border-2 border-[rgba(0,0,0,0.4)] border-solid inset-0 rounded-[50px]" data-node-id="I497:13935;663:60352;192:2542;18:3" />
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13935;663:60352;192:2542;18:2">
                  <p className="leading-[normal]">Glovebox</p>
                </div>
              </motion.button>
              <div className="absolute left-[56px] size-[48px] top-[906px]" data-node-id="I497:13935;663:60352;192:3637" data-name="glovebox">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgGlovebox} />
              </div>
            </div>
            <div className="absolute contents cursor-pointer right-[1122px] top-[620px]" data-node-id="I497:13935;663:60352;88:354" data-name="Service" data-nav-visual="service">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[620px]" data-node-id="I497:13935;663:60352;88:342" data-name="service">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgService} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1195px] text-[20px] text-black top-[645.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13935;663:60352;88:353">
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
            <div className="absolute contents cursor-pointer right-[1026px] top-[540px]" data-node-id="I497:13935;663:60352;88:355" data-name="Safety & Security" data-nav-visual="safety">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[540px]" data-node-id="I497:13935;663:60352;88:325" data-name="safety and security">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgSafetyAndSecurity} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1194px] text-[20px] text-black top-[565.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13935;663:60352;88:352">
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
            <div className="absolute contents cursor-pointer right-[1101px] top-[460px]" data-node-id="I497:13935;663:60352;88:356" data-name="Autopilot" data-nav-visual="autopilot">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[460px]" data-node-id="I497:13935;663:60352;88:296" data-name="steering wheel-small">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgSteeringWheelSmall} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[485.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13935;663:60352;88:351">
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
            <div className="absolute contents cursor-pointer right-[1121px] top-[380px]" data-node-id="I497:13935;663:60352;88:357" data-name="Driving" data-nav-visual="driving">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[380px]" data-node-id="I497:13935;663:60352;88:176" data-name="model3-icon-small">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgModel3IconSmall} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1194px] text-[20px] text-black top-[405.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13935;663:60352;88:350">
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
            <div className="absolute contents cursor-pointer right-[1121px] top-[300px]" data-node-id="I497:13935;663:60352;88:358" data-name="Display" data-nav-visual="display">
              <div className="absolute overflow-clip right-[1212px] size-[48px] top-[300px]" data-node-id="I497:13935;663:60352;88:170" data-name="display">
                <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[22px] left-1/2 top-1/2 w-[30px]" data-node-id="I497:13935;663:60352;88:170;170:0" data-name="Group">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgGroup} />
                </div>
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] right-[1194px] text-[20px] text-black top-[325.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13935;663:60352;88:349">
                <p className="leading-[normal]">Display</p>
              </div>
            <motion.button type="button" className="tesla-settings-nav-hit" style={{
              left: 24,
              top: 288,
              width: 450,
              height: 72
            }} aria-label="Display" aria-current={"page"} onClick={() => onNavigate('display')} whileTap={{
              backgroundColor: '#8883'
            }} /></div>
            <div className="absolute contents cursor-pointer right-[1138px] top-[220px]" data-node-id="I497:13935;663:60352;88:359" data-name="Locks" data-nav-visual="locks">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[220px]" data-node-id="I497:13935;663:60352;88:163" data-name="lock">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgLock} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1195px] text-[20px] text-black top-[245.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13935;663:60352;88:348">
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
            <div className="absolute contents cursor-pointer right-[1132px] top-[140px]" data-node-id="I497:13935;663:60352;88:360" data-name="Lights" data-nav-visual="lights">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[140px]" data-node-id="I497:13935;663:60352;88:159" data-name="lights">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgLights} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1193px] text-[20px] text-black top-[165.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13935;663:60352;88:347">
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
            <div className="absolute contents cursor-pointer right-[1046px] top-[60px]" data-node-id="I497:13935;663:60352;88:361" data-name="Quick Controls" data-nav-visual="quick">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[60px]" data-node-id="I497:13935;663:60352;88:141" data-name="quick controls">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgQuickControls} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1194px] text-[20px] text-black top-[85.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13935;663:60352;88:346">
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
        <div className="absolute contents left-[500px] top-0" data-node-id="I497:13935;663:60352;193:2445" data-name="Settings">
          <div className="absolute bottom-0 left-[500px] top-0 w-[800px]" data-node-id="I497:13935;663:60352;88:126" data-name="settings-bg">
            <div className="absolute inset-[0_-0.5%_-0.71%_-0.5%]">
              <img alt="" className="block max-w-none size-full" src={imgSettingsBg} />
            </div>
          </div>
          <div className="absolute contents left-[560px] top-[84px]" data-node-id="I497:13935;663:60352;188:3943" data-name="Display">
            <div className="absolute contents left-[560px] top-[683px]" data-node-id="I497:13935;663:60352;188:6263" data-name="Group">
              <div className="absolute h-[60px] left-[560px] top-[726px] w-[680px]" data-node-id="I497:13935;663:60352;188:6264" data-name="background">
                <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13935;663:60352;188:6264;18:3" style={{
                backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.1) 100%), linear-gradient(90deg, rgb(219, 219, 219) 0%, rgb(219, 219, 219) 100%)"
              }} />
              </div>
              <motion.button className="absolute h-[60px] left-[560px] top-[726px] w-[340px]" data-node-id="I497:13935;663:60352;188:6265" data-name="ºF" type="button" aria-label="temperature:f" data-setting-action="temperature:f" onClick={() => onAction('temperature:f')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }} aria-pressed={active('temperature:f')} data-choice="true" style={{
              background: active('temperature:f') ? '#fff' : 'transparent',
              borderRadius: 50,
              boxShadow: active('temperature:f') && true ? '0 3px 4px #0004' : undefined
            }}>
                <div className="absolute bg-white inset-0 rounded-[50px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]" data-node-id="I497:13935;663:60352;188:6265;18:3" hidden={true} />
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13935;663:60352;188:6265;18:2">
                  <p className="leading-[normal]">ºF</p>
                </div>
              </motion.button>
              <motion.button className="absolute h-[60px] left-[900px] top-[726px] w-[340px]" data-node-id="I497:13935;663:60352;188:6266" data-name="ºC" type="button" aria-label="temperature:c" data-setting-action="temperature:c" onClick={() => onAction('temperature:c')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }} aria-pressed={active('temperature:c')} data-choice="true" style={{
              background: active('temperature:c') ? '#fff' : 'transparent',
              borderRadius: 50,
              boxShadow: active('temperature:c') && true ? '0 3px 4px #0004' : undefined
            }}>
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13935;663:60352;188:6266;18:2">
                  <p className="leading-[normal]">ºC</p>
                </div>
              </motion.button>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[560px] text-[20px] text-black top-[695.5px] whitespace-nowrap" data-node-id="I497:13935;663:60352;188:6267">
                <p className="leading-[normal]">Temperature</p>
              </div>
            </div>
            <div className="absolute contents left-[560px] top-[556px]" data-node-id="I497:13935;663:60352;188:6006" data-name="Group">
              <div className="absolute h-[60px] left-[560px] top-[599px] w-[680px]" data-node-id="I497:13935;663:60352;188:6007" data-name="background">
                <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13935;663:60352;188:6007;18:3" style={{
                backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.1) 100%), linear-gradient(90deg, rgb(219, 219, 219) 0%, rgb(219, 219, 219) 100%)"
              }} />
              </div>
              <motion.button className="absolute h-[60px] left-[560px] top-[599px] w-[340px]" data-node-id="I497:13935;663:60352;188:6008" data-name="off" type="button" aria-label="units:metric" data-setting-action="units:metric" onClick={() => onAction('units:metric')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }} aria-pressed={active('units:metric')} data-choice="true" style={{
              background: active('units:metric') ? '#fff' : 'transparent',
              borderRadius: 50,
              boxShadow: active('units:metric') && true ? '0 3px 4px #0004' : undefined
            }}>
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13935;663:60352;188:6008;18:2">
                  <p className="leading-[normal]">Kilometers</p>
                </div>
              </motion.button>
              <motion.button className="absolute h-[60px] left-[900px] top-[599px] w-[340px]" data-node-id="I497:13935;663:60352;188:6010" data-name="auto" type="button" aria-label="units:imperial" data-setting-action="units:imperial" onClick={() => onAction('units:imperial')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }} aria-pressed={active('units:imperial')} data-choice="true" style={{
              background: active('units:imperial') ? '#fff' : 'transparent',
              borderRadius: 50,
              boxShadow: active('units:imperial') && true ? '0 3px 4px #0004' : undefined
            }}>
                <div className="absolute bg-white inset-0 rounded-[50px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]" data-node-id="I497:13935;663:60352;188:6010;18:3" hidden={true} />
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13935;663:60352;188:6010;18:2">
                  <p className="leading-[normal]">Miles</p>
                </div>
              </motion.button>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[560px] text-[20px] text-black top-[568.5px] whitespace-nowrap" data-node-id="I497:13935;663:60352;188:6011">
                <p className="leading-[normal]">Distance</p>
              </div>
            </div>
            <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[560px] text-[26px] text-black top-[516px] whitespace-nowrap" data-node-id="I497:13935;663:60352;188:5769">
              <p className="leading-[normal]">{`Units & Format`}</p>
            </div>
            <div className="absolute contents left-[560px] top-[263px]" data-node-id="I497:13935;663:60352;188:5555" data-name="Group">
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[560px] text-[20px] text-[rgba(0,0,0,0.4)] top-[407.5px] whitespace-nowrap" data-node-id="I497:13935;663:60352;188:5691">
                <p className="leading-[normal]">Reduce brightness to conserve energy</p>
              </div>
              <div className="absolute contents left-[560px] top-[319px]" data-node-id="I497:13935;663:60352;188:5313" data-name="Brightness slider">
                <div className="absolute h-[60px] left-[560px] top-[319px] w-[680px]" data-node-id="I497:13935;663:60352;188:5314" data-name="background" hidden={true}>
                  <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13935;663:60352;188:5314;18:3" style={{
                  backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.1) 100%), linear-gradient(90deg, rgb(219, 219, 219) 0%, rgb(219, 219, 219) 100%)"
                }} />
                </div>
                <div className="absolute h-[60px] left-[560px] top-[319px] w-[150px]" data-node-id="I497:13935;663:60352;188:5315" data-name="slider" hidden={true}>
                  <div className="absolute bg-white inset-0 rounded-[50px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]" data-node-id="I497:13935;663:60352;188:5315;18:3" />
                  <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13935;663:60352;188:5315;18:2">
                    <p className="leading-[normal]">10%</p>
                  </div>
                </div>
                <div className="absolute left-[1192px] size-[48px] top-[325px]" data-node-id="I497:13935;663:60352;188:5316" data-name="brightness">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgBrightness} />
                </div>
              <label className="tesla-brightness" style={{
                left: 560,
                top: 319,
                width: 680,
                height: 60
              }}><span style={{
                  width: Math.max(150, brightness / 100 * 680)
                }} /><b>{brightness}%</b><input aria-label="Display Brightness" type="range" min="40" max="100" value={brightness} onChange={e => onAction('brightness', +e.target.value)} /></label></div>
              <div className="absolute contents left-[560px] top-[263px]" data-node-id="I497:13935;663:60352;188:5317" data-name="brightness-label">
                <div className="absolute left-[560px] overflow-clip size-[48px] top-[263px]" data-node-id="I497:13935;663:60352;188:5318" data-name="display">
                  <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[22px] left-1/2 top-1/2 w-[30px]" data-node-id="I497:13935;663:60352;188:5318;170:0" data-name="Group">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgGroup} />
                  </div>
                </div>
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[625px] text-[20px] text-black top-[288.5px] whitespace-nowrap" data-node-id="I497:13935;663:60352;188:5319">
                  <p className="leading-[normal]">Display Brightness</p>
                </div>
              </div>
            </div>
            <div className="absolute contents left-[560px] top-[140px]" data-node-id="I497:13935;663:60352;188:5486" data-name="Group">
              <div className="absolute h-[60px] left-[560px] top-[183px] w-[680px]" data-node-id="I497:13935;663:60352;188:3960" data-name="background">
                <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13935;663:60352;188:3960;18:3" style={{
                backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.1) 100%), linear-gradient(90deg, rgb(219, 219, 219) 0%, rgb(219, 219, 219) 100%)"
              }} />
              </div>
              <motion.button className="absolute h-[60px] left-[560px] top-[183px] w-[226px]" data-node-id="I497:13935;663:60352;188:3961" data-name="Day" type="button" aria-label="appearance:light" data-setting-action="appearance:light" onClick={() => onAction('appearance:light')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }} aria-pressed={active('appearance:light')} data-choice="true" style={{
              background: active('appearance:light') ? '#fff' : 'transparent',
              borderRadius: 50,
              boxShadow: active('appearance:light') && true ? '0 3px 4px #0004' : undefined
            }}>
                <div className="absolute bg-white inset-0 rounded-[50px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]" data-node-id="I497:13935;663:60352;188:3961;18:3" hidden={true} />
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13935;663:60352;188:3961;18:2">
                  <p className="leading-[normal]">Day</p>
                </div>
              </motion.button>
              <motion.button className="absolute block cursor-pointer h-[60px] left-[787px] top-[183px] w-[226px]" data-node-id="I497:13935;663:60352;188:3962" data-name="Night" type="button" aria-label="appearance:dark" data-setting-action="appearance:dark" onClick={() => onAction('appearance:dark')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }} aria-pressed={active('appearance:dark')} data-choice="true" style={{
              background: active('appearance:dark') ? '#fff' : 'transparent',
              borderRadius: 50,
              boxShadow: active('appearance:dark') && true ? '0 3px 4px #0004' : undefined
            }}>
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13935;663:60352;188:3962;18:2">
                  <p className="leading-[normal]">Night</p>
                </div>
              </motion.button>
              <motion.button className="absolute h-[60px] left-[1014px] top-[183px] w-[226px]" data-node-id="I497:13935;663:60352;188:3964" data-name="auto" type="button" aria-label="appearance:auto" data-setting-action="appearance:auto" onClick={() => onAction('appearance:auto')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }} aria-pressed={active('appearance:auto')} data-choice="true" style={{
              background: active('appearance:auto') ? '#fff' : 'transparent',
              borderRadius: 50,
              boxShadow: active('appearance:auto') && true ? '0 3px 4px #0004' : undefined
            }}>
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13935;663:60352;188:3964;18:2">
                  <p className="leading-[normal]">Auto</p>
                </div>
              </motion.button>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[560px] text-[20px] text-black top-[152.5px] whitespace-nowrap" data-node-id="I497:13935;663:60352;188:3967">
                <p className="leading-[normal]">Display Mode</p>
              </div>
            </div>
            <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[560px] text-[26px] text-black top-[100px] whitespace-nowrap" data-node-id="I497:13935;663:60352;188:5188">
              <p className="leading-[normal]">Visibility</p>
            </div>
          </div>
          <motion.button className="absolute block cursor-pointer left-[520px] size-[48px] top-[20px]" data-node-id="I497:13935;663:60352;86:936" data-name="exit" type="button" aria-label="close" data-setting-action="close" onClick={() => onAction('close')} whileTap={{
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
