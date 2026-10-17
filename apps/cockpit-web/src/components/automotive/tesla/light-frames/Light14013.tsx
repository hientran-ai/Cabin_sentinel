import type { TeslaFrameProps } from '../types'
import { motion } from 'motion/react'
const imgBackground = "/cockpit/tesla-figma/panel-main-497-14013-imgBackground.svg";
const imgArrow = "/cockpit/tesla-figma/panel-main-497-14013-imgArrow.svg";
const imgArrow1 = "/cockpit/tesla-figma/panel-main-497-14013-imgArrow1.svg";
const imgVolume = "/cockpit/tesla-figma/panel-main-497-14013-imgVolume.svg";
const imgPhone = "/cockpit/tesla-figma/panel-main-497-14013-imgPhone.svg";
const imgMusic = "/cockpit/tesla-figma/panel-main-497-14013-imgMusic.svg";
const imgSeat = "/cockpit/tesla-figma/panel-main-497-14013-imgSeat.svg";
const imgFan = "/cockpit/tesla-figma/panel-main-497-14013-imgFan.svg";
const imgSeat1 = "/cockpit/tesla-figma/panel-main-497-14013-imgSeat1.svg";
const imgHeater = "/cockpit/tesla-figma/panel-main-497-14013-imgHeater.svg";
const imgDefrost = "/cockpit/tesla-figma/panel-main-497-14013-imgDefrost.svg";
const imgModel3Icon = "/cockpit/tesla-figma/panel-main-497-14013-imgModel3Icon.svg";
export default function Light14013({
  model,
  onControl
}: TeslaFrameProps) {
  return <div className="relative size-full" data-node-id="497:14013" data-name="main control bar / light">
      <div className="absolute h-[128px] left-0 top-[-8px] w-[1920px]" data-node-id="I497:14013;10793:58929;363:18470" data-name="Background">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgBackground} />
      </div>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute contents left-[calc(50%+775px)] top-1/2" data-node-id="I497:14013;10793:58929;26:92" data-name="Volume">
        <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute flex h-[30px] items-center justify-center left-[calc(50%+775px)] top-[calc(50%-41px)] w-[50px]" data-node-id="I497:14013;10793:58929;26:85" type="button" data-control="volume-up" aria-label="Tăng âm lượng" onClick={() => onControl('volume-up')} whileTap={{
        scale: .94
      }}>
          <div className="flex-none rotate-180">
            <div className="h-[30px] relative w-[50px]" data-name="arrow">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgArrow} />
            </div>
          </div>
        </motion.button>
        <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute h-[30px] left-[calc(50%+775px)] top-[calc(50%+41px)] w-[50px]" data-node-id="I497:14013;10793:58929;26:86" data-name="arrow" type="button" data-control="volume-down" aria-label="Giảm âm lượng" onClick={() => onControl('volume-down')} whileTap={{
        scale: .94
      }}>
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgArrow1} />
        </motion.button>
        <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%+774px)] size-[48px] top-[calc(50%-1px)]" data-node-id="I497:14013;10793:58929;26:78" data-name="volume" type="button" data-control="volume" aria-label="Âm lượng" onClick={() => onControl('volume')} whileTap={{
        scale: .94
      }}>
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgVolume} />
        </motion.button>
      </div>
      <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%+624px)] size-[48px] top-[calc(50%-1px)]" data-node-id="I497:14013;10793:58929;26:56" data-name="phone" type="button" data-control="phone" aria-label="Điện thoại" onClick={() => onControl('phone')} whileTap={{
      scale: .94
    }}>
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPhone} />
      </motion.button>
      <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%+474px)] size-[48px] top-[calc(50%-1px)]" data-node-id="I497:14013;10793:58929;26:38" data-name="music" type="button" data-control="expand-music" aria-label="Mở/thu gọn thư viện nhạc" onClick={() => onControl('expand-music')} whileTap={{
      scale: .94
    }}>
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgMusic} />
      </motion.button>
      <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute flex items-center justify-center left-[calc(50%+326px)] size-[48px] top-[calc(50%-1px)]" data-node-id="I497:14013;10793:58929;25:602" type="button" data-control="passenger-seat" aria-label="Sưởi ghế phụ · MÔ PHỎNG" onClick={() => onControl('passenger-seat')} whileTap={{
      scale: .94
    }}>
        <div className="-scale-y-100 flex-none rotate-180">
          <div className="relative size-[48px]" data-name="seat">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgSeat} />
          </div>
        </div>
      </motion.button>
      <div className="-translate-x-1/2 absolute contents left-[calc(50%+150px)] top-0" data-node-id="I497:14013;10793:58929;26:90" data-name="Passenger Temp">
        <motion.button className="-translate-x-1/2 absolute flex h-[30px] items-center justify-center left-[calc(50%+150px)] top-0 w-[50px]" data-node-id="I497:14013;10793:58929;25:614" type="button" data-control="passenger-up" aria-label="Tăng nhiệt độ đặt bên phụ" onClick={() => onControl('passenger-up')} whileTap={{
        scale: .94
      }}>
          <div className="flex-none rotate-180">
            <div className="h-[30px] relative w-[50px]" data-name="arrow">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgArrow} />
            </div>
          </div>
        </motion.button>
        <motion.button className="-translate-x-1/2 absolute h-[30px] left-[calc(50%+150px)] top-[86px] w-[50px]" data-node-id="I497:14013;10793:58929;25:619" data-name="arrow" type="button" data-control="passenger-down" aria-label="Giảm nhiệt độ đặt bên phụ" onClick={() => onControl('passenger-down')} whileTap={{
        scale: .94
      }}>
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgArrow1} />
        </motion.button>
        <div className="-translate-x-1/2 -translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-light h-[56px] justify-center leading-[0] left-[calc(50%+150px)] text-[0px] text-center text-white top-[58px] w-[150px]" data-node-id="I497:14013;10793:58929;26:16">
          <p className="text-[50px]">
            <span className="leading-[normal]">{model.passengerTemp}</span>
            <span className="leading-[normal] text-[rgba(255,255,255,0.4)]">º</span>
          </p>
        </div>
      </div>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute contents left-1/2 top-[calc(50%+0.5px)]" data-node-id="I497:14013;10793:58929;26:91" data-name="Fan Level">
        <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-1px)] size-[48px] top-[calc(50%-13px)]" data-node-id="I497:14013;10793:58929;26:22" data-name="fan" type="button" data-control="climate" aria-label="Điều hòa · MÔ PHỎNG" onClick={() => onControl('climate')} whileTap={{
        scale: .94
      }}>
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgFan} />
        </motion.button>
        <div className="-translate-x-1/2 -translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-medium h-[25px] justify-center leading-[0] left-1/2 text-[15px] text-center text-white top-[calc(50%+25.5px)] w-[100px]" data-node-id="I497:14013;10793:58929;26:24">
          <p className="leading-[normal]">MANUAL</p>
        </div>
      </div>
      <div className="-translate-x-1/2 absolute contents left-[calc(50%-150px)] top-0" data-node-id="I497:14013;10793:58929;26:89" data-name="Driver Temp">
        <motion.button className="-translate-x-1/2 absolute flex h-[30px] items-center justify-center left-[calc(50%-150px)] top-0 w-[50px]" data-node-id="I497:14013;10793:58929;25:610" type="button" data-control="driver-up" aria-label="Tăng nhiệt độ đặt bên lái" onClick={() => onControl('driver-up')} whileTap={{
        scale: .94
      }}>
          <div className="flex-none rotate-180">
            <div className="h-[30px] relative w-[50px]" data-name="arrow">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgArrow} />
            </div>
          </div>
        </motion.button>
        <motion.button className="-translate-x-1/2 absolute h-[30px] left-[calc(50%-150px)] top-[86px] w-[50px]" data-node-id="I497:14013;10793:58929;26:6" data-name="arrow" type="button" data-control="driver-down" aria-label="Giảm nhiệt độ đặt bên lái" onClick={() => onControl('driver-down')} whileTap={{
        scale: .94
      }}>
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgArrow1} />
        </motion.button>
        <div className="-translate-x-1/2 -translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Montserrat'] font-light h-[56px] justify-center leading-[0] left-[calc(50%-150px)] text-[50px] text-center text-white top-[58px] w-[150px]" data-node-id="I497:14013;10793:58929;26:15">
          <p>
            <span className="leading-[normal]">{model.driverTemp}</span>
            <span className="leading-[normal] text-[rgba(255,255,255,0.4)]">º</span>
          </p>
        </div>
      </div>
      <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-326px)] size-[48px] top-[calc(50%-1px)]" data-node-id="I497:14013;10793:58929;25:753" data-name="seat" type="button" data-control="driver-seat" aria-label="Sưởi ghế lái · MÔ PHỎNG" onClick={() => onControl('driver-seat')} whileTap={{
      scale: .94
    }}>
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgSeat1} />
      </motion.button>
      <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-476px)] size-[48px] top-[calc(50%-1px)]" data-node-id="I497:14013;10793:58929;25:735" data-name="heater" type="button" data-control="heater" aria-label="Sấy kính sau · MÔ PHỎNG" onClick={() => onControl('heater')} whileTap={{
      scale: .94
    }}>
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgHeater} />
      </motion.button>
      <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-625px)] size-[50px] top-1/2" data-node-id="I497:14013;10793:58929;25:679" data-name="defrost" type="button" data-control="defrost" aria-label="Sấy kính trước · MÔ PHỎNG" onClick={() => onControl('defrost')} whileTap={{
      scale: .94
    }}>
        <div className="absolute inset-[0_0_0_-4%]">
          <img alt="" className="block max-w-none size-full" src={imgDefrost} />
        </div>
      </motion.button>
      <motion.button className="-translate-x-1/2 -translate-y-1/2 absolute block cursor-pointer left-[calc(50%-776px)] size-[48px] top-[calc(50%-1px)]" data-node-id="I497:14013;10793:58929;25:639" data-name="model3-icon" type="button" data-control="settings" aria-label="Cài đặt xe" onClick={() => onControl('settings')} whileTap={{
      scale: .94
    }}>
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgModel3Icon} />
      </motion.button>
    </div>;
}
