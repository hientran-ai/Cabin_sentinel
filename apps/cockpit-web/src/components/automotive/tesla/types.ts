export interface TeslaModel {
  gear: string
  speed: string; units: string; battery: string; time: string; outside: string
  driverTemp: string; passengerTemp: string
  title: string; artist: string; album: string
  frunkOpen: boolean; trunkOpen: boolean; chargeOpen: boolean
  playing: boolean; favorite: boolean; mediaExpanded: boolean; mapZoom: number; chargers: boolean
}
export interface TeslaFrameProps { model: TeslaModel; onControl: (control: string) => void }
