// Cabin Monitoring adapter boundary. The dashboard only renders snapshots; it never runs or fakes inference.
// MockCabinAdapter emits clearly labelled SIMULATED snapshots chosen in the developer panel. A real adapter
// (CabinSentinel edge device or backend) implements the same interface later.

export type CabinRisk = 'SAFE' | 'WARNING' | 'CRITICAL' | 'UNKNOWN'
export type OccupantKind = 'adult' | 'child' | 'pet'

export interface CabinSnapshot {
  risk: CabinRisk
  occupants: { kind: OccupantKind; seat: string }[]
  /** true only with positive evidence (empty-cabin reference matched); nothing detected is NOT empty (SR-01) */
  verifiedEmpty: boolean
  temperatureC: number | null
  updatedAt: number
  source: 'simulation' | 'device'
  reason: string
}

export interface CabinMonitorAdapter {
  readonly id: string
  readonly simulated: boolean
  subscribe(listener: (s: CabinSnapshot) => void): () => void
}

export type MockScenario = 'driving_adult' | 'child_alone' | 'pet_alone' | 'nothing' | 'verified_empty' | 'offline'

export const MOCK_SCENARIOS: Record<MockScenario, { vi: string; en: string }> = {
  driving_adult: { vi: 'Người lớn ở ghế lái', en: 'Adult in driver seat' },
  child_alone: { vi: 'Trẻ em một mình ở ghế sau', en: 'Child alone in rear seat' },
  pet_alone: { vi: 'Thú cưng một mình', en: 'Pet alone' },
  nothing: { vi: 'Không phát hiện ai', en: 'Nothing detected' },
  verified_empty: { vi: 'Xe trống, đã khớp ảnh tham chiếu', en: 'Empty, reference matched' },
  offline: { vi: 'Mất tín hiệu thiết bị', en: 'Device offline' },
}

/** Risk for a scenario; heat and a locked car raise it, as the CabinSentinel rules would. */
export function mockSnapshot(s: MockScenario, ctx: { locked: boolean; cabinTemperature: number; now: number }): CabinSnapshot {
  const base = { updatedAt: ctx.now, source: 'simulation' as const, temperatureC: ctx.cabinTemperature, verifiedEmpty: false }
  const hot = ctx.cabinTemperature >= 30
  switch (s) {
    case 'driving_adult': return { ...base, risk: 'SAFE', occupants: [{ kind: 'adult', seat: 'driver' }], reason: 'Có người lớn trong xe' }
    case 'child_alone': return { ...base, risk: ctx.locked && hot ? 'CRITICAL' : 'WARNING', occupants: [{ kind: 'child', seat: 'rear_right' }], reason: ctx.locked ? 'Trẻ em trong xe đã khoá' : 'Có trẻ em ở ghế sau' }
    case 'pet_alone': return { ...base, risk: hot ? 'CRITICAL' : 'WARNING', occupants: [{ kind: 'pet', seat: 'rear_left' }], reason: 'Thú cưng trong xe' }
    case 'nothing': return { ...base, risk: 'UNKNOWN', occupants: [], reason: 'Không phát hiện gì, chưa xác nhận xe trống' }
    case 'verified_empty': return { ...base, risk: 'SAFE', occupants: [], verifiedEmpty: true, reason: 'Ghế khớp ảnh xe trống đã được người xác nhận' }
    case 'offline': return { ...base, risk: 'UNKNOWN', occupants: [], temperatureC: null, reason: 'Không có dữ liệu mới từ thiết bị' }
  }
}

export class MockCabinAdapter implements CabinMonitorAdapter {
  readonly id = 'mock'
  readonly simulated = true
  private listeners = new Set<(s: CabinSnapshot) => void>()
  private last: CabinSnapshot | null = null
  publish(s: CabinSnapshot) { this.last = s; this.listeners.forEach((l) => l(s)) }
  subscribe(listener: (s: CabinSnapshot) => void) {
    this.listeners.add(listener)
    if (this.last) listener(this.last)
    return () => { this.listeners.delete(listener) }
  }
}
export const cabinAdapter = new MockCabinAdapter()
