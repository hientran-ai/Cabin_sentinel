import type { TeslaFrameProps } from '../types'
import { motion } from 'motion/react'
const imgPlus = "/cockpit/tesla-figma/panel-main-497-14008-imgPlus.svg";
export default function Light14008({
  onControl
}: TeslaFrameProps) {
  return <div className="relative size-full" data-node-id="497:14008" data-name="map zoom / light">
      <div className="absolute bg-[#f0f0f0] h-[174px] left-0 rounded-[100px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] top-0 w-[80px]" data-node-id="I497:14008;524:61487;36:12" data-name="Rectangle" />
      <motion.button className="absolute left-[15px] size-[48px] top-[15px]" data-node-id="I497:14008;524:61487;36:49" data-name="plus" type="button" data-control="zoom-in" aria-label="Phóng to bản đồ" onClick={() => onControl('zoom-in')} whileTap={{
      scale: .94
    }}>
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPlus} />
      </motion.button>
      <motion.button className="absolute left-[15px] overflow-clip size-[48px] top-[109px]" data-node-id="I497:14008;524:61487;36:50" data-name="minus" type="button" data-control="zoom-out" aria-label="Thu nhỏ bản đồ" onClick={() => onControl('zoom-out')} whileTap={{
      scale: .94
    }}>
        <div className="-translate-x-1/2 -translate-y-1/2 absolute flex h-[3px] items-center justify-center left-1/2 top-1/2 w-[20px]" data-node-id="I497:14008;524:61487;36:50;36:47">
          <div className="-rotate-90 flex-none">
            <div className="bg-[rgba(0,0,0,0.6)] h-[20px] relative rounded-[1px] w-[3px]" />
          </div>
        </div>
      </motion.button>
    </div>;
}
