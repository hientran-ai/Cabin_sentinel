import { open, sleep } from './lib.mjs'
const h = await open({ out: 'evidence/upload-timing' }); const P = h.page
await P.evaluate(() => { const v = window.__vehicle.getState(); v.set({ cabinTemperature: 40, isLocked: true, climate: { ...v.climate, enabled: false } }) })
await sleep(3000)
await P.click('[data-testid=sim-env] .vd-fold-head')
await P.setInputFiles('[data-testid=still-input]', 'fixtures/child.png')
const tl = []
for (let i = 0; i < 24; i++) { const s = await h.snap(); tl.push(s); console.log((i / 2).toFixed(1) + 's', s.rev, s.risk, s.rule, s.occ, 'cur=' + s.current, s.vis, s.incident, 'notes=' + s.notes, '|', s.tile); if (i === 3) await h.shot('upload-1.5s'); await sleep(500) }
h.save('timeline.json', tl); await h.shot('upload-end'); await h.b.close()
