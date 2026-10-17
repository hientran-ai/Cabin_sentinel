// Figma source: see docs/tesla-figma/README.md. Assets and geometry preserved.
const imgBattery = "/cockpit/tesla-figma/library-dark-imgBattery.svg";
const imgSeatbelt = "/cockpit/tesla-figma/library-dark-imgSeatbelt.svg";
const imgHeadlight3 = "/cockpit/tesla-figma/library-dark-imgHeadlight3.svg";
const imgHeadlight2 = "/cockpit/tesla-figma/library-dark-imgHeadlight2.svg";
const imgTeslaReflection = "/cockpit/tesla-figma/library-dark-imgTeslaReflection.png";
const imgShadow = "/cockpit/tesla-figma/library-dark-imgShadow.svg";
const imgLock = "/cockpit/tesla-figma/library-dark-imgLock.svg";
const imgLine1 = "/cockpit/tesla-figma/library-dark-imgLine1.svg";
const imgLine3 = "/cockpit/tesla-figma/library-dark-imgLine3.svg";
const imgLine2 = "/cockpit/tesla-figma/library-dark-imgLine2.svg";
const imgIconPower = "/cockpit/tesla-figma/library-dark-imgIconPower.svg";
const imgLine4 = "/cockpit/tesla-figma/library-dark-imgLine4.svg";
const imgVector = "/cockpit/tesla-figma/library-dark-imgVector.svg";
const imgLine30 = "/cockpit/tesla-figma/library-dark-imgLine30.svg";
type GearProps = {
  className?: string;
  gear?: "parked";
  mode?: "night";
};
function Gear({
  className
}: GearProps) {
  return <div className={className || "h-[22px] relative w-[63px]"} data-node-id="49:32871">
      <div className="[word-break:break-word] absolute content-stretch flex font-['Inter'] font-medium gap-[4px] inset-0 items-start leading-[1.2] not-italic text-[18px] tracking-[-0.18px] whitespace-nowrap" data-node-id="49:32872">
        <p className="relative shrink-0 text-white" data-node-id="49:32873">
          P
        </p>
        <p className="relative shrink-0 text-[#a2a3a5]" data-node-id="49:32874">
          R
        </p>
        <p className="relative shrink-0 text-[#a2a3a5]" data-node-id="49:32875">
          N
        </p>
        <p className="relative shrink-0 text-[#a2a3a5]" data-node-id="49:32876">
          D
        </p>
      </div>
    </div>;
}
type StatusBarProps = {
  className?: string;
  lightMode?: "off";
  status?: "status3";
};
function StatusBar({
  className
}: StatusBarProps) {
  return <div className={className || "content-stretch flex h-[64px] items-center justify-between px-[24px] relative w-[630px]"} data-node-id="49:32921">
      <Gear className="h-[22px] relative shrink-0 w-[63px]" />
      <div className="content-stretch flex gap-[8px] items-center justify-end relative shrink-0" data-node-id="49:32923" data-name="Battery Level">
        <div className="[word-break:break-word] flex flex-col font-['Inter'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[18px] text-right text-white tracking-[-0.18px] whitespace-nowrap" data-node-id="49:32924">
          <p className="leading-[1.2]">90%</p>
        </div>
        <div className="h-[20px] relative shrink-0 w-[45px]" data-node-id="49:32925" data-name="battery">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgBattery} />
        </div>
      </div>
    </div>;
}
function Seatbelt({
  className
}: {
  className?: string;
}) {
  return <div className={className || "relative size-[54px]"} data-node-id="1:251" data-name="Seatbelt">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgSeatbelt} />
    </div>;
}
function Headlights({
  className
}: {
  className?: string;
}) {
  return <div className={className || "content-stretch flex items-center justify-center relative size-[54px]"} data-node-id="1:247" data-name="Headlights">
      <div className="relative shrink-0 size-[48px]" data-node-id="1:248" data-name="headlight3">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgHeadlight3} />
      </div>
    </div>;
}
function Headlight2({
  className
}: {
  className?: string;
}) {
  return <div className={className || "relative size-[54px]"} data-node-id="1:241" data-name="Headlight2">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgHeadlight2} />
    </div>;
}
type SidebarProps = {
  className?: string;
  mode?: "dark";
  status?: "parked";
};
export default function Sidebar({
  className
}: SidebarProps) {
  return <div className={className || "h-[1080px] overflow-clip relative shadow-[1px_1px_12px_2px_rgba(0,0,0,0.04),-2px_-2px_20px_8px_rgba(117,117,117,0.06),5px_-3px_30px_20px_rgba(117,117,117,0.08)] w-[630px]"} data-node-id="356:8644">
      <div aria-hidden className="absolute bg-[#171717] inset-0 pointer-events-none" />
      <div className="absolute h-[837px] left-[-124px] top-[540px] w-[913px]" data-node-id="356:8645" data-name="Shadow">
        <div className="absolute inset-[-8.4%_-7.7%]">
          <img alt="" className="block max-w-none size-full" src={imgShadow} />
        </div>
      </div>
      <div className="absolute contents left-[-2px] top-[306px]" data-node-id="356:8646" data-name="Car">
        <div className="absolute flex h-[443.594px] items-center justify-center left-[-2px] top-[505px] w-[621.076px]" data-node-id="356:8647">
          <div className="-scale-y-100 flex-none rotate-[-23.41deg]">
            <div className="h-[234.282px] relative w-[575.354px]" data-name="Tesla Reflection">
              <img alt="" className="absolute inset-0 max-w-none object-cover opacity-2 pointer-events-none size-full" src={imgTeslaReflection} />
            </div>
          </div>
        </div>
        <div className="absolute h-[307px] left-[22px] top-[443px] w-[544px]" data-node-id="356:8648" data-name="Tesla">
          <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgTeslaReflection} />
        </div>
        <div className="absolute h-[48px] left-[290px] top-[354px] w-[51px]" data-node-id="356:8649" data-name="lock">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgLock} />
        </div>
        <div className="absolute flex h-[81px] items-center justify-center left-[315.5px] top-[402px] w-0" data-node-id="356:8656">
          <div className="flex-none rotate-90">
            <div className="h-0 relative w-[81px]">
              <div className="absolute inset-[-0.38px_-0.46%]">
                <img alt="" className="block max-w-none size-full" src={imgLine1} />
              </div>
            </div>
          </div>
        </div>
        <div className="absolute flex h-[182px] items-center justify-center left-[495px] top-[306px] w-0" data-node-id="356:8657">
          <div className="flex-none rotate-90">
            <div className="h-0 relative w-[182px]">
              <div className="absolute inset-[-0.38px_-0.21%]">
                <img alt="" className="block max-w-none size-full" src={imgLine3} />
              </div>
            </div>
          </div>
        </div>
        <div className="absolute h-0 left-[545px] top-[536px] w-[17px]" data-node-id="356:8658">
          <div className="absolute inset-[-0.38px_-2.21%]">
            <img alt="" className="block max-w-none size-full" src={imgLine2} />
          </div>
        </div>
        <div className="absolute h-[30px] left-[561px] top-[521px] w-[31.5px]" data-node-id="356:8659" data-name="Icon / Power">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIconPower} />
        </div>
        <div className="absolute flex h-[209px] items-center justify-center left-[113px] top-[368px] w-0" data-node-id="356:8661">
          <div className="flex-none rotate-90">
            <div className="h-0 relative w-[209px]">
              <div className="absolute inset-[-0.38px_-0.18%]">
                <img alt="" className="block max-w-none size-full" src={imgLine4} />
              </div>
            </div>
          </div>
        </div>
        <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Nunito'] font-semibold justify-center leading-[0] left-[123px] text-[#d0d2d0] text-[14px] top-[376.5px] tracking-[0.28px] w-[41px]" data-node-id="356:8662">
          <p className="leading-[1.2]">Open</p>
        </div>
        <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Inter'] font-bold justify-center leading-[0] left-[123px] not-italic text-[16px] text-white top-[395.5px] tracking-[0.16px] whitespace-nowrap" data-node-id="356:8663">
          <p className="leading-[1.2]">Frunk</p>
        </div>
        <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Nunito'] font-semibold justify-center leading-[0] left-[505px] text-[#d0d2d0] text-[14px] top-[314.5px] tracking-[0.28px] w-[41px]" data-node-id="356:8664">
          <p className="leading-[1.2]">Open</p>
        </div>
        <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Inter'] font-bold justify-center leading-[0] left-[505px] not-italic text-[16px] text-white top-[333.5px] tracking-[0.16px] whitespace-nowrap" data-node-id="356:8665">
          <p className="leading-[1.2]">Trunk</p>
        </div>
      </div>
      <div className="absolute content-stretch flex flex-col gap-[3px] items-start left-[18px] top-[84px]" data-node-id="356:8666">
        <Headlight2 className="relative shrink-0 size-[54px]" />
        <div className="content-stretch flex flex-col items-center justify-center p-[10px] relative shrink-0 size-[54px]" data-node-id="356:8668" data-name="Headlight1">
          <div className="grid-cols-[max-content] grid-rows-[max-content] inline-grid leading-[0] place-items-start relative shrink-0" data-node-id="I356:8668;17:2354" data-name="Headlight1">
            <div className="[word-break:break-word] col-1 flex flex-col font-['Montserrat'] font-bold justify-center ml-[23px] mt-[4px] relative row-1 text-[#a2a3a5] text-[14px] whitespace-nowrap" data-node-id="I356:8668;17:2355">
              <p className="leading-[normal]">A</p>
            </div>
            <div className="col-1 h-[28px] ml-0 mt-0 relative row-1 w-[38px]" data-node-id="I356:8668;17:2356" data-name="Vector">
              <div className="absolute inset-[-5.36%_-3.95%]">
                <img alt="" className="block max-w-none size-full" src={imgVector} />
              </div>
            </div>
          </div>
        </div>
        <Headlights className="content-stretch flex items-center justify-center relative shrink-0 size-[54px]" />
        <Seatbelt className="relative shrink-0 size-[54px]" />
      </div>
      <StatusBar className="-translate-x-1/2 absolute content-stretch flex h-[64px] items-center justify-between left-1/2 px-[24px] top-0 w-[630px]" />
      <div className="-translate-y-1/2 absolute flex h-[136px] items-center justify-center left-[618px] top-1/2 w-0" data-node-id="356:8672">
        <div className="flex-none rotate-90">
          <div className="h-0 relative w-[136px]">
            <div className="absolute inset-[-55px_-41.91%_-49px_-34.56%]">
              <img alt="" className="block max-w-none size-full" src={imgLine30} />
            </div>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_1px_-1px_10px_8px_rgba(0,0,0,0.04),inset_0px_1px_6px_0px_rgba(0,0,0,0.1)]" />
    </div>;
}
