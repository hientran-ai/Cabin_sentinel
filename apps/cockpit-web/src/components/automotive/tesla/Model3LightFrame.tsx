import { motion, useReducedMotion } from 'motion/react'
import type { TeslaFrameProps } from './types'
import { MusicHandle } from './MusicHandle'
import Light14004 from './light-frames/Light14004'
import Light14005 from './light-frames/Light14005'
import Light14006 from './light-frames/Light14006'
import Light14007 from './light-frames/Light14007'
import Light14008 from './light-frames/Light14008'
import Light14009 from './light-frames/Light14009'
import Light14010 from './light-frames/Light14010'
import Light14011 from './light-frames/Light14011'
import Light14013 from './light-frames/Light14013'
export default function Model3LightFrame(props:TeslaFrameProps){
 const reduced=useReducedMotion(), expanded=props.model.mediaExpanded
 return <div className="relative size-full" data-node-id="497:14002">
  <div className="absolute left-0 top-0 w-[580px] h-[1080px]"><Light14004 {...props}/></div>
  <div className="absolute left-[580px] top-0 w-[1340px] h-[70px]"><Light14005 {...props}/></div>
  <motion.div className="absolute left-[599px] w-[1300px] overflow-hidden" initial={false} animate={expanded?{top:80,height:1000}:{top:898,height:182}} transition={reduced?{duration:0}:{type:'spring',stiffness:320,damping:34,mass:.9}} style={{overflowY:expanded?'auto':'hidden',zIndex:expanded?5:undefined}}>
    <div className="h-[1309px] w-[1300px]"><Light14006 {...props}/></div><MusicHandle expanded={expanded} onChange={x=>props.onControl(x?'music-expand':'music-collapse')}/>
  </motion.div>
  <div className="absolute left-[1819px] top-[90px] size-[80px]"><Light14007 {...props}/></div>
  <div className="absolute left-[1819px] top-[190px] w-[80px] h-[175px]"><Light14008 {...props}/></div>
  <div className="absolute left-[1819px] top-[678px] size-[80px]"><Light14009 {...props}/></div>
  <div className="absolute left-[1819px] top-[778px] size-[80px]"><Light14010 {...props}/></div>
  <div className="absolute left-[600px] top-[80px] w-[340px] h-[80px]"><Light14011 {...props}/></div>
  <div className="absolute left-0 top-[1080px] w-[1920px] h-[120px]"><Light14013 {...props}/></div>
 </div>
}
