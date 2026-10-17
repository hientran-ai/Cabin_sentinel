import type { TeslaFrameProps } from '../types'
const imgMapBg = "/cockpit/tesla-figma/panel-main-497-14003-imgMapBg.png";
const imgLight = "/cockpit/tesla-figma/panel-main-497-14003-imgLight.png";
const imgRoute = "/cockpit/tesla-figma/panel-main-497-14003-imgRoute.svg";
const imgGroup = "/cockpit/tesla-figma/panel-main-497-14003-imgGroup.svg";
const imgChargingStation = "/cockpit/tesla-figma/panel-main-497-14003-imgChargingStation.svg";
export default function Light14003({
  model
}: TeslaFrameProps) {
  return <div className="relative size-full" data-node-id="497:14003" data-name="map">
      <div className="absolute h-[1734px] left-[-680px] overflow-clip top-[-316px] w-[2412px]" data-node-id="I497:14003;30:4" data-name="map bg" style={{
      transform: `scale(${model.mapZoom})`,
      transformOrigin: '50% 50%'
    }}>
        <img alt="" className="absolute inset-0 max-w-none object-contain pointer-events-none size-full" src={imgMapBg} />
        <div className="absolute inset-[6.75%_-10.82%_9.92%_14.97%]" data-node-id="I497:14003;30:4;498:0" data-name="light">
          <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgLight} />
        </div>
      </div>
      <div className="absolute h-[808px] left-[693px] top-[-316px] w-[297px]" data-node-id="I497:14003;31:68" data-name="route" hidden={true}>
        <div className="absolute inset-[-0.62%_-1.68%]">
          <img alt="" className="block max-w-none size-full" src={imgRoute} />
        </div>
      </div>
      <div className="absolute contents left-[662.95px] top-[410.15px]" data-node-id="I497:14003;37:4242" data-name="navicons">
        <div className="absolute flex items-center justify-center left-[859.22px] size-[64.825px] top-[410.15px]" data-node-id="I497:14003;37:4172">
          <div className="flex-none rotate-[-27.74deg]">
            <div className="overflow-clip relative size-[48px]" data-name="at station">
              <div className="absolute inset-[10.42%_4.17%]" data-node-id="I497:14003;37:4172;31:6" data-name="Group">
                <div className="absolute inset-[-2.63%_-4.67%_-10.76%_-4.66%]">
                  <img alt="" className="block max-w-none size-full" src={imgGroup} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute left-[865px] size-[48px] top-[398px]" data-node-id="I497:14003;31:55" data-name="charging station" style={{
      visibility: model.chargers ? 'visible' : 'hidden'
    }}>
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgChargingStation} />
      </div>
      <div className="absolute h-[40px] left-[415px] top-[197px] w-[54px]" data-node-id="I497:14003;51:30" data-name="road label">
        <div className="absolute bg-[#7071c5] inset-0 rounded-[6px]" data-node-id="I497:14003;51:30;51:28" data-name="road label" />
        <div className="[word-break:break-word] absolute flex flex-col font-['Montserrat'] font-semibold inset-[20%_8px_17.5%_8px] justify-center leading-[0] text-[24px] text-center text-white" data-node-id="I497:14003;51:30;51:29">
          <p className="leading-[normal]">75</p>
        </div>
      </div>
      <div className="absolute h-[40px] left-[124px] top-[826px] w-[54px]" data-node-id="I497:14003;165:357" data-name="road label">
        <div className="absolute bg-[#7071c5] inset-0 rounded-[6px]" data-node-id="I497:14003;165:357;51:28" data-name="road label" />
        <div className="[word-break:break-word] absolute flex flex-col font-['Montserrat'] font-semibold inset-[20%_8px_17.5%_8px] justify-center leading-[0] text-[24px] text-center text-white" data-node-id="I497:14003;165:357;51:29">
          <p className="leading-[normal]">20</p>
        </div>
      </div>
      <div className="absolute h-[40px] left-[716px] top-[786px] w-[54px]" data-node-id="I497:14003;165:74" data-name="road label">
        <div className="absolute bg-[#7071c5] inset-0 rounded-[6px]" data-node-id="I497:14003;165:74;51:28" data-name="road label" />
        <div className="[word-break:break-word] absolute flex flex-col font-['Montserrat'] font-semibold inset-[20%_8px_17.5%_8px] justify-center leading-[0] text-[24px] text-center text-white" data-node-id="I497:14003;165:74;51:29">
          <p className="leading-[normal]">75</p>
        </div>
      </div>
      <div className="absolute h-[40px] left-[1086px] top-[176px] w-[54px]" data-node-id="I497:14003;51:31" data-name="road label">
        <div className="absolute bg-[#7071c5] inset-0 rounded-[6px]" data-node-id="I497:14003;51:31;51:28" data-name="road label" />
        <div className="[word-break:break-word] absolute flex flex-col font-['Montserrat'] font-semibold inset-[20%_8px_17.5%_8px] justify-center leading-[0] text-[24px] text-center text-white" data-node-id="I497:14003;51:31;51:29">
          <p className="leading-[normal]">85</p>
        </div>
      </div>
      <div className="absolute h-[40px] left-[855px] top-[143px] w-[71px]" data-node-id="I497:14003;51:32" data-name="road label">
        <div className="absolute bg-[#7071c5] inset-0 rounded-[6px]" data-node-id="I497:14003;51:32;51:28" data-name="road label" />
        <div className="[word-break:break-word] absolute flex flex-col font-['Montserrat'] font-semibold inset-[20%_8px_17.5%_8px] justify-center leading-[0] text-[24px] text-center text-white" data-node-id="I497:14003;51:32;51:29">
          <p className="leading-[normal]">400</p>
        </div>
      </div>
    </div>;
}
