import type { TeslaFrameProps } from '../types'
import { motion } from 'motion/react'
const imgGroup = "/cockpit/tesla-figma/panel-main-497-14011-imgGroup.svg";
const imgArrow = "/cockpit/tesla-figma/panel-main-497-14011-imgArrow.svg";
export default function Light14011({
  onControl
}: TeslaFrameProps) {
  return <motion.button className="block cursor-pointer relative size-full" data-node-id="497:14011" data-name="navigate button / light" type="button" data-control="map" aria-label="Mở bản đồ tương tác" onClick={() => onControl('map')} whileTap={{
    scale: .94
  }}>
      <div className="absolute drop-shadow-[0px_4px_2px_rgba(0,0,0,0.25)] inset-0" data-node-id="I497:14011;524:61484" data-name="navigate button / light">
        <div className="absolute bg-[#f0f0f0] inset-0 rounded-[40px]" data-node-id="I497:14011;524:61484;37:0" data-name="button" />
        <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium justify-center leading-[0] left-[80px] text-[20px] text-[rgba(0,0,0,0.6)] text-left top-1/2 whitespace-nowrap" data-node-id="I497:14011;524:61484;37:12">
          <p className="leading-[normal]">Navigate</p>
        </div>
        <div className="-translate-y-1/2 absolute left-[15px] overflow-clip size-[48px] top-[calc(50%-1px)]" data-node-id="I497:14011;524:61484;37:19" data-name="navigate icon">
          <div className="absolute flex inset-[17.59%_18.51%_17.59%_16.67%] items-center justify-center" data-node-id="I497:14011;524:61484;37:19;37:2" style={{
          containerType: "size"
        }}>
            <div className="-rotate-45 flex-none h-[hypot(50cqw,50cqh)] w-[hypot(50cqw,-50cqh)]">
              <div className="overflow-clip relative size-full" data-name="navicon">
                <div className="absolute inset-[10.42%_4.17%]" data-node-id="I497:14011;524:61484;37:19;37:2;31:6" data-name="Group">
                  <div className="absolute inset-[-6.37%_-5.44%_-6.37%_-5.5%]">
                    <img alt="" className="block max-w-none size-full" src={imgGroup} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="-translate-y-1/2 absolute flex items-center justify-center right-[17px] size-[48px] top-[calc(50%+1px)]" data-node-id="I497:14011;524:61484;37:13">
          <div className="-rotate-90 flex-none">
            <div className="relative size-[48px]" data-name="arrow">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgArrow} />
            </div>
          </div>
        </div>
      </div>
    </motion.button>;
}
