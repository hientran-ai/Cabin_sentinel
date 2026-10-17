import type { SettingsFrameProps } from '../settingsTypes'
import { motion } from 'motion/react'
const imgNavBg = "/cockpit/tesla-figma/panel-quick-light-imgNavBg.svg";
const imgGlovebox = "/cockpit/tesla-figma/panel-quick-light-imgGlovebox.svg";
const imgService = "/cockpit/tesla-figma/panel-quick-light-imgService.svg";
const imgSafetyAndSecurity = "/cockpit/tesla-figma/panel-quick-light-imgSafetyAndSecurity.svg";
const imgSteeringWheelSmall = "/cockpit/tesla-figma/panel-quick-light-imgSteeringWheelSmall.svg";
const imgModel3IconSmall = "/cockpit/tesla-figma/panel-quick-light-imgModel3IconSmall.svg";
const imgGroup = "/cockpit/tesla-figma/panel-quick-light-imgGroup.svg";
const imgLock = "/cockpit/tesla-figma/panel-quick-light-imgLock.svg";
const imgLights = "/cockpit/tesla-figma/panel-quick-light-imgLights.svg";
const imgQuickControls = "/cockpit/tesla-figma/panel-quick-light-imgQuickControls.svg";
const imgSettingsBg = "/cockpit/tesla-figma/panel-quick-light-imgSettingsBg.svg";
const imgSteeringWheelSmall1 = "/cockpit/tesla-figma/panel-quick-light-imgSteeringWheelSmall1.svg";
const imgMirror = "/cockpit/tesla-figma/panel-quick-light-imgMirror.svg";
const imgMirror1 = "/cockpit/tesla-figma/panel-quick-light-imgMirror1.svg";
const imgAdjustments = "/cockpit/tesla-figma/panel-quick-light-imgAdjustments.svg";
const imgHeadlightsSmall = "/cockpit/tesla-figma/panel-quick-light-imgHeadlightsSmall.svg";
const imgBrightness = "/cockpit/tesla-figma/panel-quick-light-imgBrightness.svg";
const imgExit = "/cockpit/tesla-figma/panel-quick-light-imgExit.svg";
export default function SettingsQuickLight({
  onNavigate,
  onAction,
  active,
  brightness
}: SettingsFrameProps) {
  return <div className="drop-shadow-[0px_4px_2px_rgba(0,0,0,0.25)] relative size-full" data-node-id="497:13883" data-name="Settings / Light">
      <div className="absolute inset-0 overflow-clip" data-node-id="I497:13883;663:60352" data-name="Settings / Light">
        <div className="absolute contents left-0 top-0" data-node-id="I497:13883;663:60352;193:2055" data-name="Nav Tree">
          <div className="absolute bottom-0 right-[800px] top-0 w-[500px]" data-node-id="I497:13883;663:60352;88:127" data-name="nav-bg">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgNavBg} />
          </div>
          <div className="absolute contents left-[40px] top-[60px]" data-node-id="I497:13883;663:60352;88:363" data-name="Menu">
            <div className="absolute contents left-[40px] top-[900px]" data-node-id="I497:13883;663:60352;192:3708" data-name="Glovebox Button">
              <motion.button className="absolute bottom-[160px] h-[60px] right-[840px] w-[420px]" data-node-id="I497:13883;663:60352;192:2542" data-name="Glovebox" type="button" aria-label="Glovebox" data-setting-action="Glovebox" onClick={() => onAction('Glovebox')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }}>
                <div className="absolute border-2 border-[rgba(0,0,0,0.4)] border-solid inset-0 rounded-[50px]" data-node-id="I497:13883;663:60352;192:2542;18:3" />
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13883;663:60352;192:2542;18:2">
                  <p className="leading-[normal]">Glovebox</p>
                </div>
              </motion.button>
              <div className="absolute left-[56px] size-[48px] top-[906px]" data-node-id="I497:13883;663:60352;192:3637" data-name="glovebox">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgGlovebox} />
              </div>
            </div>
            <div className="absolute contents cursor-pointer right-[1123px] top-[620px]" data-node-id="I497:13883;663:60352;88:354" data-name="Service" data-nav-visual="service">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[620px]" data-node-id="I497:13883;663:60352;88:342" data-name="service">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgService} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[645.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13883;663:60352;88:353">
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
            <div className="absolute contents cursor-pointer right-[1028px] top-[540px]" data-node-id="I497:13883;663:60352;88:355" data-name="Safety & Security" data-nav-visual="safety">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[540px]" data-node-id="I497:13883;663:60352;88:325" data-name="safety and security">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgSafetyAndSecurity} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[565.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13883;663:60352;88:352">
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
            <div className="absolute contents cursor-pointer right-[1101px] top-[460px]" data-node-id="I497:13883;663:60352;88:356" data-name="Autopilot" data-nav-visual="autopilot">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[460px]" data-node-id="I497:13883;663:60352;88:296" data-name="steering wheel-small">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgSteeringWheelSmall} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[485.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13883;663:60352;88:351">
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
            <div className="absolute contents cursor-pointer right-[1123px] top-[380px]" data-node-id="I497:13883;663:60352;88:357" data-name="Driving" data-nav-visual="driving">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[380px]" data-node-id="I497:13883;663:60352;88:176" data-name="model3-icon-small">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgModel3IconSmall} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[405.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13883;663:60352;88:350">
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
            <div className="absolute contents cursor-pointer right-[1123px] top-[300px]" data-node-id="I497:13883;663:60352;88:358" data-name="Display" data-nav-visual="display">
              <div className="absolute opacity-60 overflow-clip right-[1212px] size-[48px] top-[300px]" data-node-id="I497:13883;663:60352;88:170" data-name="display">
                <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[22px] left-1/2 top-1/2 w-[30px]" data-node-id="I497:13883;663:60352;88:170;170:0" data-name="Group">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgGroup} />
                </div>
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[325.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13883;663:60352;88:349">
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
            <div className="absolute contents cursor-pointer right-[1139px] top-[220px]" data-node-id="I497:13883;663:60352;88:359" data-name="Locks" data-nav-visual="locks">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[220px]" data-node-id="I497:13883;663:60352;88:163" data-name="lock">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgLock} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[245.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13883;663:60352;88:348">
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
            <div className="absolute contents cursor-pointer right-[1135px] top-[140px]" data-node-id="I497:13883;663:60352;88:360" data-name="Lights" data-nav-visual="lights">
              <div className="absolute opacity-60 right-[1212px] size-[48px] top-[140px]" data-node-id="I497:13883;663:60352;88:159" data-name="lights">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgLights} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] opacity-60 right-[1196px] text-[20px] text-black top-[165.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13883;663:60352;88:347">
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
            <div className="absolute contents cursor-pointer right-[1048px] top-[60px]" data-node-id="I497:13883;663:60352;88:361" data-name="Quick Controls" data-nav-visual="quick">
              <div className="absolute right-[1212px] size-[48px] top-[60px]" data-node-id="I497:13883;663:60352;88:141" data-name="quick controls">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgQuickControls} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] right-[1196px] text-[20px] text-black top-[85.5px] translate-x-full whitespace-nowrap" data-node-id="I497:13883;663:60352;88:346">
                <p className="leading-[normal]">Quick Controls</p>
              </div>
            <motion.button type="button" className="tesla-settings-nav-hit" style={{
              left: 24,
              top: 48,
              width: 450,
              height: 72
            }} aria-label="Quick Controls" aria-current={"page"} onClick={() => onNavigate('quick')} whileTap={{
              backgroundColor: '#8883'
            }} /></div>
          </div>
        </div>
        <div className="absolute contents left-[500px] top-0" data-node-id="I497:13883;663:60352;193:2445" data-name="Settings">
          <div className="absolute bottom-0 left-[500px] top-0 w-[800px]" data-node-id="I497:13883;663:60352;88:126" data-name="settings-bg">
            <div className="absolute inset-[0_-0.5%_-0.71%_-0.5%]">
              <img alt="" className="block max-w-none size-full" src={imgSettingsBg} />
            </div>
          </div>
          <div className="absolute contents left-[560px] top-[80px]" data-node-id="I497:13883;663:60352;88:128" data-name="Quick Controls">
            <motion.button className="absolute drop-shadow-[0px_4px_2px_rgba(0,0,0,0.25)] h-[60px] left-[560px] top-[725px] w-[220px]" data-node-id="I497:13883;663:60352;88:55" data-name="fold mirrors" type="button" aria-label="fold mirrors" data-setting-action="fold mirrors" onClick={() => onAction('fold mirrors')} whileTap={{
            scale: .97
          }} transition={{
            duration: .14
          }}>
              <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13883;663:60352;88:55;18:3" style={{
              backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.4) 100%), linear-gradient(90deg, rgb(255, 255, 255) 0%, rgb(255, 255, 255) 100%)"
            }} />
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13883;663:60352;88:55;18:2">
                <p className="leading-[normal]">Fold Mirrors</p>
              </div>
            </motion.button>
            <motion.button className="absolute h-[177px] left-[910px] overflow-clip top-[528px] w-[330px]" data-node-id="I497:13883;663:60352;88:52" data-name="steering wheel" type="button" aria-label="steering wheel" data-setting-action="steering wheel" onClick={() => onAction('steering wheel')} whileTap={{
            scale: .97
          }} transition={{
            duration: .14
          }}>
              <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13883;663:60352;88:53" style={{
              backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.1) 100%), linear-gradient(90deg, rgb(219, 219, 219) 0%, rgb(219, 219, 219) 100%)"
            }} />
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[25px] justify-center leading-[0] left-[20px] right-[20px] text-[20px] text-black text-center top-[calc(50%+46px)] uppercase" data-node-id="I497:13883;663:60352;88:54">
                <p className="leading-[normal]">Steering Wheel</p>
              </div>
              <div className="-translate-x-1/2 absolute flex items-center justify-center left-[calc(50%+1px)] size-[48px] top-[55px]" data-node-id="I497:13883;663:60352;88:89">
                <div className="-scale-y-100 flex-none rotate-180">
                  <div className="relative size-[48px]" data-name="steering wheel-small">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgSteeringWheelSmall1} />
                  </div>
                </div>
              </div>
            </motion.button>
            <motion.button className="absolute h-[177px] left-[560px] overflow-clip top-[528px] w-[330px]" data-node-id="I497:13883;663:60352;88:46" data-name="mirrors" type="button" aria-label="mirrors" data-setting-action="mirrors" onClick={() => onAction('mirrors')} whileTap={{
            scale: .97
          }} transition={{
            duration: .14
          }}>
              <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13883;663:60352;88:47" style={{
              backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.1) 100%), linear-gradient(90deg, rgb(219, 219, 219) 0%, rgb(219, 219, 219) 100%)"
            }} />
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[25px] justify-center leading-[0] left-[20px] right-[20px] text-[20px] text-black text-center top-[calc(50%+46px)] uppercase" data-node-id="I497:13883;663:60352;88:48">
                <p className="leading-[normal]">Mirrors</p>
              </div>
              <div className="-translate-x-1/2 absolute contents left-[calc(50%-0.5px)] top-[55px]" data-node-id="I497:13883;663:60352;178:2480" data-name="Group">
                <div className="-translate-x-1/2 absolute left-[calc(50%-48px)] size-[48px] top-[55px]" data-node-id="I497:13883;663:60352;88:81" data-name="mirror">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgMirror} />
                </div>
                <div className="-translate-x-1/2 absolute flex items-center justify-center left-[calc(50%+47px)] size-[48px] top-[55px]" data-node-id="I497:13883;663:60352;88:85">
                  <div className="-scale-y-100 flex-none rotate-180">
                    <div className="relative size-[48px]" data-name="mirror">
                      <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgMirror1} />
                    </div>
                  </div>
                </div>
              </div>
            </motion.button>
            <div className="absolute contents left-[560px] top-[472px]" data-node-id="I497:13883;663:60352;88:122" data-name="adj-label">
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[623px] text-[20px] text-black top-[497.5px] whitespace-nowrap" data-node-id="I497:13883;663:60352;88:21">
                <p className="leading-[normal]">Adjustments</p>
              </div>
              <div className="absolute left-[560px] size-[48px] top-[472px]" data-node-id="I497:13883;663:60352;88:37" data-name="adjustments">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgAdjustments} />
              </div>
            </div>
            <motion.button className="absolute drop-shadow-[0px_4px_2px_rgba(0,0,0,0.25)] h-[60px] left-[560px] top-[352px] w-[220px]" data-node-id="I497:13883;663:60352;86:981" data-name="front fog" type="button" aria-label="front fog" data-setting-action="front fog" onClick={() => onAction('front fog')} whileTap={{
            scale: .97
          }} transition={{
            duration: .14
          }}>
              <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13883;663:60352;86:981;18:3" style={{
              backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.4) 100%), linear-gradient(90deg, rgb(255, 255, 255) 0%, rgb(255, 255, 255) 100%)"
            }} />
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13883;663:60352;86:981;18:2">
                <p className="leading-[normal]">FRONT FOG</p>
              </div>
            </motion.button>
            <div className="absolute contents left-[560px] top-[272px]" data-node-id="I497:13883;663:60352;88:0" data-name="Lights Slider">
              <div className="absolute h-[60px] left-[560px] top-[272px] w-[680px]" data-node-id="I497:13883;663:60352;88:1" data-name="background">
                <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13883;663:60352;88:1;18:3" style={{
                backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.1) 100%), linear-gradient(90deg, rgb(219, 219, 219) 0%, rgb(219, 219, 219) 100%)"
              }} />
              </div>
              <motion.button className="absolute h-[60px] left-[560px] top-[272px] w-[170px]" data-node-id="I497:13883;663:60352;88:2" data-name="off" type="button" aria-label="headlights:off" data-setting-action="headlights:off" onClick={() => onAction('headlights:off')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }} aria-pressed={active('headlights:off')} data-choice="true" style={{
              background: active('headlights:off') ? '#fff' : 'transparent',
              borderRadius: 50,
              boxShadow: active('headlights:off') && true ? '0 3px 4px #0004' : undefined
            }}>
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13883;663:60352;88:2;18:2">
                  <p className="leading-[normal]">Off</p>
                </div>
              </motion.button>
              <motion.button className="absolute h-[60px] left-[730px] top-[272px] w-[170px]" data-node-id="I497:13883;663:60352;88:11" data-name="parking" type="button" aria-label="headlights:parking" data-setting-action="headlights:parking" onClick={() => onAction('headlights:parking')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }} aria-pressed={active('headlights:parking')} data-choice="true" style={{
              background: active('headlights:parking') ? '#fff' : 'transparent',
              borderRadius: 50,
              boxShadow: active('headlights:parking') && true ? '0 3px 4px #0004' : undefined
            }}>
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13883;663:60352;88:11;18:2">
                  <p className="leading-[normal]">Parking</p>
                </div>
              </motion.button>
              <motion.button className="absolute h-[60px] left-[900px] top-[272px] w-[170px]" data-node-id="I497:13883;663:60352;88:14" data-name="on" type="button" aria-label="headlights:on" data-setting-action="headlights:on" onClick={() => onAction('headlights:on')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }} aria-pressed={active('headlights:on')} data-choice="true" style={{
              background: active('headlights:on') ? '#fff' : 'transparent',
              borderRadius: 50,
              boxShadow: active('headlights:on') && true ? '0 3px 4px #0004' : undefined
            }}>
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13883;663:60352;88:14;18:2">
                  <p className="leading-[normal]">On</p>
                </div>
              </motion.button>
              <motion.button className="absolute drop-shadow-[0px_4px_2px_rgba(0,0,0,0.25)] h-[60px] left-[1070px] top-[272px] w-[170px]" data-node-id="I497:13883;663:60352;88:17" data-name="auto" type="button" aria-label="headlights:auto" data-setting-action="headlights:auto" onClick={() => onAction('headlights:auto')} whileTap={{
              scale: .97
            }} transition={{
              duration: .14
            }} aria-pressed={active('headlights:auto')} data-choice="true" style={{
              background: active('headlights:auto') ? '#fff' : 'transparent',
              borderRadius: 50,
              boxShadow: active('headlights:auto') && true ? '0 3px 4px #0004' : undefined
            }}>
                <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13883;663:60352;88:17;18:3" style={{
                backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.4) 100%), linear-gradient(90deg, rgb(255, 255, 255) 0%, rgb(255, 255, 255) 100%)"
              }} hidden={true} />
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[#070707] text-[20px] text-center top-1/2" data-node-id="I497:13883;663:60352;88:17;18:2">
                  <p className="leading-[normal]">Auto</p>
                </div>
              </motion.button>
            </div>
            <div className="absolute contents left-[560px] top-[216px]" data-node-id="I497:13883;663:60352;88:123" data-name="lights-label">
              <div className="absolute left-[560px] size-[48px] top-[216px]" data-node-id="I497:13883;663:60352;86:967" data-name="headlights-small">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgHeadlightsSmall} />
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[625px] text-[20px] text-black top-[241.5px] whitespace-nowrap" data-node-id="I497:13883;663:60352;86:968">
                <p className="leading-[normal]">Exterior Lights</p>
              </div>
            </div>
            <div className="absolute contents left-[560px] top-[136px]" data-node-id="I497:13883;663:60352;86:994" data-name="Brightness slider">
              <div className="absolute h-[60px] left-[560px] top-[136px] w-[680px]" data-node-id="I497:13883;663:60352;86:984" data-name="background" hidden={true}>
                <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13883;663:60352;86:984;18:3" style={{
                backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.1) 100%), linear-gradient(90deg, rgb(219, 219, 219) 0%, rgb(219, 219, 219) 100%)"
              }} />
              </div>
              <div className="absolute drop-shadow-[0px_4px_2px_rgba(0,0,0,0.25)] h-[60px] left-[560px] top-[136px] w-[150px]" data-node-id="I497:13883;663:60352;86:987" data-name="slider" hidden={true}>
                <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:13883;663:60352;86:987;18:3" style={{
                backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.4) 100%), linear-gradient(90deg, rgb(255, 255, 255) 0%, rgb(255, 255, 255) 100%)"
              }} />
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:13883;663:60352;86:987;18:2">
                  <p className="leading-[normal]">10%</p>
                </div>
              </div>
              <div className="absolute left-[1192px] size-[48px] top-[142px]" data-node-id="I497:13883;663:60352;86:1004" data-name="brightness">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgBrightness} />
              </div>
            <label className="tesla-brightness" style={{
              left: 560,
              top: 136,
              width: 680,
              height: 60
            }}><span style={{
                width: Math.max(150, brightness / 100 * 680)
              }} /><b>{brightness}%</b><input aria-label="Display Brightness" type="range" min="40" max="100" value={brightness} onChange={e => onAction('brightness', +e.target.value)} /></label></div>
            <div className="absolute contents left-[560px] top-[80px]" data-node-id="I497:13883;663:60352;88:124" data-name="brightness-label">
              <div className="absolute left-[560px] overflow-clip size-[48px] top-[80px]" data-node-id="I497:13883;663:60352;86:958" data-name="display">
                <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[22px] left-1/2 top-1/2 w-[30px]" data-node-id="I497:13883;663:60352;86:958;170:0" data-name="Group">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgGroup} />
                </div>
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[625px] text-[20px] text-black top-[105.5px] whitespace-nowrap" data-node-id="I497:13883;663:60352;86:962">
                <p className="leading-[normal]">Display Brightness</p>
              </div>
            </div>
          </div>
          <motion.button className="absolute block cursor-pointer left-[520px] size-[48px] top-[20px]" data-node-id="I497:13883;663:60352;86:936" data-name="exit" type="button" aria-label="close" data-setting-action="close" onClick={() => onAction('close')} whileTap={{
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
