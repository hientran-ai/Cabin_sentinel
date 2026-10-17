// Figma source: see docs/tesla-figma/README.md. Assets and geometry preserved.
import type { TeslaFrameProps } from "./types";
import { MusicHandle } from "./MusicHandle";
import { motion, useReducedMotion } from "motion/react";
const imgAlbumCover = "/cockpit/tesla-figma/model3-imgAlbumCover.png";
const imgAlbumCover1 = "/cockpit/tesla-figma/model3-imgAlbumCover1.png";
const imgAlbumCover2 = "/cockpit/tesla-figma/model3-imgAlbumCover2.png";
const imgAlbumCover3 = "/cockpit/tesla-figma/model3-imgAlbumCover3.png";
const imgAlbumCover4 = "/cockpit/tesla-figma/model3-imgAlbumCover4.png";
const imgAlbumCover5 = "/cockpit/tesla-figma/model3-imgAlbumCover5.png";
const imgAlbumCover6 = "/cockpit/tesla-figma/model3-imgAlbumCover6.png";
const imgAlbumCover7 = "/cockpit/tesla-figma/model3-imgAlbumCover7.png";
const imgAlbumCover8 = "/cockpit/tesla-figma/model3-imgAlbumCover8.png";
const imgAlbumCover9 = "/cockpit/tesla-figma/model3-imgAlbumCover9.png";
const imgAlbumCover10 = "/cockpit/tesla-figma/model3-imgAlbumCover10.png";
const imgAlbumCover11 = "/cockpit/tesla-figma/model3-imgAlbumCover11.png";
const imgAlbumCover12 = "/cockpit/tesla-figma/model3-imgAlbumCover12.png";
const imgAlbumCover13 = "/cockpit/tesla-figma/model3-imgAlbumCover13.png";
const imgAlbumCover14 = "/cockpit/tesla-figma/model3-imgAlbumCover14.png";
const imgAlbumCover15 = "/cockpit/tesla-figma/model3-imgAlbumCover15.png";
const imgAlbumCover16 = "/cockpit/tesla-figma/model3-imgAlbumCover16.png";
const imgAlbumCover17 = "/cockpit/tesla-figma/model3-imgAlbumCover17.png";
const imgAlbumCover18 = "/cockpit/tesla-figma/model3-imgAlbumCover18.png";
const imgAlbumCover19 = "/cockpit/tesla-figma/model3-imgAlbumCover19.png";
const imgAlbumCover20 = "/cockpit/tesla-figma/model3-imgAlbumCover20.png";
const imgAlbumCover21 = "/cockpit/tesla-figma/model3-imgAlbumCover21.png";
const imgAlbumCover22 = "/cockpit/tesla-figma/model3-imgAlbumCover22.png";
const imgAlbumCover23 = "/cockpit/tesla-figma/model3-imgAlbumCover23.png";
const imgAlbumCover24 = "/cockpit/tesla-figma/model3-imgAlbumCover24.png";
const imgEllipse6 = "/cockpit/tesla-figma/model3-imgEllipse6.svg";
const imgEllipse7 = "/cockpit/tesla-figma/model3-imgEllipse7.svg";
const imgMicrophone = "/cockpit/tesla-figma/model3-imgMicrophone.svg";
const imgCamera = "/cockpit/tesla-figma/model3-imgCamera.svg";
const imgPower = "/cockpit/tesla-figma/model3-imgPower.svg";
const imgHeadlights = "/cockpit/tesla-figma/model3-imgHeadlights.svg";
const imgModel3 = "/cockpit/tesla-figma/model3-imgModel3.svg";
const imgPower1 = "/cockpit/tesla-figma/model3-imgPower1.svg";
const imgBattery = "/cockpit/tesla-figma/model3-imgBattery.svg";
const imgHeadlights1 = "/cockpit/tesla-figma/model3-imgHeadlights1.svg";
const imgGroup1 = "/cockpit/tesla-figma/model3-imgGroup1.svg";
const imgLock = "/cockpit/tesla-figma/model3-imgLock.svg";
const imgBluetooth = "/cockpit/tesla-figma/model3-imgBluetooth.svg";
const imgCellSignal = "/cockpit/tesla-figma/model3-imgCellSignal.svg";
const imgGroup2 = "/cockpit/tesla-figma/model3-imgGroup2.svg";
const imgTeslaLogo = "/cockpit/tesla-figma/model3-imgTeslaLogo.svg";
const imgSearch = "/cockpit/tesla-figma/model3-imgSearch.svg";
const imgExpandMusic = "/cockpit/tesla-figma/model3-imgExpandMusic.svg";
const imgNexttrack = "/cockpit/tesla-figma/model3-imgNexttrack.svg";
const imgPause = "/cockpit/tesla-figma/model3-imgPause.svg";
const imgPrevtrack = "/cockpit/tesla-figma/model3-imgPrevtrack.svg";
const imgHeart = "/cockpit/tesla-figma/model3-imgHeart.svg";
const imgEllipse11 = "/cockpit/tesla-figma/model3-imgEllipse11.svg";
const imgDirection = "/cockpit/tesla-figma/model3-imgDirection.svg";
const imgPlus = "/cockpit/tesla-figma/model3-imgPlus.svg";
const imgPowerStationToggle = "/cockpit/tesla-figma/model3-imgPowerStationToggle.svg";
const imgMapSettings = "/cockpit/tesla-figma/model3-imgMapSettings.svg";
const imgGroup3 = "/cockpit/tesla-figma/model3-imgGroup3.svg";
const imgArrow = "/cockpit/tesla-figma/model3-imgArrow.svg";
const imgBackground = "/cockpit/tesla-figma/model3-imgBackground.svg";
const imgArrow1 = "/cockpit/tesla-figma/model3-imgArrow1.svg";
const imgArrow2 = "/cockpit/tesla-figma/model3-imgArrow2.svg";
const imgVolume = "/cockpit/tesla-figma/model3-imgVolume.svg";
const imgPhone = "/cockpit/tesla-figma/model3-imgPhone.svg";
const imgMusic = "/cockpit/tesla-figma/model3-imgMusic.svg";
const imgSeat = "/cockpit/tesla-figma/model3-imgSeat.svg";
const imgFan = "/cockpit/tesla-figma/model3-imgFan.svg";
const imgSeat1 = "/cockpit/tesla-figma/model3-imgSeat1.svg";
const imgHeater = "/cockpit/tesla-figma/model3-imgHeater.svg";
const imgDefrost = "/cockpit/tesla-figma/model3-imgDefrost.svg";
const imgModel3Icon = "/cockpit/tesla-figma/model3-imgModel3Icon.svg";
export default function Model3Frame({
  model,
  onControl
}: TeslaFrameProps) {
  const reduceMotion = useReducedMotion();
  return <div className="relative size-full" data-node-id="37:3554" data-name="Parked - At Charging Station">
      
      <div className="absolute bg-[#0e0e0e] bottom-[120px] left-0 overflow-clip top-0 w-[580px]" data-node-id="37:3556" data-name="Sidebar">
        <div className="absolute contents left-0 top-0" data-node-id="I37:3556;497:182533" data-name="Dark">
          <div className="absolute bottom-0 h-[60px] left-0 overflow-clip right-0" data-node-id="I37:3556;17:421" data-name="pagination">
            <div className="-translate-x-1/2 absolute contents left-[calc(50%+4px)] top-[25px]" data-node-id="I37:3556;168:258" data-name="Group">
              <div className="-translate-x-1/2 absolute left-[calc(50%-21px)] size-[10px] top-[25px]" data-node-id="I37:3556;17:422">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse6} />
              </div>
              <div className="-translate-x-1/2 absolute left-[calc(50%+4px)] size-[10px] top-[25px]" data-node-id="I37:3556;17:423">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse7} />
              </div>
              <div className="-translate-x-1/2 absolute left-[calc(50%+29px)] size-[10px] top-[25px]" data-node-id="I37:3556;17:424">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse7} />
              </div>
            </div>
          </div>
          <div className="absolute bottom-[150px] h-[50px] left-0 overflow-clip right-0" data-node-id="I37:3556;15:215" data-name="action icons">
            <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%+149px)] size-[48px] top-[calc(50%-1px)]" data-node-id="I37:3556;15:483" data-name="microphone" type="button" aria-label="Thông tin điều khiển giọng nói" data-control="voice" onClick={() => onControl('voice')} whileTap={{
            scale: .94
          }} transition={{
            duration: .14,
            ease: [.2, 0, 0, 1]
          }}>
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgMicrophone} />
            </motion.button>
            <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-151px)] size-[48px] top-[calc(50%-1px)]" data-node-id="I37:3556;15:452" data-name="camera" type="button" aria-label="Camera" data-control="camera" onClick={() => onControl('camera')} whileTap={{
            scale: .94
          }} transition={{
            duration: .14,
            ease: [.2, 0, 0, 1]
          }}>
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgCamera} />
            </motion.button>
            <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-1px)] size-[48px] top-[calc(50%-1px)]" data-node-id="I37:3556;15:466" data-name="power" type="button" aria-label="Sạc · MÔ PHỎNG" data-control="charge" onClick={() => onControl('charge')} whileTap={{
            scale: .94
          }} transition={{
            duration: .14,
            ease: [.2, 0, 0, 1]
          }} aria-pressed={model.chargeOpen}>
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPower} />
            </motion.button>
          </div>
          <div className="absolute bg-[#0e0e0e] inset-[207px_0_243px_0] overflow-clip" data-node-id="I37:3556;21:0" data-name="parked">
            <div className="absolute contents left-0 top-0" data-node-id="I37:3556;21:0;497:2015" data-name="Dark">
              <div className="absolute bg-[#0e0e0e] inset-0" data-node-id="I37:3556;21:0;497:0" data-name="background" />
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[25px] justify-center leading-[0] left-[20px] text-[20px] text-[rgba(255,255,255,0.4)] top-[22.5px] w-[540px]" data-node-id="I37:3556;21:0;18:0">
                <p className="leading-[normal]">MODEL 3</p>
              </div>
              <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[170px] left-[calc(50%+0.5px)] top-[calc(50%-230px)] w-[213px]" data-node-id="I37:3556;21:0;20:7" data-name="headlights">
                <div className="absolute inset-[-14.71%_-11.74%]">
                  <img alt="" className="block max-w-none size-full" src={imgHeadlights} />
                </div>
              </div>
              <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute block cursor-pointer h-[60px] left-1/2 top-[calc(50%-220px)] w-[150px]" data-node-id="I37:3556;21:0;18:8" data-name="button" type="button" aria-label="Mở/đóng cốp trước · MÔ PHỎNG" data-control="frunk" onClick={() => onControl('frunk')} whileTap={{
              scale: .94
            }} transition={{
              duration: .14,
              ease: [.2, 0, 0, 1]
            }} aria-pressed={model.frunkOpen}>
                <div className="absolute inset-0 rounded-[50px]" data-node-id="I37:3556;21:0;18:8;18:3" style={{
                backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.2) 100%), linear-gradient(90deg, rgb(14, 14, 14) 0%, rgb(14, 14, 14) 100%)"
              }} />
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-center text-white top-1/2" data-node-id="I37:3556;21:0;18:8;18:2">
                  <p className="leading-[normal]">{model.frunkOpen ? 'close' : 'open'}</p>
                </div>
              </motion.button>
              <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute block cursor-pointer h-[60px] left-1/2 top-[calc(50%+210px)] w-[150px]" data-node-id="I37:3556;21:0;18:11" data-name="button" type="button" aria-label="Mở/đóng cốp sau · MÔ PHỎNG" data-control="trunk" onClick={() => onControl('trunk')} whileTap={{
              scale: .94
            }} transition={{
              duration: .14,
              ease: [.2, 0, 0, 1]
            }} aria-pressed={model.trunkOpen}>
                <div className="absolute inset-0 rounded-[50px]" data-node-id="I37:3556;21:0;18:11;18:3" style={{
                backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.2) 100%), linear-gradient(90deg, rgb(14, 14, 14) 0%, rgb(14, 14, 14) 100%)"
              }} />
                <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-center text-white top-1/2" data-node-id="I37:3556;21:0;18:11;18:2">
                  <p className="leading-[normal]">{model.trunkOpen ? 'close' : 'open'}</p>
                </div>
              </motion.button>
              <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute block cursor-pointer h-[60px] left-[calc(50%-165px)] top-[calc(50%+125px)] w-[150px]" data-node-id="I37:3556;21:0;18:14" data-name="button" type="button" aria-label="Mở/đóng cổng sạc · MÔ PHỎNG" data-control="charge" onClick={() => onControl('charge')} whileTap={{
              scale: .94
            }} transition={{
              duration: .14,
              ease: [.2, 0, 0, 1]
            }} aria-pressed={model.chargeOpen}>
                <div className="absolute inset-0 rounded-[50px]" data-node-id="I37:3556;21:0;18:14;18:3" style={{
                backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.2) 100%), linear-gradient(90deg, rgb(14, 14, 14) 0%, rgb(14, 14, 14) 100%)"
              }} />
              </motion.button>
              <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[334.011px] left-[calc(50%+0.44px)] top-[calc(50%-7.99px)] w-[146.889px]" data-node-id="I37:3556;21:0;20:23" data-name="model 3">
                <div className="absolute inset-[-2.4%_-6.81%_-3.59%_-6.81%]">
                  <img alt="" className="block max-w-none size-full" src={imgModel3} />
                </div>
              </div>
              <div className="-translate-y-1/2 absolute left-[101px] size-[48px] top-[calc(50%+125px)]" data-node-id="I37:3556;21:0;497:8146" data-name="power">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPower1} />
              </div>
            </div>
          </div>
          <div className="absolute contents right-[20px] top-[167px]" data-node-id="I37:3556;21:912" data-name="Battery Level">
            <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[25px] justify-center leading-[0] right-[97px] text-[20px] text-[rgba(255,255,255,0.4)] text-right top-[179.5px] w-[100px]" data-node-id="I37:3556;9:5">
              <p className="leading-[normal]">{model.battery}</p>
            </div>
            <div className="absolute h-[20px] right-[20px] top-[170px] w-[62px]" data-node-id="I37:3556;9:16" data-name="battery">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgBattery} />
            </div>
          </div>
          <div className="absolute contents left-[10px] top-[60px]" data-node-id="I37:3556;21:763" data-name="Speedometer">
            <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[25px] justify-center leading-[0] left-[43.1%] right-[43.1%] text-[20px] text-[rgba(255,255,255,0.4)] text-center top-[179.5px]" data-node-id="I37:3556;9:0">
              <p className="leading-[normal]">{model.units}</p>
            </div>
            <div className="absolute bg-[rgba(255,255,255,0.4)] h-[2px] left-[3.45%] right-[3.45%] top-[205px]" data-node-id="I37:3556;9:10" data-name="speedometer line" />
            <div className="-translate-x-1/2 absolute bg-[#25cb55] h-[6px] left-[calc(50%+20.5px)] rounded-[3px] top-[203px] w-[41px]" data-node-id="I37:3556;9:21" data-name="current speed Line" />
            <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[100px] justify-center leading-[0] left-[1.72%] right-[1.72%] text-[110px] text-center text-white top-[110px]" data-node-id="I37:3556;8:1420">
              <p className="leading-[normal]">{model.speed}</p>
            </div>
          </div>
          <div className="absolute h-[60px] left-0 overflow-clip right-0 top-0" data-node-id="I37:3556;13:1" data-name="top info icons">
            <div className="absolute right-[22px] size-[48px] top-[10px]" data-node-id="I37:3556;9:27" data-name="headlights">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgHeadlights1} />
            </div>
            <div className="-translate-x-1/2 absolute left-[calc(50%-176px)] overflow-clip size-[48px] top-[10px]" data-node-id="I37:3556;9:48" data-name="tire pressure">
              <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[31px] left-1/2 top-[calc(50%+1.5px)] w-[34px]" data-node-id="I37:3556;9:48;9:43" data-name="Group">
                <div className="absolute inset-[-6.45%_-5.88%_0_-5.88%]">
                  <img alt="" className="block max-w-none size-full" src={imgGroup1} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute h-[70px] overflow-clip right-0 top-0 w-[1340px]" data-node-id="37:3558" data-name="status bar">
        <div className="absolute contents left-0 top-0" data-node-id="I37:3558;497:210183" data-name="Dark">
          <div className="absolute bg-gradient-to-b from-[rgba(0,0,0,0.6)] h-[60px] left-0 right-0 to-[rgba(0,0,0,0)] top-0" data-node-id="I37:3558;25:108" data-name="Dark" />
          <motion.button className="absolute left-[20px] size-[48px] top-[10px]" data-node-id="I37:3558;23:156" data-name="lock" type="button" aria-label="Trạng thái khóa xe · MÔ PHỎNG" data-control="lock-info" onClick={() => onControl('lock-info')} whileTap={{
          scale: .94
        }} transition={{
          duration: .14,
          ease: [.2, 0, 0, 1]
        }}>
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgLock} />
          </motion.button>
          <div className="absolute left-[80px] size-[48px] top-[10px]" data-node-id="I37:3558;23:174" data-name="bluetooth">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgBluetooth} />
          </div>
          <div className="absolute left-[140px] size-[48px] top-[10px]" data-node-id="I37:3558;23:200" data-name="cell signal">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgCellSignal} />
          </div>
          <motion.button className="absolute left-[260px] overflow-clip size-[48px] top-[10px]" data-node-id="I37:3558;25:35" data-name="alert" type="button" aria-label="Giám sát cabin" data-control="cabin" onClick={() => onControl('cabin')} whileTap={{
          scale: .94
        }} transition={{
          duration: .14,
          ease: [.2, 0, 0, 1]
        }}>
            <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[32px] left-1/2 top-1/2 w-[36px]" data-node-id="I37:3558;25:35;25:33" data-name="Group">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgGroup2} />
            </div>
          </motion.button>
          <motion.button className="absolute flex items-center justify-center left-[325px] size-[40px] top-[15px]" data-node-id="I37:3558;25:43" type="button" aria-label="Thư viện Tesla UI" data-control="library" onClick={() => onControl('library')} whileTap={{
          scale: .94
        }} transition={{
          duration: .14,
          ease: [.2, 0, 0, 1]
        }}>
            <div className="-scale-y-100 flex-none rotate-180">
              <div className="relative size-[40px]" data-name="Tesla Logo">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgTeslaLogo} />
              </div>
            </div>
          </motion.button>
          <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[25px] justify-center leading-[0] right-[50px] text-[20px] text-right text-white top-[34.5px] w-[100px]" data-node-id="I37:3558;25:47">
            <p className="leading-[normal]">{model.time}</p>
          </div>
          <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[25px] justify-center leading-[0] right-[200px] text-[20px] text-right text-white top-[34.5px] w-[100px]" data-node-id="I37:3558;25:48">
            <p className="leading-[normal]">{model.outside}</p>
          </div>
        </div>
      </div>
      <motion.div data-node-id="37:3559" data-name="music" className="absolute right-[21px] w-[1300px] overflow-hidden" initial={false} animate={model.mediaExpanded ? {
      top: 80,
      height: 1000
    } : {
      top: 898,
      height: 182
    }} transition={reduceMotion ? {
      duration: 0
    } : {
      type: "spring",
      stiffness: 320,
      damping: 34,
      mass: .9
    }} style={{
      overflowY: model.mediaExpanded ? 'auto' : 'hidden',
      zIndex: model.mediaExpanded ? 5 : undefined
    }}><MusicHandle expanded={model.mediaExpanded} onChange={expanded => onControl(expanded ? "music-expand" : "music-collapse")} />
        <div className="absolute contents left-0 top-0" data-node-id="I37:3559;497:225181" data-name="Dark">
          <div className="absolute bg-[#171717] inset-0 rounded-[10px]" data-node-id="I37:3559;497:214410" data-name="background" />
          <div className="absolute contents left-[40px] right-[40px] top-[589px]" data-node-id="I37:3559;46:5457" data-name="Top Stations">
            <div className="absolute h-[166px] left-[40px] right-[40px] top-[651px]" data-node-id="I37:3559;44:4900" data-name="Album Row">
              <div className="absolute inset-[0_86.39%_0_0]" data-node-id="I37:3559;44:4900;44:2445" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:4900;44:2445;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover} />
                </div>
              </div>
              <div className="absolute inset-[0_0_0_86.39%]" data-node-id="I37:3559;44:4900;44:3352" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:4900;44:3352;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover1} />
                </div>
              </div>
              <div className="absolute inset-[0_17.3%_0_69.1%]" data-node-id="I37:3559;44:4900;44:3486" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:4900;44:3486;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover2} />
                </div>
              </div>
              <div className="absolute inset-[0_34.59%_0_51.8%]" data-node-id="I37:3559;44:4900;44:3626" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:4900;44:3626;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover3} />
                </div>
              </div>
              <div className="absolute inset-[0_51.8%_0_34.59%]" data-node-id="I37:3559;44:4900;44:3772" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:4900;44:3772;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover4} />
                </div>
              </div>
              <div className="absolute inset-[0_69.1%_0_17.3%]" data-node-id="I37:3559;44:4900;44:3924" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:4900;44:3924;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover5} />
                </div>
              </div>
            </div>
            <div className="absolute h-[166px] left-[40px] right-[40px] top-[847px]" data-node-id="I37:3559;44:5117" data-name="Album Row">
              <div className="absolute inset-[0_86.39%_0_0]" data-node-id="I37:3559;44:5117;44:2445" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:5117;44:2445;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover6} />
                </div>
              </div>
              <div className="absolute inset-[0_0_0_86.39%]" data-node-id="I37:3559;44:5117;44:3352" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:5117;44:3352;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover7} />
                </div>
              </div>
              <div className="absolute inset-[0_17.3%_0_69.1%]" data-node-id="I37:3559;44:5117;44:3486" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:5117;44:3486;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover8} />
                </div>
              </div>
              <div className="absolute inset-[0_34.59%_0_51.8%]" data-node-id="I37:3559;44:5117;44:3626" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:5117;44:3626;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover9} />
                </div>
              </div>
              <div className="absolute inset-[0_51.8%_0_34.59%]" data-node-id="I37:3559;44:5117;44:3772" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:5117;44:3772;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover10} />
                </div>
              </div>
              <div className="absolute inset-[0_69.1%_0_17.3%]" data-node-id="I37:3559;44:5117;44:3924" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:5117;44:3924;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover11} />
                </div>
              </div>
            </div>
            <div className="absolute h-[166px] left-[40px] right-[40px] top-[1043px]" data-node-id="I37:3559;44:5373" data-name="Album Row">
              <div className="absolute inset-[0_86.39%_0_0]" data-node-id="I37:3559;44:5373;44:2445" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:5373;44:2445;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover12} />
                </div>
              </div>
              <div className="absolute inset-[0_0_0_86.39%]" data-node-id="I37:3559;44:5373;44:3352" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:5373;44:3352;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover13} />
                </div>
              </div>
              <div className="absolute inset-[0_17.3%_0_69.1%]" data-node-id="I37:3559;44:5373;44:3486" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:5373;44:3486;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover14} />
                </div>
              </div>
              <div className="absolute inset-[0_34.59%_0_51.8%]" data-node-id="I37:3559;44:5373;44:3626" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:5373;44:3626;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover15} />
                </div>
              </div>
              <div className="absolute inset-[0_51.8%_0_34.59%]" data-node-id="I37:3559;44:5373;44:3772" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:5373;44:3772;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover16} />
                </div>
              </div>
              <div className="absolute inset-[0_69.1%_0_17.3%]" data-node-id="I37:3559;44:5373;44:3924" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:5373;44:3924;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover17} />
                </div>
              </div>
            </div>
            <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[516px] right-[516px] text-[26px] text-center text-white top-[605px] uppercase" data-node-id="I37:3559;44:4734">
              <p className="leading-[normal]">Top Stations</p>
            </div>
          </div>
          <div className="absolute contents left-[40px] right-[40px] top-[311px]" data-node-id="I37:3559;46:5052" data-name="Favorites">
            <div className="absolute h-[166px] left-[40px] right-[40px] top-[373px]" data-node-id="I37:3559;44:4559" data-name="Album Row">
              <div className="absolute inset-[0_86.39%_0_0]" data-node-id="I37:3559;44:4559;44:2445" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:4559;44:2445;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover18} />
                </div>
              </div>
              <div className="absolute inset-[0_0_0_86.39%]" data-node-id="I37:3559;44:4559;44:3352" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:4559;44:3352;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover19} />
                </div>
              </div>
              <div className="absolute inset-[0_17.3%_0_69.1%]" data-node-id="I37:3559;44:4559;44:3486" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:4559;44:3486;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover20} />
                </div>
              </div>
              <div className="absolute inset-[0_34.59%_0_51.8%]" data-node-id="I37:3559;44:4559;44:3626" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:4559;44:3626;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover21} />
                </div>
              </div>
              <div className="absolute inset-[0_51.8%_0_34.59%]" data-node-id="I37:3559;44:4559;44:3772" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:4559;44:3772;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover22} />
                </div>
              </div>
              <div className="absolute inset-[0_69.1%_0_17.3%]" data-node-id="I37:3559;44:4559;44:3924" data-name="album cover">
                <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;44:4559;44:3924;27:1" data-name="album cover">
                  <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover23} />
                </div>
              </div>
            </div>
            <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[537px] right-[536px] text-[26px] text-center text-white top-[327px] uppercase" data-node-id="I37:3559;44:4082">
              <p className="leading-[normal]">Favorites</p>
            </div>
          </div>
          <div className="absolute contents left-0 top-[186px]" data-node-id="I37:3559;46:4651" data-name="Category Bar">
            <div className="absolute bg-[#131313] h-[75px] left-0 right-0 top-[186px]" data-node-id="I37:3559;44:2549" />
            <div className="-translate-x-1/2 [word-break:break-word] absolute contents font-['Montserrat'] font-medium leading-[0] left-1/2 text-[26px] text-center text-white top-[208px] whitespace-nowrap" data-node-id="I37:3559;45:897" data-name="Group">
              <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col justify-center left-[calc(50%-115.5px)] top-[224px]" data-node-id="I37:3559;45:30">
                <p className="leading-[normal]">Streaming</p>
              </div>
              <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col justify-center left-[calc(50%+41px)] opacity-40 top-[224px]" data-node-id="I37:3559;45:316">
                <p className="leading-[normal]">Radio</p>
              </div>
              <div className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col justify-center left-[calc(50%+156.5px)] opacity-40 top-[224px]" data-node-id="I37:3559;45:605">
                <p className="leading-[normal]">USB</p>
              </div>
            </div>
            <div className="absolute h-[60px] left-[50px] overflow-clip top-[199px] w-[250px]" data-node-id="I37:3559;44:3219" data-name="search field">
              <div className="absolute border-2 border-[rgba(255,255,255,0.2)] border-solid h-[60px] left-0 right-0 rounded-[4px] top-0" data-node-id="I37:3559;44:3219;44:2776" />
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[70px] opacity-60 right-[5px] text-[20px] text-white top-1/2" data-node-id="I37:3559;44:3219;44:2777">
                <p className="leading-[normal]">Anything</p>
              </div>
              <div className="-translate-y-1/2 absolute left-[4px] size-[48px] top-1/2" data-node-id="I37:3559;44:3219;44:2997" data-name="search">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgSearch} />
              </div>
            </div>
          </div>
          <div className="absolute contents left-0 top-0" data-node-id="I37:3559;46:13006" data-name="Now Playing">
            <div className="absolute bg-[#171717] h-[166px] left-0 right-0 shadow-[0px_5px_10px_0px_rgba(0,0,0,0.25)] top-0" data-node-id="I37:3559;46:690" data-name="shadow" />
            <motion.button className="-translate-x-1/2 absolute block cursor-pointer left-[calc(50%+534px)] size-[48px] top-[59px]" data-node-id="I37:3559;27:33" data-name="expand music" type="button" aria-label="Mở/thu gọn thư viện nhạc" data-control="expand-music" onClick={() => onControl('expand-music')} whileTap={{
            scale: .94
          }} transition={{
            duration: .14,
            ease: [.2, 0, 0, 1]
          }}>
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgExpandMusic} />
            </motion.button>
            <motion.button className="-translate-x-1/2 absolute left-[calc(50%+398px)] size-[48px] top-[59px]" data-node-id="I37:3559;27:43" data-name="search" type="button" aria-label="Tìm nhạc" data-control="media" onClick={() => onControl('media')} whileTap={{
            scale: .94
          }} transition={{
            duration: .14,
            ease: [.2, 0, 0, 1]
          }}>
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgSearch} />
            </motion.button>
            <motion.button className="-translate-x-1/2 absolute left-[calc(50%+261px)] size-[48px] top-[59px]" data-node-id="I37:3559;27:53" data-name="nexttrack" type="button" aria-label="Bài tiếp theo · MÔ PHỎNG" data-control="next" onClick={() => onControl('next')} whileTap={{
            scale: .94
          }} transition={{
            duration: .14,
            ease: [.2, 0, 0, 1]
          }}>
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgNexttrack} />
            </motion.button>
            <motion.button className="-translate-x-1/2 absolute left-[calc(50%+125px)] size-[48px] top-[59px]" data-node-id="I37:3559;27:70" data-name="pause" type="button" aria-label="Phát/tạm dừng · MÔ PHỎNG" data-control="play" onClick={() => onControl('play')} whileTap={{
            scale: .94
          }} transition={{
            duration: .14,
            ease: [.2, 0, 0, 1]
          }} aria-pressed={model.playing} data-playing={model.playing}>
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPause} />
            </motion.button>
            <motion.button className="-translate-x-1/2 absolute flex items-center justify-center left-[calc(50%-9px)] size-[48px] top-[59px]" data-node-id="I37:3559;27:16" type="button" aria-label="Bài trước · MÔ PHỎNG" data-control="previous" onClick={() => onControl('previous')} whileTap={{
            scale: .94
          }} transition={{
            duration: .14,
            ease: [.2, 0, 0, 1]
          }}>
              <div className="-scale-y-100 flex-none rotate-180">
                <div className="relative size-[48px]" data-name="prevtrack">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPrevtrack} />
                </div>
              </div>
            </motion.button>
            <div className="absolute contents left-[186px] top-0" data-node-id="I37:3559;27:256" data-name="Song Info">
              <div className="absolute contents left-[200px] top-[142px]" data-node-id="I37:3559;27:14" data-name="Progress">
                <div className="absolute bg-white h-[4px] left-[200px] rounded-[2px] top-[142px] w-[325px]" data-node-id="I37:3559;27:12" data-name="songbar" />
                <div className="absolute bg-[rgba(0,0,0,0.6)] h-[4px] left-[200px] rounded-[2px] top-[142px] w-[56px]" data-node-id="I37:3559;27:13" data-name="progress bar" />
              </div>
              <div className="-translate-x-full -translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[525px] text-[15px] text-[rgba(255,255,255,0.4)] text-right top-[128.5px] whitespace-nowrap" data-node-id="I37:3559;27:11">
                <p className="leading-[normal]">-1:23</p>
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[196px] text-[15px] text-[rgba(255,255,255,0.4)] top-[116.5px] whitespace-nowrap" data-node-id="I37:3559;27:3">
                <p className="leading-[normal]">{model.album}</p>
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[196px] text-[20px] text-white top-[89.5px] whitespace-nowrap" data-node-id="I37:3559;27:4">
                <p className="leading-[normal]">{model.artist}</p>
              </div>
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[196px] text-[26px] text-white top-[56px] whitespace-nowrap" data-node-id="I37:3559;27:2">
                <p className="leading-[normal]">{model.title}</p>
              </div>
              <motion.button className="absolute left-[186px] size-[48px] top-0" data-node-id="I37:3559;27:9" data-name="heart" type="button" aria-label="Yêu thích" data-control="favorite" onClick={() => onControl('favorite')} whileTap={{
              scale: .94
            }} transition={{
              duration: .14,
              ease: [.2, 0, 0, 1]
            }} aria-pressed={model.favorite} style={{
              opacity: model.favorite ? 1 : .55
            }}>
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgHeart} />
              </motion.button>
            </div>
            <div className="absolute left-0 size-[166px] top-0" data-node-id="I37:3559;42:28" data-name="album cover">
              <div className="absolute inset-0 rounded-[10px]" data-node-id="I37:3559;42:28;27:1" data-name="album cover">
                <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[10px] size-full" src={imgAlbumCover24} />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
      <motion.button className="absolute right-[21px] size-[80px] top-[90px]" data-node-id="37:3560" data-name="compass" type="button" aria-label="Hướng Bắc" data-control="north" onClick={() => onControl('north')} whileTap={{
      scale: .94
    }} transition={{
      duration: .14,
      ease: [.2, 0, 0, 1]
    }}>
        <div className="absolute left-0 size-[80px] top-0" data-node-id="I37:3560;31:110">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse11} />
        </div>
        <div className="absolute left-[15px] size-[50px] top-[15px]" data-node-id="I37:3560;31:114" data-name="direction">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgDirection} />
        </div>
        <div className="-translate-x-1/2 -translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[16px] justify-center leading-[0] left-[40px] text-[15px] text-center text-white top-[40px] w-[36px]" data-node-id="I37:3560;31:112">
          <p className="leading-[normal]">N</p>
        </div>
      </motion.button>
      <div className="absolute h-[175px] right-[21px] top-[190px] w-[80px]" data-node-id="37:3561" data-name="map zoom">
        <div className="absolute bg-[rgba(0,0,0,0.9)] h-[174px] left-0 rounded-[100px] top-0 w-[80px]" data-node-id="I37:3561;36:12" data-name="Rectangle" />
        <motion.button className="absolute left-[15px] size-[48px] top-[15px]" data-node-id="I37:3561;36:49" data-name="plus" type="button" aria-label="Phóng to bản đồ" data-control="zoom-in" onClick={() => onControl('zoom-in')} whileTap={{
        scale: .94
      }} transition={{
        duration: .14,
        ease: [.2, 0, 0, 1]
      }}>
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPlus} />
        </motion.button>
        <motion.button className="absolute left-[15px] overflow-clip size-[48px] top-[109px]" data-node-id="I37:3561;36:50" data-name="minus" type="button" aria-label="Thu nhỏ bản đồ" data-control="zoom-out" onClick={() => onControl('zoom-out')} whileTap={{
        scale: .94
      }} transition={{
        duration: .14,
        ease: [.2, 0, 0, 1]
      }}>
          <div className="-translate-x-1/2 -translate-y-1/2 absolute flex h-[3px] items-center justify-center left-1/2 top-1/2 w-[20px]" data-node-id="I37:3561;36:50;36:47">
            <div className="-rotate-90 flex-none">
              <div className="bg-[rgba(255,255,255,0.6)] h-[20px] relative rounded-[1px] w-[3px]" />
            </div>
          </div>
        </motion.button>
      </div>
      <motion.button className="absolute bottom-[442px] right-[21px] size-[80px]" data-node-id="37:3562" data-name="power station toggle" type="button" aria-label="Hiện/ẩn điểm sạc minh họa" data-control="chargers" onClick={() => onControl('chargers')} whileTap={{
      scale: .94
    }} transition={{
      duration: .14,
      ease: [.2, 0, 0, 1]
    }} aria-pressed={model.chargers}>
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPowerStationToggle} />
      </motion.button>
      <motion.button className="absolute bottom-[342px] right-[21px] size-[80px]" data-node-id="37:3563" data-name="map settings" type="button" aria-label="Mở bản đồ tương tác" data-control="map" onClick={() => onControl('map')} whileTap={{
      scale: .94
    }} transition={{
      duration: .14,
      ease: [.2, 0, 0, 1]
    }}>
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgMapSettings} />
      </motion.button>
      <motion.button className="absolute block cursor-pointer h-[80px] left-[600px] top-[80px] w-[340px]" data-node-id="37:3564" data-name="navigate button" type="button" aria-label="Tìm điểm đến" data-control="map" onClick={() => onControl('map')} whileTap={{
      scale: .94
    }} transition={{
      duration: .14,
      ease: [.2, 0, 0, 1]
    }}>
        <div className="absolute bg-[rgba(0,0,0,0.9)] inset-0 rounded-[40px]" data-node-id="I37:3564;37:0" data-name="button" />
        <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[80px] text-[20px] text-[rgba(255,255,255,0.4)] text-left top-1/2 whitespace-nowrap" data-node-id="I37:3564;37:12">
          <p className="leading-[normal]">Navigate</p>
        </div>
        <div className="-translate-y-1/2 absolute left-[15px] overflow-clip size-[48px] top-[calc(50%-1px)]" data-node-id="I37:3564;37:19" data-name="navigate icon">
          <div className="absolute flex inset-[17.59%_18.51%_17.59%_16.67%] items-center justify-center" data-node-id="I37:3564;37:19;37:2" style={{
          containerType: "size"
        }}>
            <div className="-rotate-45 flex-none h-[hypot(50cqw,50cqh)] w-[hypot(50cqw,-50cqh)]">
              <div className="overflow-clip relative size-full" data-name="navicon">
                <div className="absolute inset-[10.42%_4.17%]" data-node-id="I37:3564;37:19;37:2;31:6" data-name="Group">
                  <div className="absolute inset-[-19.14%_-27.2%_-44.67%_-27.26%]">
                    <img alt="" className="block max-w-none size-full" src={imgGroup3} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="-translate-y-1/2 absolute flex items-center justify-center right-[17px] size-[48px] top-[calc(50%+1px)]" data-node-id="I37:3564;37:13">
          <div className="-rotate-90 flex-none">
            <div className="relative size-[48px]" data-name="arrow">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgArrow} />
            </div>
          </div>
        </div>
      </motion.button>
      <div className="absolute bottom-0 h-[120px] left-0 w-[1920px]" data-node-id="37:3557" data-name="main control bar">
        <div className="absolute h-[128px] left-0 top-[-8px] w-[1920px]" data-node-id="I37:3557;363:18470" data-name="Background">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgBackground} />
        </div>
        <div className="-translate-x-1/2 -translate-y-1/2 absolute contents left-[calc(50%+775px)] top-1/2" data-node-id="I37:3557;26:92" data-name="Volume">
          <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute flex h-[30px] items-center justify-center left-[calc(50%+775px)] top-[calc(50%-41px)] w-[50px]" data-node-id="I37:3557;26:85" type="button" aria-label="Tăng âm lượng" data-control="volume-up" onClick={() => onControl('volume-up')} whileTap={{
          scale: .94
        }} transition={{
          duration: .14,
          ease: [.2, 0, 0, 1]
        }}>
            <div className="flex-none rotate-180">
              <div className="h-[30px] relative w-[50px]" data-name="arrow">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgArrow1} />
              </div>
            </div>
          </motion.button>
          <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute h-[30px] left-[calc(50%+775px)] top-[calc(50%+41px)] w-[50px]" data-node-id="I37:3557;26:86" data-name="arrow" type="button" aria-label="Giảm âm lượng" data-control="volume-down" onClick={() => onControl('volume-down')} whileTap={{
          scale: .94
        }} transition={{
          duration: .14,
          ease: [.2, 0, 0, 1]
        }}>
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgArrow2} />
          </motion.button>
          <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%+774px)] size-[48px] top-[calc(50%-1px)]" data-node-id="I37:3557;26:78" data-name="volume" type="button" aria-label="Âm lượng" data-control="volume" onClick={() => onControl('volume')} whileTap={{
          scale: .94
        }} transition={{
          duration: .14,
          ease: [.2, 0, 0, 1]
        }}>
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgVolume} />
          </motion.button>
        </div>
        <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%+624px)] size-[48px] top-[calc(50%-1px)]" data-node-id="I37:3557;26:56" data-name="phone" type="button" aria-label="Điện thoại" data-control="phone" onClick={() => onControl('phone')} whileTap={{
        scale: .94
      }} transition={{
        duration: .14,
        ease: [.2, 0, 0, 1]
      }}>
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPhone} />
        </motion.button>
        <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%+474px)] size-[48px] top-[calc(50%-1px)]" data-node-id="I37:3557;26:38" data-name="music" type="button" aria-label="Mở/thu gọn thư viện nhạc" data-control="expand-music" onClick={() => onControl('expand-music')} whileTap={{
        scale: .94
      }} transition={{
        duration: .14,
        ease: [.2, 0, 0, 1]
      }}>
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgMusic} />
        </motion.button>
        <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute flex items-center justify-center left-[calc(50%+326px)] size-[48px] top-[calc(50%-1px)]" data-node-id="I37:3557;25:602" type="button" aria-label="Sưởi ghế phụ · MÔ PHỎNG" data-control="passenger-seat" onClick={() => onControl('passenger-seat')} whileTap={{
        scale: .94
      }} transition={{
        duration: .14,
        ease: [.2, 0, 0, 1]
      }}>
          <div className="-scale-y-100 flex-none rotate-180">
            <div className="relative size-[48px]" data-name="seat">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgSeat} />
            </div>
          </div>
        </motion.button>
        <div className="-translate-x-1/2 absolute contents left-[calc(50%+150px)] top-0" data-node-id="I37:3557;26:90" data-name="Passenger Temp">
          <motion.button className="-translate-x-1/2 absolute flex h-[30px] items-center justify-center left-[calc(50%+150px)] top-0 w-[50px]" data-node-id="I37:3557;25:614" type="button" aria-label="Tăng nhiệt độ đặt bên phụ" data-control="passenger-up" onClick={() => onControl('passenger-up')} whileTap={{
          scale: .94
        }} transition={{
          duration: .14,
          ease: [.2, 0, 0, 1]
        }}>
            <div className="flex-none rotate-180">
              <div className="h-[30px] relative w-[50px]" data-name="arrow">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgArrow1} />
              </div>
            </div>
          </motion.button>
          <motion.button className="-translate-x-1/2 absolute h-[30px] left-[calc(50%+150px)] top-[86px] w-[50px]" data-node-id="I37:3557;25:619" data-name="arrow" type="button" aria-label="Giảm nhiệt độ đặt bên phụ" data-control="passenger-down" onClick={() => onControl('passenger-down')} whileTap={{
          scale: .94
        }} transition={{
          duration: .14,
          ease: [.2, 0, 0, 1]
        }}>
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgArrow2} />
          </motion.button>
          <div className="-translate-x-1/2 -translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-light h-[56px] justify-center leading-[0] left-[calc(50%+150px)] text-[0px] text-center text-white top-[58px] w-[150px]" data-node-id="I37:3557;26:16">
            <p className="text-[50px]">
              <span className="leading-[normal]">{model.passengerTemp}</span>
              <span className="leading-[normal] text-[rgba(255,255,255,0.4)]">º</span>
            </p>
          </div>
        </div>
        <div className="-translate-x-1/2 -translate-y-1/2 absolute contents left-1/2 top-[calc(50%+0.5px)]" data-node-id="I37:3557;26:91" data-name="Fan Level">
          <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-1px)] size-[48px] top-[calc(50%-13px)]" data-node-id="I37:3557;26:22" data-name="fan" type="button" aria-label="Điều hòa · MÔ PHỎNG" data-control="climate" onClick={() => onControl('climate')} whileTap={{
          scale: .94
        }} transition={{
          duration: .14,
          ease: [.2, 0, 0, 1]
        }}>
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgFan} />
          </motion.button>
          <div className="-translate-x-1/2 -translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[25px] justify-center leading-[0] left-1/2 text-[15px] text-center text-white top-[calc(50%+25.5px)] w-[100px]" data-node-id="I37:3557;26:24">
            <p className="leading-[normal]">MANUAL</p>
          </div>
        </div>
        <div className="-translate-x-1/2 absolute contents left-[calc(50%-150px)] top-0" data-node-id="I37:3557;26:89" data-name="Driver Temp">
          <motion.button className="-translate-x-1/2 absolute flex h-[30px] items-center justify-center left-[calc(50%-150px)] top-0 w-[50px]" data-node-id="I37:3557;25:610" type="button" aria-label="Tăng nhiệt độ đặt bên lái" data-control="driver-up" onClick={() => onControl('driver-up')} whileTap={{
          scale: .94
        }} transition={{
          duration: .14,
          ease: [.2, 0, 0, 1]
        }}>
            <div className="flex-none rotate-180">
              <div className="h-[30px] relative w-[50px]" data-name="arrow">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgArrow1} />
              </div>
            </div>
          </motion.button>
          <motion.button className="-translate-x-1/2 absolute h-[30px] left-[calc(50%-150px)] top-[86px] w-[50px]" data-node-id="I37:3557;26:6" data-name="arrow" type="button" aria-label="Giảm nhiệt độ đặt bên lái" data-control="driver-down" onClick={() => onControl('driver-down')} whileTap={{
          scale: .94
        }} transition={{
          duration: .14,
          ease: [.2, 0, 0, 1]
        }}>
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgArrow2} />
          </motion.button>
          <div className="-translate-x-1/2 -translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-light h-[56px] justify-center leading-[0] left-[calc(50%-150px)] text-[50px] text-center text-white top-[58px] w-[150px]" data-node-id="I37:3557;26:15">
            <p>
              <span className="leading-[normal]">{model.driverTemp}</span>
              <span className="leading-[normal] text-[rgba(255,255,255,0.4)]">º</span>
            </p>
          </div>
        </div>
        <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-326px)] size-[48px] top-[calc(50%-1px)]" data-node-id="I37:3557;25:753" data-name="seat" type="button" aria-label="Sưởi ghế lái · MÔ PHỎNG" data-control="driver-seat" onClick={() => onControl('driver-seat')} whileTap={{
        scale: .94
      }} transition={{
        duration: .14,
        ease: [.2, 0, 0, 1]
      }}>
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgSeat1} />
        </motion.button>
        <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-476px)] size-[48px] top-[calc(50%-1px)]" data-node-id="I37:3557;25:735" data-name="heater" type="button" aria-label="Sấy kính sau · MÔ PHỎNG" data-control="heater" onClick={() => onControl('heater')} whileTap={{
        scale: .94
      }} transition={{
        duration: .14,
        ease: [.2, 0, 0, 1]
      }}>
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgHeater} />
        </motion.button>
        <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-625px)] size-[50px] top-1/2" data-node-id="I37:3557;25:679" data-name="defrost" type="button" aria-label="Sấy kính trước · MÔ PHỎNG" data-control="defrost" onClick={() => onControl('defrost')} whileTap={{
        scale: .94
      }} transition={{
        duration: .14,
        ease: [.2, 0, 0, 1]
      }}>
          <div className="absolute inset-[0_0_0_-4%]">
            <img alt="" className="block max-w-none size-full" src={imgDefrost} />
          </div>
        </motion.button>
        <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute block cursor-pointer left-[calc(50%-776px)] size-[48px] top-[calc(50%-1px)]" data-node-id="I37:3557;25:639" data-name="model3-icon" type="button" aria-label="Cài đặt xe" data-control="settings" onClick={() => onControl('settings')} whileTap={{
        scale: .94
      }} transition={{
        duration: .14,
        ease: [.2, 0, 0, 1]
      }}>
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgModel3Icon} />
        </motion.button>
      </div>
    </div>;
}
