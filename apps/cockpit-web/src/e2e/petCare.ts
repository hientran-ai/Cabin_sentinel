// "Có thú cưng trong xe" on the owner phone: declare the PET profile, then start the pet comfort plan. Declaring only records what the
// owner says; it never lowers the risk level or closes the incident (the backend enforces that), so this stays a comfort action.
import { api } from './api'
import { useE2e } from './store'
import type { CareProfile, CareView } from './types'

export const petCareAvailable = (care?: CareView): boolean => !!care && care.can_start && care.status !== 'ACTIVE'

// Used by the pet chip and by the named modes ("Đón bé", "Cắm trại"...). Only the profile kind and a music id go to the backend;
// names, ages, photos and schedules stay on the phone. Music is ignored for PET (no sound for animals).
export const startCareProfile = (profile: CareProfile, music?: string) => useE2e.getState().care(async (s) => {
  await api.careDeclare(s, profile, 'PHONE')
  await api.careStart(s, { profile, music: profile === 'PET' ? undefined : music }, 'PHONE')
}, profile === 'PET' ? 'Đã bật chế độ thú cưng. Mức cảnh báo không đổi.' : 'Đã bật chế độ chăm sóc. Mức cảnh báo không đổi.')

export const startPetCare = () => startCareProfile('PET')
