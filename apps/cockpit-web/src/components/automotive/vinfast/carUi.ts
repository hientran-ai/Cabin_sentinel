import { create } from 'zustand'

/** Door / closure state of one vehicle component. Closed = neutral, open = amber, fault = red, unknown = muted. */
export type PartState = 'closed' | 'open' | 'fault' | 'unknown'
export const partState = (open: boolean | undefined | null, fault = false): PartState => (fault ? 'fault' : open == null ? 'unknown' : open ? 'open' : 'closed')
export const PART_TEXT: Record<PartState, string> = { closed: 'Đóng', open: 'Mở', fault: 'Lỗi', unknown: 'Chưa rõ' }

export type CarMode = 'camping' | 'baby' | 'pet' | 'wash'
export const MODES: { id: CarMode; label: string }[] = [{ id: 'camping', label: 'Cắm trại' }, { id: 'baby', label: 'Chế độ bé' }, { id: 'pet', label: 'Thú cưng' }, { id: 'wash', label: 'Rửa xe' }]

/** Car Wash may only start when nothing is open. Returns the blocking parts (empty = allowed). */
export function washBlockers(v: { windows: Record<string, string>; doors: Record<string, boolean>; chargingPortOpen: boolean; frontTrunkOpen: boolean; rearTrunkOpen: boolean }): string[] {
  const out: string[] = []
  if (Object.values(v.doors).some(Boolean)) out.push('Cửa đang mở')
  if (Object.values(v.windows).some((w) => w !== 'closed')) out.push('Cửa sổ chưa đóng')
  if (v.chargingPortOpen) out.push('Cổng sạc đang mở')
  if (v.frontTrunkOpen || v.rearTrunkOpen) out.push('Cốp đang mở')
  return out
}

/** UI-only state of the car shell (not persisted): hazard lights, selected car mode, simulated pet / wash switches. */
export type PetKind = 'dog' | 'cat'
/** adultMusic / childMusic are the comfort-audio sources sent to Cabin Care; petName and petKind only dress the simulated parked-car screen. */
interface CarUi { page: 0 | 1; hazard: boolean; selected: CarMode; petOn: boolean; washOn: boolean; campSim: boolean; babySim: boolean; petName: string; petKind: PetKind; adultMusic: string; childMusic: string; set: (p: Partial<Omit<CarUi, 'set'>>) => void }
export const useCarUi = create<CarUi>((set) => ({ page: 0, hazard: false, selected: 'camping', petOn: false, washOn: false, campSim: false, babySim: false, petName: 'Bông', petKind: 'dog', adultMusic: 'off', childMusic: 'off', set: (p) => set(p) }))
