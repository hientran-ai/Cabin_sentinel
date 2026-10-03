export type View = 'owner' | 'fleet' | 'guardian'

/** In-page anchors (#live-cabin, #events, …) all belong to the owner dashboard. */
export function viewFromHash(hash: string): View {
  return hash.startsWith('#fleet') ? 'fleet' : hash.startsWith('#guardian') ? 'guardian' : 'owner'
}
