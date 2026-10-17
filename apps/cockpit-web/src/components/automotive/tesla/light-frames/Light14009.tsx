import type { TeslaFrameProps } from '../types'
import { motion } from 'motion/react'
const imgPowerStationToggleLight = "/cockpit/tesla-figma/panel-main-497-14009-imgPowerStationToggleLight.svg";
export default function Light14009({
  model,
  onControl
}: TeslaFrameProps) {
  return <motion.button className="relative size-full" data-node-id="497:14009" data-name="power station toggle / light" type="button" data-control="chargers" aria-label="Hiện/ẩn điểm sạc minh họa" onClick={() => onControl('chargers')} whileTap={{
    scale: .94
  }} aria-pressed={model.chargers}>
      <div className="absolute inset-[0_-5%_-10%_-5%]">
        <img alt="" className="block max-w-none size-full" src={imgPowerStationToggleLight} />
      </div>
    </motion.button>;
}
