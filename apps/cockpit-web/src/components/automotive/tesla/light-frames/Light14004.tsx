import type { TeslaFrameProps } from '../types'
import { motion } from 'motion/react'
const imgEllipse6 = "/cockpit/tesla-figma/panel-main-497-14004-imgEllipse6.svg";
const imgMicrophone = "/cockpit/tesla-figma/panel-main-497-14004-imgMicrophone.svg";
const imgCamera = "/cockpit/tesla-figma/panel-main-497-14004-imgCamera.svg";
const imgPower = "/cockpit/tesla-figma/panel-main-497-14004-imgPower.svg";
const imgHeadlights = "/cockpit/tesla-figma/panel-main-497-14004-imgHeadlights.svg";
const imgModel3 = "/cockpit/tesla-figma/panel-main-497-14004-imgModel3.svg";
const imgPower1 = "/cockpit/tesla-figma/panel-main-497-14004-imgPower1.svg";
const imgBattery = "/cockpit/tesla-figma/panel-main-497-14004-imgBattery.svg";
const imgHeadlights1 = "/cockpit/tesla-figma/panel-main-497-14004-imgHeadlights1.svg";
const imgGroup = "/cockpit/tesla-figma/panel-main-497-14004-imgGroup.svg";
export default function Light14004({
  model,
  onControl
}: TeslaFrameProps) {
  return <div className="bg-[#0e0e0e] relative size-full" data-node-id="497:14004" data-name="Sidebar">
      <div className="absolute bg-[#f1f1f1] inset-0 overflow-clip" data-node-id="I497:14004;497:157253" data-name="Light">
        <div className="absolute bottom-0 h-[60px] left-0 overflow-clip right-0" data-node-id="I497:14004;497:157254" data-name="pagination">
          <div className="-translate-x-1/2 absolute contents left-[calc(50%+4px)] top-[25px]" data-node-id="I497:14004;497:157255" data-name="Group">
            <div className="-translate-x-1/2 absolute left-[calc(50%-21px)] size-[10px] top-[25px]" data-node-id="I497:14004;497:157256">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse6} />
            </div>
            <div className="-translate-x-1/2 absolute left-[calc(50%+4px)] size-[10px] top-[25px]" data-node-id="I497:14004;497:157257">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse6} />
            </div>
            <div className="-translate-x-1/2 absolute left-[calc(50%+29px)] size-[10px] top-[25px]" data-node-id="I497:14004;497:157258">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse6} />
            </div>
          </div>
        </div>
        <div className="absolute bottom-[150px] h-[50px] left-0 overflow-clip right-0" data-node-id="I497:14004;497:157259" data-name="action icons">
          <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%+149px)] size-[48px] top-[calc(50%-1px)]" data-node-id="I497:14004;497:157260" data-name="microphone" type="button" data-control="voice" aria-label="Thông tin điều khiển giọng nói" onClick={() => onControl('voice')} whileTap={{
          scale: .94
        }}>
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgMicrophone} />
          </motion.button>
          <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-151px)] size-[48px] top-[calc(50%-1px)]" data-node-id="I497:14004;497:157264" data-name="camera" type="button" data-control="camera" aria-label="Camera" onClick={() => onControl('camera')} whileTap={{
          scale: .94
        }}>
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgCamera} />
          </motion.button>
          <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-1px)] size-[48px] top-[calc(50%-1px)]" data-node-id="I497:14004;497:157273" data-name="power" type="button" data-control="charge" aria-label="Mở/đóng cổng sạc · MÔ PHỎNG" onClick={() => onControl('charge')} whileTap={{
          scale: .94
        }} aria-pressed={model.chargeOpen}>
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPower} />
          </motion.button>
        </div>
        <div className="absolute bg-[#0e0e0e] inset-[207px_0_243px_0] overflow-clip" data-node-id="I497:14004;497:157280" data-name="parked">
          <div className="absolute contents left-0 top-0" data-node-id="I497:14004;497:157280;497:3042" data-name="Light">
            <div className="absolute bg-[#f0f0f0] inset-0" data-node-id="I497:14004;497:157280;497:3043" data-name="background" />
            <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[25px] justify-center leading-[0] left-[20px] text-[20px] text-[rgba(0,0,0,0.4)] top-[22.5px] w-[540px]" data-node-id="I497:14004;497:157280;497:3044">
              <p className="leading-[normal]">MODEL 3</p>
            </div>
            <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[170px] left-[calc(50%+0.5px)] top-[calc(50%-230px)] w-[213px]" data-node-id="I497:14004;497:157280;497:3045" data-name="headlights">
              <div className="absolute inset-[-14.71%_-11.74%]">
                <img alt="" className="block max-w-none size-full" src={imgHeadlights} />
              </div>
            </div>
            <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute block cursor-pointer h-[60px] left-1/2 top-[calc(50%-220px)] w-[150px]" data-node-id="I497:14004;497:157280;497:3048" data-name="button" type="button" data-control="frunk" aria-label="Mở/đóng cốp trước · MÔ PHỎNG" onClick={() => onControl('frunk')} whileTap={{
            scale: .94
          }} aria-pressed={model.frunkOpen}>
              <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:14004;497:157280;497:3048;18:3" style={{
              backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.8) 100%), linear-gradient(90deg, rgb(14, 14, 14) 0%, rgb(14, 14, 14) 100%)"
            }} />
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:14004;497:157280;497:3048;18:2">
                <p className="leading-[normal]">{model.frunkOpen ? 'close' : 'open'}</p>
              </div>
            </motion.button>
            <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute block cursor-pointer h-[60px] left-1/2 top-[calc(50%+210px)] w-[150px]" data-node-id="I497:14004;497:157280;497:3049" data-name="button" type="button" data-control="trunk" aria-label="Mở/đóng cốp sau · MÔ PHỎNG" onClick={() => onControl('trunk')} whileTap={{
            scale: .94
          }} aria-pressed={model.trunkOpen}>
              <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:14004;497:157280;497:3049;18:3" style={{
              backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.8) 100%), linear-gradient(90deg, rgb(14, 14, 14) 0%, rgb(14, 14, 14) 100%)"
            }} />
              <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[24px] justify-center leading-[0] left-[20px] lowercase right-[20px] text-[20px] text-black text-center top-1/2" data-node-id="I497:14004;497:157280;497:3049;18:2">
                <p className="leading-[normal]">{model.trunkOpen ? 'close' : 'open'}</p>
              </div>
            </motion.button>
            <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute block cursor-pointer h-[60px] left-[calc(50%-165px)] top-[calc(50%+125px)] w-[150px]" data-node-id="I497:14004;497:157280;497:3050" data-name="button" type="button" data-control="charge" aria-label="Mở/đóng cổng sạc · MÔ PHỎNG" onClick={() => onControl('charge')} whileTap={{
            scale: .94
          }} aria-pressed={model.chargeOpen}>
              <div className="absolute inset-0 rounded-[50px]" data-node-id="I497:14004;497:157280;497:3050;18:3" style={{
              backgroundImage: "linear-gradient(90deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.8) 100%), linear-gradient(90deg, rgb(14, 14, 14) 0%, rgb(14, 14, 14) 100%)"
            }} />
            </motion.button>
            <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[334.011px] left-[calc(50%+0.44px)] top-[calc(50%-7.99px)] w-[146.889px]" data-node-id="I497:14004;497:157280;497:3051" data-name="model 3">
              <div className="absolute inset-[-2.4%_-6.81%_-3.59%_-6.81%]">
                <img alt="" className="block max-w-none size-full" src={imgModel3} />
              </div>
            </div>
            <div className="-translate-y-1/2 absolute left-[101px] size-[48px] top-[calc(50%+125px)]" data-node-id="I497:14004;497:157280;497:12675" data-name="power">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPower1} />
            </div>
          </div>
        </div>
        <div className="absolute contents right-[20px] top-[167px]" data-node-id="I497:14004;497:157573" data-name="Battery Level">
          <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[25px] justify-center leading-[0] right-[97px] text-[20px] text-[rgba(0,0,0,0.4)] text-right top-[179.5px] w-[100px]" data-node-id="I497:14004;497:157574">
            <p className="leading-[normal]">{model.battery}</p>
          </div>
          <div className="absolute h-[20px] right-[20px] top-[170px] w-[62px]" data-node-id="I497:14004;497:157575" data-name="battery">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgBattery} />
          </div>
        </div>
        <div className="[word-break:break-word] absolute contents font-['Montserrat'] font-medium leading-[normal] left-[20px] text-[20px] top-[168px] whitespace-nowrap" data-node-id="I497:14004;497:157580" data-name="gear" hidden={model.speed === 'P'}>
          <p className="absolute left-[20px] text-[rgba(0,0,0,0.4)] top-[168px]" data-node-id="I497:14004;497:157581" style={{
          opacity: model.gear === 'P' ? 1 : .4,
          color: '#000'
        }}>
            P
          </p>
          <p className="absolute left-[47px] text-[rgba(0,0,0,0.4)] top-[168px]" data-node-id="I497:14004;497:157582" style={{
          opacity: model.gear === 'R' ? 1 : .4,
          color: '#000'
        }}>
            R
          </p>
          <p className="absolute left-[74px] text-[rgba(0,0,0,0.4)] top-[168px]" data-node-id="I497:14004;497:157583" style={{
          opacity: model.gear === 'N' ? 1 : .4,
          color: '#000'
        }}>
            N
          </p>
          <p className="absolute left-[101px] text-black top-[168px]" data-node-id="I497:14004;497:157584" style={{
          opacity: model.gear === 'D' ? 1 : .4,
          color: '#000'
        }}>
            D
          </p>
        </div>
        <div className="absolute contents left-[10px] top-[60px]" data-node-id="I497:14004;497:157585" data-name="Speedometer">
          <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[25px] justify-center leading-[0] left-[43.1%] right-[43.1%] text-[20px] text-[rgba(0,0,0,0.4)] text-center top-[179.5px]" data-node-id="I497:14004;497:157586">
            <p className="leading-[normal]">{model.units}</p>
          </div>
          <div className="absolute bg-[rgba(0,0,0,0.4)] h-[2px] left-[3.45%] right-[3.45%] top-[205px]" data-node-id="I497:14004;497:157587" data-name="speedometer line" />
          <div className="-translate-x-1/2 absolute bg-[#25cb55] h-[6px] left-[calc(50%+20.5px)] rounded-[3px] top-[203px] w-[41px]" data-node-id="I497:14004;497:157588" data-name="current speed Line" />
          <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[100px] justify-center leading-[0] left-[1.72%] right-[1.72%] text-[110px] text-black text-center top-[110px]" data-node-id="I497:14004;497:157589">
            <p className="leading-[normal]">{model.speed}</p>
          </div>
        </div>
        <div className="absolute h-[60px] left-0 overflow-clip right-0 top-0" data-node-id="I497:14004;497:157597" data-name="top info icons">
          <div className="absolute right-[22px] size-[48px] top-[10px]" data-node-id="I497:14004;497:157598" data-name="headlights">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgHeadlights1} />
          </div>
          <div className="-translate-x-1/2 absolute left-[calc(50%-176px)] overflow-clip size-[48px] top-[10px]" data-node-id="I497:14004;497:157600" data-name="tire pressure">
            <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[31px] left-1/2 top-[calc(50%+1.5px)] w-[34px]" data-node-id="I497:14004;497:157600;9:43" data-name="Group">
              <div className="absolute inset-[-6.45%_-5.88%_0_-5.88%]">
                <img alt="" className="block max-w-none size-full" src={imgGroup} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>;
}
