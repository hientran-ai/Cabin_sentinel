// CS-06 / SR-01: rear-facing child in a hot, locked, parked car, fresh session, no earlier detection.
import { open, watch, sleep } from './lib.mjs'
const h = await open({ out: 'evidence/matrix/CS06d-rear-child-hot-fresh' }); const P = h.page
await P.click('[data-testid=sim-env] .vd-fold-head')
await P.locator('[data-testid=sim-env] input[aria-label="Nhiệt độ trong xe giả lập"]').fill('40')
if (!(await P.evaluate(() => window.__vehicle.getState().isLocked))) await P.locator('[data-testid=sim-env] button', { hasText: 'Cửa khoá' }).click()
if (await P.evaluate(() => window.__vehicle.getState().climate.enabled)) await P.locator('[data-testid=sim-env] button', { hasText: 'Điều hoà bật' }).click()
await sleep(2500)
await P.locator('[data-testid=sim-env] button', { hasText: 'Trẻ ngồi ghế an toàn quay lưng' }).click()
const tl = await watch(h, 30, () => false, 'rear-hot')
for (const x of tl) console.log(x.t, x.rev, x.risk, x.rule, x.occ, 'cur=' + x.current, x.incident, 'dets=' + x.dets, x.temp, 'locked?', '| ' + x.tile, '| ' + (x.phone ?? '').slice(30, 120))
await h.shot('rear-hot', true); h.save('timeline.json', tl); await h.b.close()
