export type Brand = 'tesla' | 'vinfast'
export type Gear = 'P' | 'R' | 'N' | 'D'
export type DoorId = 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight'
export type WindowState = 'closed' | 'vent' | 'open'
export type Headlights = 'off' | 'auto' | 'on'
export type ChargingState = 'disconnected' | 'connected' | 'charging' | 'complete'
export type Airflow = 'face' | 'faceFeet' | 'feet' | 'windshield'
export type Appearance = 'light' | 'dark' | 'auto'
export type Language = 'vi' | 'en'
export type Units = 'metric' | 'imperial'
export type CameraView = 'front' | 'rear' | 'left' | 'right' | 'cabin'
export type Overlay = 'vehicle' | 'climate' | 'camera' | 'launcher' | 'cabin' | 'volume' | 'media' | 'map' | 'control' | 'phone' | 'library' | 'carmode' | 'cabinset' | null
export type VehicleTab = 'quick' | 'driving' | 'safety' | 'charging' | 'display' | 'settings'

export interface LatLng { lat: number; lng: number }

export interface ClimateState {
  enabled: boolean
  driverTemperature: number
  passengerTemperature: number
  sync: boolean
  fanSpeed: number // 1..10
  autoMode: boolean
  ac: boolean
  recirculation: boolean
  airflow: Airflow
  frontDefrost: boolean
  rearDefrost: boolean
  seatHeatDriver: number // 0..3
  seatHeatPassenger: number // 0..3
}

/** Everything here is SIMULATED: the web demo never reads or controls a real vehicle. */
export interface VehicleState {
  brand: Brand
  speed: number // km/h, what the gauge shows
  gear: Gear
  batteryLevel: number // %
  isLocked: boolean
  doors: Record<DoorId, boolean>
  windows: Record<DoorId, WindowState>
  frontTrunkOpen: boolean
  rearTrunkOpen: boolean
  chargingPortOpen: boolean
  chargeCable: boolean
  charging: ChargingState
  chargeLimit: number
  headlights: Headlights
  parkingBrake: boolean
  driverSeatbelt: boolean
  childLock: boolean
  sentryMode: boolean
  steeringMode: 'comfort' | 'standard' | 'sport'
  accelerationMode: 'chill' | 'standard' | 'sport'
  regenLevel: 'low' | 'standard' | 'high'
  climate: ClimateState
  outsideTemperature: number
  /** Demo-only: speeds up cabin heat-soak so a parked-car scenario does not take 10 real minutes. 1 = real time. */
  heatScale: number
  cabinTemperature: number
  /** Demo driving: the simulation drives the speed by itself (follows the route if there is one). */
  autoDrive: boolean
  /** Manual speed from the developer panel; null = the simulation decides. */
  speedOverride: number | null
}

export interface BrandSpec {
  id: Brand
  model: string
  capacityKWh: number
  whPerKm: number
  /** body proportions for the code-built 3D model, metres */
  length: number
  width: number
  height: number
  wheelbase: number
  rideHeight: number
  bodyStyle: 'sedan' | 'suv'
  chargePort: 'rear-left' | 'front-left'
  paints: { id: string; label: string; color: string }[]
}
