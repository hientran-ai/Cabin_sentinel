/** "blue" = layout and colours measured from the real blue display photos (reference-crops/measured-lines.json); "aurora" = the Aurora A06 layout.
 *  Selected by ?skin=aurora|blue, default blue. Same stores and read model either way. */
export type Skin = 'blue' | 'aurora'
export const SKIN: Skin = typeof location !== 'undefined' && new URLSearchParams(location.search).get('skin') === 'aurora' ? 'aurora' : 'blue'
/** Map rectangle (canvas px) at home and when expanded. */
export const MAP_RECT = {
  aurora: { home: { left: 608, top: 88, width: 632, height: 856 }, open: { left: 608, top: 88, width: 1288, height: 856 } },
  blue: { home: { left: 640, top: 100, width: 605, height: 840 }, open: { left: 640, top: 100, width: 1250, height: 840 } },
} as const
