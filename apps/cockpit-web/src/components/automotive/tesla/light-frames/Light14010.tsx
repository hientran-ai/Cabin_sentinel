import type { TeslaFrameProps } from '../types'
import { motion } from 'motion/react'
const imgMapSettingsLight = "/cockpit/tesla-figma/panel-main-497-14010-imgMapSettingsLight.svg";
export default function Light14010({
  onControl
}: TeslaFrameProps) {
  return <motion.button className="relative size-full" data-node-id="497:14010" data-name="map settings / light" type="button" data-control="map" aria-label="Mở bản đồ tương tác" onClick={() => onControl('map')} whileTap={{
    scale: .94
  }}>
      <div className="absolute inset-[0_-5%_-10%_-5%]">
        <img alt="" className="block max-w-none size-full" src={imgMapSettingsLight} />
      </div>
    </motion.button>;
}
