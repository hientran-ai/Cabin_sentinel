import type { TeslaFrameProps } from '../types'
import { motion } from 'motion/react'
const imgEllipse11 = "/cockpit/tesla-figma/panel-main-497-14007-imgEllipse11.svg";
const imgDirection = "/cockpit/tesla-figma/panel-main-497-14007-imgDirection.svg";
export default function Light14007({
  onControl
}: TeslaFrameProps) {
  return <motion.button className="relative size-full" data-node-id="497:14007" data-name="compass / light" type="button" data-control="north" aria-label="Hướng Bắc" onClick={() => onControl('north')} whileTap={{
    scale: .94
  }}>
      <div className="absolute left-0 size-[80px] top-0" data-node-id="I497:14007;524:61488;31:110">
        <div className="absolute inset-[0_-5%_-10%_-5%]">
          <img alt="" className="block max-w-none size-full" src={imgEllipse11} />
        </div>
      </div>
      <div className="absolute left-[15px] size-[50px] top-[15px]" data-node-id="I497:14007;524:61488;31:114" data-name="direction">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgDirection} />
      </div>
      <div className="-translate-x-1/2 -translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[16px] justify-center leading-[0] left-[40px] text-[15px] text-black text-center top-[40px] w-[36px]" data-node-id="I497:14007;524:61488;31:112">
        <p className="leading-[normal]">N</p>
      </div>
    </motion.button>;
}
