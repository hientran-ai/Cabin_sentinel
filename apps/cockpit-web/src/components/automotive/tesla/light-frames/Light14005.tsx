import type { TeslaFrameProps } from '../types'
import { motion } from 'motion/react'
const imgLock = "/cockpit/tesla-figma/panel-main-497-14005-imgLock.svg";
const imgBluetooth = "/cockpit/tesla-figma/panel-main-497-14005-imgBluetooth.svg";
const imgCellSignal = "/cockpit/tesla-figma/panel-main-497-14005-imgCellSignal.svg";
const imgGroup = "/cockpit/tesla-figma/panel-main-497-14005-imgGroup.svg";
const imgTeslaLogo = "/cockpit/tesla-figma/panel-main-497-14005-imgTeslaLogo.svg";
export default function Light14005({
  model,
  onControl
}: TeslaFrameProps) {
  return <div className="relative size-full" data-node-id="497:14005" data-name="status bar">
      <div className="absolute contents left-0 top-0" data-node-id="I497:14005;497:211234" data-name="Light">
        <div className="absolute bg-gradient-to-b from-[rgba(255,255,255,0.6)] h-[60px] left-0 right-0 to-[rgba(255,255,255,0)] top-0" data-node-id="I497:14005;497:211235" data-name="Dark" />
        <motion.button className="absolute left-[20px] size-[48px] top-[10px]" data-node-id="I497:14005;497:211236" data-name="lock" type="button" data-control="lock-info" aria-label="Trạng thái khóa xe · MÔ PHỎNG" onClick={() => onControl('lock-info')} whileTap={{
        scale: .94
      }}>
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgLock} />
        </motion.button>
        <div className="absolute left-[80px] size-[48px] top-[10px]" data-node-id="I497:14005;497:211237" data-name="bluetooth">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgBluetooth} />
        </div>
        <div className="absolute left-[140px] size-[48px] top-[10px]" data-node-id="I497:14005;497:211238" data-name="cell signal">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgCellSignal} />
        </div>
        <motion.button className="absolute left-[260px] overflow-clip size-[48px] top-[10px]" data-node-id="I497:14005;497:211239" data-name="alert" type="button" data-control="cabin" aria-label="Giám sát cabin" onClick={() => onControl('cabin')} whileTap={{
        scale: .94
      }}>
          <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[32px] left-1/2 top-1/2 w-[36px]" data-node-id="I497:14005;497:211239;25:33" data-name="Group">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgGroup} />
          </div>
        </motion.button>
        <motion.button className="absolute flex items-center justify-center left-[325px] size-[40px] top-[15px]" data-node-id="I497:14005;497:211240" type="button" data-control="library" aria-label="Thư viện Tesla UI" onClick={() => onControl('library')} whileTap={{
        scale: .94
      }}>
          <div className="-scale-y-100 flex-none rotate-180">
            <div className="relative size-[40px]" data-name="Tesla Logo">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgTeslaLogo} />
            </div>
          </div>
        </motion.button>
        <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[25px] justify-center leading-[0] right-[50px] text-[20px] text-black text-right top-[34.5px] w-[100px]" data-node-id="I497:14005;497:211241">
          <p className="leading-[normal]">{model.time}</p>
        </div>
        <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[25px] justify-center leading-[0] right-[200px] text-[20px] text-black text-right top-[34.5px] w-[100px]" data-node-id="I497:14005;497:211242">
          <p className="leading-[normal]">{model.outside}</p>
        </div>
      </div>
    </div>;
}
