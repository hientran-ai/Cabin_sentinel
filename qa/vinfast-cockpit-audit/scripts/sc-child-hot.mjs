// CS-03/05 child in hot parked car, CS-11 acknowledge, CS-12 escalation, resolve attempts, CS-13 new incident after resolution.
import { open, watch, sleep } from './lib.mjs'
const h = await open({ out: 'evidence/sc-child-hot' })
const tl = []
let summary = {}
try {
tl.push(...await watch(h, 3, () => false, 'baseline'))
await h.page.click('[data-testid=sc-child-hot]')
const t1 = Date.now()
tl.push(...await watch(h, 45, (x) => x.risk === 'WARNING' || x.risk === 'CRITICAL', 'child-hot'))
const alarmAfterS = (Date.now() - t1) / 1000
await sleep(2500); tl.push(...await watch(h, 1, () => false, 'alarm'))
await h.shot('01-alarm-viewport'); await h.shot('01-alarm-full', true)
// phone: home should show "Xử lý ngay" / "Đã xem"
const ph = h.phone()
await ph.waitForSelector('text=Đã xem', { timeout: 15000 }).catch(() => {})
const phoneBtns = await ph.evaluate(() => [...document.querySelectorAll('button,a')].map((b) => `${b.tagName}:${b.textContent.trim()}:${b.getAttribute('href') ?? ''}`))
h.save('phone-buttons-alarm.json', phoneBtns)
const tel = await ph.evaluate(() => [...document.querySelectorAll('a[href^="tel:"]')].map((a) => a.getAttribute('href')))
// acknowledge from phone home
summary.phoneBtns = phoneBtns; summary.phoneText = await ph.evaluate(() => document.body.innerText.slice(0, 900))
await ph.click('button:has-text("Đã xem")', { timeout: 8000 })
tl.push(...await watch(h, 8, (x) => x.incident?.includes(':ACK'), 'ack'))
await h.shot('02-after-ack', true)
// keep the alarm running ~30 s more to see repeat/escalation policy
tl.push(...await watch(h, 30, () => false, 'persist'))
// open incident and try to resolve while child still visible -> expect rejection
await ph.click('a:has-text("Xử lý ngay")').catch(async () => { const id = (await h.page.evaluate(() => window.__e2e.getState().state.incident_id)); await ph.evaluate((i) => { location.hash = '#/incident/' + i }, id) })
await ph.waitForSelector('input[type=checkbox]', { timeout: 10000 })
const sendDisabledBefore = await ph.evaluate(() => document.querySelector('.needs-checks')?.disabled)
for (const c of await ph.$$('input[type=checkbox]')) await c.check()
const sendDisabledAfter = await ph.evaluate(() => document.querySelector('.needs-checks')?.disabled)
await ph.click('.needs-checks')
await sleep(3000)
const reject1 = await ph.evaluate(() => document.querySelector('[role=alert]')?.innerText ?? document.body.innerText.slice(0, 400))
await h.shot('03-resolve-rejected', true)
tl.push(...await watch(h, 2, () => false, 'resolve-rejected'))
// switch the source to the empty-cabin clip and cool the car, then resolve again
await h.page.evaluate(async () => { const v = window.__vehicle.getState(); v.set({ cabinTemperature: 24 }) })
await h.page.click('[data-testid=sim-env] .vd-fold-head')
await h.page.click('.vd-chipbtn:has-text("Cabin trống")')
tl.push(...await watch(h, 25, (x) => x.dets === '' && x.vis === 'FRESH' && x.current, 'empty-clip'))
await sleep(2000)
let resolved = null
for (let i = 0; i < 3 && !resolved; i++) {
  await ph.click('.needs-checks').catch(() => {})
  await sleep(3500)
  resolved = await ph.evaluate(() => document.body.innerText.includes('Đã đóng sự cố') ? document.body.innerText.slice(0, 300) : null)
}
tl.push(...await watch(h, 3, () => false, 'after-resolve'))
await h.shot('04-after-resolve', true)
// CS-13: new dangerous event after resolution
await h.page.click('[data-testid=sc-child-hot]')
tl.push(...await watch(h, 45, (x) => (x.risk === 'WARNING' || x.risk === 'CRITICAL') && x.incident && !x.incident.includes('RESOLVED'), 'second-incident'))
await h.shot('05-second-incident', true)
Object.assign(summary, { alarmAfterS, tel, sendDisabledBefore, sendDisabledAfter, reject1, resolved })
} catch (e) { summary.error = String(e).slice(0, 400); await h.shot('zz-error', true) } finally {
summary.incidents = [...new Set(tl.map((x) => x.incident).filter(Boolean))]
h.save('timeline.json', tl); h.save('console.json', h.log); h.save('net.json', h.net); h.save('summary.json', summary) }
for (const x of tl) console.log(x.t, x.label, x.rev, x.risk, x.rule, x.occ, x.current, x.cam, x.incident, x.alert, x.dets, x.vis, x.temp, 'n=' + x.notes, x.push, x.feed, '|', x.flow, '|', x.tile, '|', x.prompt.slice(0, 60))
console.log(JSON.stringify(summary, null, 1))
await h.b.close()
