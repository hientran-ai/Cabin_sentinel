import { useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ChevronLeft, ChevronRight, Clock3, Fan, Power, Repeat2, Wind, X, ArrowDownToLine, ArrowUpToLine, Dog, Tent, ThermometerSun } from 'lucide-react'
import { useVehicle } from '../../../store/vehicleStore'
import { useUi } from '../../../store/uiStore'
import { notify } from '../../../store/notificationStore'
import { formatTemp } from '../../../lib/vehicleSimulation'
import { FrontDefrost, RearDefrost, SeatHeat, SteeringWheel, Wipers } from '../icons'

function ClimateButton({ label, children, active, onClick, className='' }: { label:string; children:ReactNode; active?:boolean; onClick:()=>void; className?:string }) {
  return <motion.button type="button" className={'tesla-climate-button '+className} aria-label={label} aria-pressed={active} onClick={onClick} whileTap={{scale:.92}} transition={{duration:.14}}>{children}</motion.button>
}

function Vent({ passenger=false, on }: { passenger?:boolean; on:boolean }) {
  const [direction,setDirection]=useState(0)
  const reduced=useReducedMotion()
  return <motion.div className={'tesla-vent '+(passenger?'is-passenger':'')} style={{opacity:on?1:0}} animate={{opacity:on?1:0}}>
    <motion.div className="tesla-air-plume" animate={{rotate:direction}} transition={{type:'spring',stiffness:240,damping:28}}>
      {[0,1,2,3,4].map(i=><motion.i key={i} style={{left:18+i*32}} animate={on&&!reduced?{opacity:[.15,.55,.15],scaleY:[.85,1.1,.85]}:{opacity:on?.4:0}} transition={{repeat:Infinity,duration:2.6,delay:i*.18,ease:'easeInOut'}}/>)}
    </motion.div>
    <motion.button type="button" className="tesla-vent-touch" aria-label={passenger?'Hướng gió minh hoạ bên phụ':'Hướng gió minh hoạ bên lái'}
      onPan={(_,info)=>setDirection(Math.max(-25,Math.min(25,info.offset.x/5)))} onDoubleClick={()=>setDirection(0)} onKeyDown={e=>{if(e.key==='ArrowLeft')setDirection(x=>Math.max(-25,x-5));if(e.key==='ArrowRight')setDirection(x=>Math.min(25,x+5))}}>
      <span className="tesla-vent-dot" />
    </motion.button>
  </motion.div>
}

export function TeslaClimate() {
  const v=useVehicle(), ui=useUi(), c=v.climate
  const reduced=useReducedMotion()
  const close=()=>ui.setOverlay(null)
  const info=(name:string)=>notify({key:'tesla-climate-info',level:'info',title:name+' · MÔ PHỎNG',body:'Chưa tích hợp chức năng này. Không có lệnh xe nào được gửi.'})
  return <motion.section className="tesla-climate" role="region" aria-label="Tesla Climate Controls" data-testid="tesla-climate" initial={{opacity:0,y:100}} animate={{opacity:1,y:0}} exit={{opacity:0,y:100}} transition={reduced?{duration:0}:{type:'spring',stiffness:300,damping:32,mass:.85}}>
    <motion.button type="button" className="tesla-climate-handle" aria-label="Vuốt xuống đóng điều hoà" onClick={close} onPanEnd={(_,info)=>{if(info.offset.y>60||(info.offset.y>15&&info.velocity.y>450))close()}}><span/></motion.button>
    <div className="tesla-climate-park-modes" aria-label="Climate when parked">
      <ClimateButton label="Park climate Off" active onClick={()=>info('Park climate')}><span>Off</span></ClimateButton>
      <ClimateButton label="Keep Climate" onClick={()=>info('Keep Climate')}><ThermometerSun/><span>Keep</span></ClimateButton>
      <ClimateButton label="Pet Mode" onClick={()=>info('Pet Mode')}><Dog/><span>Dog</span></ClimateButton>
      <ClimateButton label="Camp Mode" onClick={()=>info('Camp Mode')}><Tent/><span>Camp</span></ClimateButton>
    </div>
    <div className="tesla-climate-surface">
      <img className="tesla-climate-interior" src="/cockpit/tesla-figma/climate-interior-clean.png" alt="Nội thất Tesla, minh hoạ điều chỉnh luồng gió" draggable={false}/>
      <div className="tesla-climate-top">
        <ClimateButton label="Bật/tắt điều hoà · MÔ PHỎNG" active={c.enabled} onClick={()=>v.setClimate({enabled:!c.enabled})}><Power/></ClimateButton>
        <ClimateButton label="Auto climate" active={c.autoMode&&c.enabled} onClick={()=>v.setClimate({autoMode:!c.autoMode,enabled:true})}><span>Auto</span></ClimateButton>
        <ClimateButton label="A/C" active={c.ac} onClick={()=>v.setClimate({ac:!c.ac})}><span>A/C</span></ClimateButton>
        <div className="tesla-climate-flow" aria-label="Airflow">
          <ClimateButton label="Gió kính trước" active={c.airflow==='windshield'} onClick={()=>v.setClimate({airflow:'windshield',autoMode:false})}><ArrowUpToLine/></ClimateButton>
          <ClimateButton label="Gió mặt" active={c.airflow==='face'||c.airflow==='faceFeet'} onClick={()=>v.setClimate({airflow:'face',autoMode:false})}><Wind/></ClimateButton>
          <ClimateButton label="Gió chân" active={c.airflow==='feet'||c.airflow==='faceFeet'} onClick={()=>v.setClimate({airflow:c.airflow==='face'?'faceFeet':'feet',autoMode:false})}><ArrowDownToLine/></ClimateButton>
        </div>
        <div className="tesla-climate-cabin-tabs">
          <ClimateButton label="Front climate" active onClick={()=>{}}><span>Front</span></ClimateButton>
          <ClimateButton label="Rear climate" onClick={()=>info('Rear climate')}><span>Rear</span></ClimateButton>
        </div>
        <ClimateButton label="Schedule climate" className="tesla-climate-schedule" onClick={()=>info('Schedule')}><span>Schedule</span><Clock3/></ClimateButton>
        <ClimateButton label="Đóng điều hoà" onClick={close}><X/></ClimateButton>
      </div>
      <Vent on={c.enabled}/><Vent passenger on={c.enabled}/>
      <div className="tesla-climate-bottom">
        <ClimateButton label="Sưởi ghế lái" active={c.seatHeatDriver>0} onClick={()=>v.cycleSeatHeat('driver')}><SeatHeat level={c.seatHeatDriver}/><small>{c.seatHeatDriver||'Off'}</small></ClimateButton>
        <ClimateButton label="Wiper defrost" onClick={()=>info('Wiper defrost')}><Wipers/></ClimateButton>
        <ClimateButton label="Heated steering wheel" onClick={()=>info('Heated steering wheel')}><SteeringWheel/></ClimateButton>
        <ClimateButton label="Sấy kính trước" active={c.frontDefrost} onClick={()=>v.setClimate({frontDefrost:!c.frontDefrost,enabled:true})}><FrontDefrost/></ClimateButton>
        <ClimateButton label="Sấy kính sau" active={c.rearDefrost} onClick={()=>v.setClimate({rearDefrost:!c.rearDefrost})}><RearDefrost/></ClimateButton>
        <div className="tesla-climate-fan">
          <ClimateButton label="Giảm quạt" onClick={()=>v.setClimate({fanSpeed:Math.max(1,c.fanSpeed-1),autoMode:false,enabled:true})}><ChevronLeft/></ClimateButton>
          <Fan/><input aria-label="Tốc độ quạt" type="range" min="1" max="10" value={c.fanSpeed} onChange={e=>v.setClimate({fanSpeed:+e.target.value,autoMode:false,enabled:true})}/><output>{c.fanSpeed}</output>
          <ClimateButton label="Tăng quạt" onClick={()=>v.setClimate({fanSpeed:Math.min(10,c.fanSpeed+1),autoMode:false,enabled:true})}><ChevronRight/></ClimateButton>
        </div>
        <ClimateButton label="Tuần hoàn không khí" active={c.recirculation} onClick={()=>v.setClimate({recirculation:!c.recirculation})}><Repeat2/></ClimateButton>
        <span className="tesla-climate-bottom-spacer"/>
        <ClimateButton label="Sưởi ghế phụ" active={c.seatHeatPassenger>0} onClick={()=>v.cycleSeatHeat('passenger')}><SeatHeat level={c.seatHeatPassenger}/><small>{c.seatHeatPassenger||'Off'}</small></ClimateButton>
      </div>
      <div className="tesla-climate-temperature">
        <div><ClimateButton label="Giảm nhiệt bên lái" onClick={()=>v.stepTemp('driver',-.5)}><ChevronLeft/></ClimateButton><output>{formatTemp(c.driverTemperature,ui.units)}°</output><ClimateButton label="Tăng nhiệt bên lái" onClick={()=>v.stepTemp('driver',.5)}><ChevronRight/></ClimateButton></div>
        <ClimateButton label="Đồng bộ nhiệt độ" active={c.sync} onClick={()=>v.setClimate({sync:!c.sync,...(!c.sync?{passengerTemperature:c.driverTemperature}:{})})}><span>{c.sync?'SYNC':'SPLIT'}</span></ClimateButton>
        <div><ClimateButton label="Giảm nhiệt bên phụ" onClick={()=>v.stepTemp('passenger',-.5)}><ChevronLeft/></ClimateButton><output>{formatTemp(c.passengerTemperature,ui.units)}°</output><ClimateButton label="Tăng nhiệt bên phụ" onClick={()=>v.stepTemp('passenger',.5)}><ChevronRight/></ClimateButton></div>
      </div>
      <p className="tesla-climate-caption">SIMULATED · Luồng gió minh hoạ · chưa điều khiển xe thật</p>
    </div>
  </motion.section>
}
