export type TeslaSettingsTab = 'quick' | 'lights' | 'locks' | 'display' | 'driving' | 'autopilot' | 'safety' | 'service'
export interface SettingsFrameProps {
  onNavigate: (tab: TeslaSettingsTab) => void
  onAction: (action: string, value?: number) => void
  active: (action: string) => boolean
  brightness: number
  parkingBrake: boolean
}
