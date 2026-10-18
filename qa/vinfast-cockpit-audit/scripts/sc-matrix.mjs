// CS-01..CS-15 matrix: each scenario in a fresh browser context + fresh backend session. Inputs only; risk comes from the backend.
import { open, watch, sleep } from './lib.mjs'
const only = process.argv[2]
const fold = async (h) => { if (!(await h.page.$('[data-testid=sim-env].open'))) await h.page.click('[data-testid=sim-env] .vd-fold-head') }
const chip = async (h, text) => { await fold(h); await h.page.locator('[data-testid=sim-env] button', { hasText: text }).first().click() }
const alarm = (x) => x.risk === 'WARNING' || x.risk === 'CRITICAL'
const S = {
  'CS01-empty': async (h) => { await h.page.click('[data-testid=sc-empty]'); return watch(h, 25, (x) => x.dets === '' && x.current && x.rev > 4) },
  'CS-blocked': async (h) => { await h.page.click('[data-testid=sc-blocked]'); return watch(h, 20, (x) => x.cam === 'BLOCKED' && x.rev > 4) },
  'CS15-lost-sim': async (h) => { await h.page.click('[data-testid=sc-lost]'); const a = await watch(h, 12, alarm, 'pre-cut'); const b = await watch(h, 16, () => false, 'cut'); await h.shot('cut'); const c = await watch(h, 15, (x) => x.conn === 'ok' && alarm(x), 'recover'); return [...a, ...b, ...c] },
  'CS06-rear-child': async (h) => { await h.page.evaluate(() => { window.__vehicle.getState().set({ cabinTemperature: 40, isLocked: true, climate: { ...window.__vehicle.getState().climate, enabled: false } }) }); await chip(h, 'Trẻ ngồi ghế an toàn quay lưng'); return watch(h, 30, () => false) },
  'CS07-blocked-radar': async (h) => { await h.page.evaluate(() => window.__vehicle.getState().set({ cabinTemperature: 40, isLocked: true })); await chip(h, 'Radar báo có người'); await chip(h, 'Bị che'); return watch(h, 20, () => false) },
  'CS08-radar-vs-vision': async (h) => { await h.page.evaluate(() => window.__vehicle.getState().set({ cabinTemperature: 40, isLocked: true })); await chip(h, 'Radar báo có người'); await chip(h, 'Cabin trống'); return watch(h, 25, () => false) },
  'CS09-stale': async (h) => { await chip(h, 'Cabin trống'); const a = await watch(h, 12, (x) => x.current && x.rev > 4, 'fresh'); await chip(h, 'Dừng nguồn hình'); const b = await watch(h, 45, (x) => x.vis === 'STALE' && x.current === false, 'stopped'); await sleep(2000); return [...a, ...b, ...(await watch(h, 2, () => false, 'stale'))] },
  'CS14-driving': async (h) => { await h.page.click('[data-testid=sc-child-hot]'); const a = await watch(h, 15, alarm, 'parked'); await chip(h, 'Động cơ bật'); await chip(h, 'Có tài xế'); await h.page.locator('[data-testid=sim-env] button', { hasText: /^D$/ }).click(); await h.page.evaluate(() => window.__vehicle.getState().set({ speedOverride: 40, parkingBrake: false })); const b = await watch(h, 15, () => false, 'driving'); await h.page.click('[data-testid=vf-map] .vf-search'); await sleep(800); await h.shot('driving-search'); const txt = await h.page.locator('.vf-search-sheet').innerText().catch(() => 'no sheet'); return [...a, ...b, { label: 'search-sheet', note: txt.slice(0, 200) }] },
  'CS10-msg-fault': async (h) => { await chip(h, 'Bộ gửi lỗi'); await sleep(1500); await h.page.click('[data-testid=sc-child-hot]'); const a = await watch(h, 20, (x) => alarm(x) && x.push, 'alarm'); await sleep(3000); const b = await watch(h, 2, () => false, 'after'); await h.page.click('[data-testid=evidence] .vd-fold-head'); await h.shot('evidence-open', true); return [...a, ...b] },
  'CS15-offline-real': async (h) => { await h.page.click('[data-testid=sc-child-hot]'); const a = await watch(h, 15, alarm, 'alarm'); await h.ctx.setOffline(true); const b = await watch(h, 12, () => false, 'offline'); await h.shot('offline'); await h.ctx.setOffline(false); const c = await watch(h, 15, (x) => x.conn === 'ok' && alarm(x), 'online'); return [...a, ...b, ...c] },
}
Object.assign(S, {
  'CS06b-rear-child-hot': async (h) => { await h.page.click('[data-testid=sc-child-hot]'); const a = await watch(h, 12, alarm, 'front-child'); await chip(h, 'Trẻ ngồi ghế an toàn quay lưng'); const b = await watch(h, 40, () => false, 'rear-child'); await h.shot('rear-child', true); return [...a, ...b] },
  'CS06c-rear-child-fresh': async (h) => { await h.page.evaluate(() => window.__vehicle.getState().set({ heatScale: 1 })); await h.page.click('[data-testid=sc-child-hot]'); await sleep(300); await chip(h, 'Trẻ ngồi ghế an toàn quay lưng'); const b = await watch(h, 30, () => false, 'rear-child-only'); await h.shot('rear-child-only', true); return b },
  'CS07b-blocked-radar-long': async (h) => { await h.page.click('[data-testid=sc-blocked]'); await chip(h, 'Radar báo có người'); const b = await watch(h, 60, () => false, 'blocked+radar'); await h.shot('blocked-radar', true); return b },
  'CS09b-stale-phone': async (h) => { await chip(h, 'Cabin trống'); const a = await watch(h, 15, (x) => x.current && x.rev > 4 && /BÌNH THƯỜNG/.test(x.phone ?? ''), 'fresh'); await chip(h, 'Dừng nguồn hình'); const b = await watch(h, 30, () => false, 'stopped'); await h.shot('stale-phone', true); return [...a, ...b] },
})
const results = {}
for (const [name, fn] of Object.entries(S)) {
  if (only && !name.startsWith(only)) continue
  const h = await open({ out: `evidence/matrix/${name}` })
  let tl = []
  try { tl = await fn(h); await h.shot('final'); } catch (e) { tl.push({ error: String(e).slice(0, 300) }); await h.shot('error').catch(() => {}) }
  h.save('timeline.json', tl); h.save('console.json', h.log); h.save('net.json', h.net)
  const last = tl.filter((x) => x.rev !== undefined).at(-1) ?? {}
  results[name] = { last, labels: [...new Set(tl.map((x) => `${x.label}:${x.risk}/${x.rule}/${x.occ}/${x.current}/${x.conn}`))], error: tl.find((x) => x.error)?.error, note: tl.find((x) => x.note)?.note }
  console.log('\n##', name); for (const x of tl) if (x.rev !== undefined) console.log(x.t, x.label, x.rev, x.risk, x.rule, x.occ, 'cur=' + x.current, x.cam, x.conn, x.incident, x.dets, x.vis, x.sen, x.temp, x.push, '|', x.flow.replace(/:[^ ]+( [^ ]+)*/g, (m) => m[0]) , '|', x.tile, '|', (x.prompt || '').slice(0, 70), '|', (x.phone || '').slice(40, 160))
  if (tl.find((x) => x.error || x.note)) console.log(tl.filter((x) => x.error || x.note))
  await h.b.close()
}
import { writeFileSync } from 'node:fs'
writeFileSync(`evidence/matrix/summary${only ? '-' + only : ''}.json`, JSON.stringify(results, null, 1))
