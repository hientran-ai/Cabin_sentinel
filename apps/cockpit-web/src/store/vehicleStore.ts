import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Brand, ClimateState, DoorId, Gear, Headlights, VehicleState, WindowState } from '../types/vehicle'
import { BRANDS, clamp } from '../lib/vehicleSimulation'
import { notify, useNotifications } from './notificationStore'
import { useUi } from './uiStore'
import { translate, type StringKey } from '../i18n/strings'

const t = (k: StringKey) => translate(useUi.getState().language, k)
const L = (vi: string, en: string) => (useUi.getState().language === 'vi' ? vi : en)
const closedDoors = (): Record<DoorId, boolean> => ({ frontLeft: false, frontRight: false, rearLeft: false, rearRight: false })
const closedWindows = (): Record<DoorId, WindowState> => ({ frontLeft: 'closed', frontRight: 'closed', rearLeft: 'closed', rearRight: 'closed' })

export const DEFAULT_CLIMATE: ClimateState = {
  enabled: true, driverTemperature: 21.5, passengerTemperature: 21.5, sync: true, fanSpeed: 4, autoMode: true, ac: true,
  recirculation: false, airflow: 'faceFeet', frontDefrost: false, rearDefrost: false, seatHeatDriver: 0, seatHeatPassenger: 0,
}

const initial: VehicleState = {
  brand: 'tesla', speed: 0, gear: 'P', batteryLevel: 68, isLocked: false, doors: closedDoors(), windows: closedWindows(),
  frontTrunkOpen: false, rearTrunkOpen: false, chargingPortOpen: false, chargeCable: false, charging: 'disconnected', chargeLimit: 80,
  headlights: 'auto', parkingBrake: true, driverSeatbelt: true, childLock: true, sentryMode: false,
  steeringMode: 'standard', accelerationMode: 'standard', regenLevel: 'standard', climate: DEFAULT_CLIMATE,
  outsideTemperature: 17, heatScale: 1, cabinTemperature: 21.5, autoDrive: false, speedOverride: null,
}

interface Actions {
  setBrand: (b: Brand) => void
  setGear: (g: Gear) => void
  toggleLock: () => void
  toggleDoor: (d: DoorId) => void
  toggleFrunk: () => void
  toggleTrunk: () => void
  toggleChargePort: () => void
  setChargeCable: (on: boolean) => void
  setChargeLimit: (v: number) => void
  setWindow: (d: DoorId, w: WindowState) => void
  setAllWindows: (w: WindowState) => void
  setHeadlights: (h: Headlights) => void
  setClimate: (p: Partial<ClimateState>) => void
  stepTemp: (who: 'driver' | 'passenger', delta: number) => void
  cycleSeatHeat: (who: 'driver' | 'passenger') => void
  set: (p: Partial<VehicleState>) => void
  apply: (p: Partial<VehicleState>) => void
}

const moving = (s: VehicleState) => s.speed > 0.5 || s.gear === 'D' || s.gear === 'R'

export const useVehicle = create<VehicleState & Actions>()(persist((set, get) => {
  const guardMoving = () => {
    if (!moving(get())) return false
    notify({ key: 'moving', level: 'warning', title: t('doorWhileDriving') })
    return true
  }
  return {
    ...initial,
    setBrand: (brand) => set({ brand }),
    setGear: (g) => {
      const s = get()
      if (g === s.gear) return
      if ((g === 'P' || (s.gear === 'D' && g === 'R') || (s.gear === 'R' && g === 'D')) && s.speed > 1) {
        notify({ key: 'gear', level: 'warning', title: L(`Chưa chuyển được sang ${g}`, `Cannot shift to ${g}`), body: L('Dừng hẳn xe trước khi chuyển số này', 'Stop the car before selecting this gear') })
        return
      }
      if (g !== 'P' && s.chargeCable) { notify({ key: 'gear', level: 'warning', title: t('cable'), body: L('Rút cáp sạc trước khi lái', 'Unplug before driving') }); return }
      if (g !== 'P' && Object.values(s.doors).some(Boolean)) notify({ key: 'doors', level: 'warning', title: t('doorWhileDriving') })
      if ((g === 'D' || g === 'R') && !s.driverSeatbelt) notify({ key: 'belt', level: 'warning', title: t('seatbelt') })
      set({ gear: g, parkingBrake: g === 'P', ...(g === 'D' || g === 'R' ? { isLocked: true } : {}) })
    },
    toggleLock: () => {
      const s = get()
      if (!s.isLocked && Object.values(s.doors).some(Boolean)) notify({ key: 'lock', level: 'warning', title: t('doors'), body: L('Có cửa đang mở', 'A door is open') })
      set({ isLocked: !s.isLocked })
      notify({ key: 'lock', level: 'info', title: !s.isLocked ? t('locked') : t('unlocked') })
    },
    toggleDoor: (d) => {
      const s = get()
      if (!s.doors[d] && guardMoving()) return
      const open = !s.doors[d]
      set({ doors: { ...s.doors, [d]: open }, ...(open ? { isLocked: false } : {}) })
      if (open) notify({ key: `door-${d}`, level: 'info', title: `${t(d)} ${L('đang mở', 'is open')}` })
      else useNotifications.getState().clearKey(`door-${d}`)
    },
    toggleFrunk: () => {
      const s = get()
      if (!s.frontTrunkOpen && guardMoving()) return
      set({ frontTrunkOpen: !s.frontTrunkOpen })
      notify({ key: 'frunk', level: 'info', title: `${t('frunk')}: ${!s.frontTrunkOpen ? t('open') : t('closed')}` })
    },
    toggleTrunk: () => {
      const s = get()
      if (!s.rearTrunkOpen && guardMoving()) return
      set({ rearTrunkOpen: !s.rearTrunkOpen })
      notify({ key: 'trunk', level: 'info', title: `${t('trunk')}: ${!s.rearTrunkOpen ? t('open') : t('closed')}` })
    },
    toggleChargePort: () => {
      const s = get()
      if (s.chargingPortOpen && s.chargeCable) { notify({ key: 'port', level: 'warning', title: t('chargePort'), body: t('unplug') }); return }
      if (!s.chargingPortOpen && guardMoving()) return
      set({ chargingPortOpen: !s.chargingPortOpen })
    },
    setChargeCable: (on) => {
      const s = get()
      if (on && (!s.chargingPortOpen || s.gear !== 'P')) { notify({ key: 'cable', level: 'warning', title: t('chargePort'), body: L('Mở cổng sạc và để xe ở số P', 'Open the port and shift to Park') }); return }
      set({ chargeCable: on })
      notify({ key: 'cable', level: 'info', title: on ? t('chargingNow') : t('unplug') })
    },
    setChargeLimit: (v) => set({ chargeLimit: clamp(Math.round(v), 50, 100) }),
    setWindow: (d, w) => set((s) => ({ windows: { ...s.windows, [d]: w } })),
    setAllWindows: (w) => set({ windows: { frontLeft: w, frontRight: w, rearLeft: w, rearRight: w } }),
    setHeadlights: (headlights) => set({ headlights }),
    setClimate: (p) => set((s) => ({ climate: { ...s.climate, ...p } })),
    stepTemp: (who, delta) => set((s) => {
      const c = s.climate
      const v = clamp(Math.round(((who === 'driver' ? c.driverTemperature : c.passengerTemperature) + delta) * 2) / 2, 15, 28)
      const next = who === 'driver' ? { driverTemperature: v, ...(c.sync ? { passengerTemperature: v } : {}) } : { passengerTemperature: v, ...(c.sync ? { driverTemperature: v } : {}) }
      return { climate: { ...c, ...next, enabled: true } }
    }),
    cycleSeatHeat: (who) => set((s) => {
      const key = who === 'driver' ? 'seatHeatDriver' : 'seatHeatPassenger'
      return { climate: { ...s.climate, [key]: (s.climate[key] + 1) % 4 } }
    }),
    set: (p) => set(p),
    apply: (p) => set(p),
  }
}, {
  name: 'cockpit-vehicle-v1',
  // persist preferences and comfort settings only; driving state always starts parked
  partialize: (s) => ({ brand: s.brand, climate: s.climate, chargeLimit: s.chargeLimit, headlights: s.headlights, steeringMode: s.steeringMode,
    accelerationMode: s.accelerationMode, regenLevel: s.regenLevel, childLock: s.childLock }),
}))


export const brandSpec = (b: Brand) => BRANDS[b]
