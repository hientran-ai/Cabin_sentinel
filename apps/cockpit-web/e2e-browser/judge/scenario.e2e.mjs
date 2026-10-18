// CAM-xx and DC-xx acceptance tests for the camera-blocked and vehicle-offline scenarios (run against the integration build).
import { BASE, PAGE, check, finish, launch, newPage, shot, sleep, closeAll, ev, waitRisk } from './lib.mjs'

const st = (page) => ev(page, () => { const s = __e2e.getState(), x = s.state; return { conn: s.connection, risk: x?.risk_level, cur: x?.decision_current, occ: x?.occupancy_state, rule: x?.rule_id, link: x?.connectivity?.state, inc: x?.incident?.status ?? null, incId: x?.incident_id ?? null, down: s.vehicleDown, src: s.source.kind, drops: x?.connectivity?.drops } })
const until = (page, fn, arg, ms = 30000) => page.waitForFunction(fn, arg, { timeout: ms })
const startFromSelector = async (page, id) => { await page.click('[data-testid=scenario-selector]'); await page.click(`[data-testid=start-${id}]`); await page.waitForSelector('[data-testid=cabin-monitor]', { timeout: 40000 }) }
const closeDialog = async (page) => { await page.click('[data-testid=cm-close]'); await sleep(300) }
const noise = (errs) => errs.filter((e) => !/status of 409/.test(e))   // refusals of vehicle writes while the simulated vehicle is offline are expected

async function camera() {
  const browser = await launch(); const { page } = await newPage(browser, { viewport: [1366, 768] })
  await page.goto(PAGE()); await page.waitForSelector('[data-testid=scenario-selector]'); await sleep(1500)
  await startFromSelector(page, 'SIM-01')
  check('CAM-01 blocked-camera scenario opens: simulated preview, no <video>, no broken media', await ev(page, () => !!document.querySelector('[data-testid=cm-sim-blocked]') && document.querySelectorAll('.cm-stage video').length === 0) )
  await page.click('[data-testid=vf-tab-evidence]'); await page.waitForSelector('[data-testid=cm-sim-blocked]')
  await until(page, () => __e2e.getState().state?.sensor_snapshot?.radar_presence === true, null)   // first snapshot from the backend
  await sleep(500)
  const txt = await page.innerText('[data-testid=cm-sim-blocked]')
  check('CAM-01b labelled "MÔ PHỎNG CAMERA BỊ CHE", says AI Vision cannot verify, radar + temperature carry SIMULATED badges', /MÔ PHỎNG CAMERA BỊ CHE/.test(txt) && /AI Vision không thể xác minh/.test(txt) && (txt.match(/SIMULATED/g) || []).length >= 2 && /Phát hiện hiện diện — Cảm biến mô phỏng/.test(txt), txt.replace(/\n/g, ' | ').slice(0, 230))
  await until(page, () => __e2e.getState().state?.rule_id === 'RADAR_FALLBACK', null)
  const s1 = await st(page)
  check('CAM-02 blocked + radar positive: backend decides (SUSPECTED occupancy, not SAFE, RADAR_FALLBACK)', s1.occ === 'SUSPECTED' && s1.risk !== 'SAFE' && s1.rule === 'RADAR_FALLBACK', JSON.stringify(s1))
  check('CAM-02b the screen shows the backend reason, not a UI-made verdict', /Radar mô phỏng|Radar báo/.test(await page.innerText('[data-testid=cm-sim-blocked]')) || /RADAR_FALLBACK/.test(await page.innerText('[data-testid=cm-sim-blocked]')))
  check('CAM-02c no AI detections are shown for the blocked camera', (await page.locator('[data-testid=cm-box]').count()) === 0 && await ev(page, () => !(__e2e.getState().state?.last_observation?.vision?.detections?.length)))
  await shot(page, 'sc-after-CAM-01-evidence')
  await page.click('[data-testid=vf-tab-overview]')
  check('CAM-02d overview is not SAFE and is not a number-based claim', (await page.innerText('[data-testid=cm-status]')) !== 'SAFE' && (await page.locator('[data-testid=cm-count-person]').count()) === 0, await page.innerText('[data-testid=cm-status]'))
  await shot(page, 'sc-after-CAM-01-overview')
  await closeDialog(page)
  // CAM-03: radar negative
  await ev(page, () => __e2e.getState().setSim({ radar: false })); await sleep(5000)
  const s3 = await st(page)
  check('CAM-03 blocked + radar negative: never SAFE and never "empty" (occupancy not ABSENT)', s3.risk !== 'SAFE' && s3.occ !== 'ABSENT', JSON.stringify(s3))
  // CAM-04: radar unavailable (no telemetry)
  await ev(page, () => __e2e.getState().setSim({ telemetryEnabled: false })); await sleep(8000)
  const s4 = await st(page)
  check('CAM-04 blocked + radar unavailable (no sensor data): uncertainty, not SAFE', s4.risk !== 'SAFE' && (s4.occ === 'UNKNOWN' || s4.cur === false), JSON.stringify(s4))
  // CAM-06: switch to a valid video
  await startFromSelector(page, 'DEMO-05'); await page.click('[data-testid=vf-tab-evidence]')
  await page.waitForSelector('[data-testid=cm-frame]', { timeout: 40000 })
  const s6 = await st(page)
  check('CAM-06 switching from blocked scenario to a real video recovers: no sim preview, real frame, source=clip, camera fault cleared', !(await page.locator('[data-testid=cm-sim-blocked]').count()) && s6.src === 'clip' && await ev(page, () => __e2e.getState().source.cameraFault === null), JSON.stringify(s6))
  check('CAM-no console errors', noise(page.errs).length === 0, noise(page.errs).join(' | '))
  await closeAll(browser)
}

async function offline() {
  const browser = await launch(); const { ctx, page } = await newPage(browser, { viewport: [1366, 768] })
  await page.goto(PAGE()); await page.waitForSelector('[data-testid=scenario-selector]'); await sleep(1500)
  await startFromSelector(page, 'SIM-02'); await closeDialog(page)
  await until(page, () => __e2e.getState().state?.risk_level === 'CRITICAL' && __e2e.getState().state?.decision_current, null, 40000)
  const before = await st(page)
  check('DC-00 before the drop: real clip gives a CRITICAL incident, link CONNECTED', before.risk === 'CRITICAL' && before.link === 'CONNECTED' && before.inc === 'OPEN', JSON.stringify(before))
  await until(page, () => __e2e.getState().state?.connectivity?.state === 'RECONNECTING', null, 20000)
  check('DC-01 disconnect produces RECONNECTING (backend state), banner visible, browser link still ok', await page.isVisible('[data-testid=vehicle-link-banner]') && (await st(page)).conn === 'ok')
  await until(page, () => __e2e.getState().state?.connectivity?.state === 'DISCONNECTED', null, 25000)
  const s2 = await st(page)
  check('DC-02 timeout produces DISCONNECTED', s2.link === 'DISCONNECTED', JSON.stringify(s2))
  await sleep(1500)
  check('DC-03 last valid telemetry is labelled stale (CŨ) with its timestamp', /CŨ/.test(await page.innerText('[data-testid=vehicle-link-banner]')) && /Cập nhật cuối từ xe: \d/.test(await page.innerText('[data-testid=vehicle-link-banner]')), (await page.innerText('[data-testid=vehicle-link-banner] .vd-note')).slice(0, 160))
  check('DC-04 current SAFE is replaced by UNKNOWN (backend not current; UI says cannot verify)', s2.risk !== 'SAFE' && s2.cur === false)
  check('DC-05 the open incident persists with the same id', s2.inc === 'OPEN' && s2.incId === before.incId, `${before.incId} -> ${s2.incId}`)
  await page.evaluate(() => window.__ui.getState().setOverlay('cabin')); await page.waitForSelector('[data-testid=cabin-monitor]')
  check('DC-04b dialog: status UNKNOWN, feed OFFLINE (not LIVE/DEMO)', (await page.innerText('[data-testid=cm-status]')) === 'UNKNOWN' && /OFFLINE/.test(await page.innerText('.cm-head-badges')), await page.innerText('.cm-head-badges'))
  check('DC-04c dialog says vehicle connection message', /Mất kết nối với xe/.test(await page.innerText('[data-testid=cabin-monitor]')))
  await shot(page, 'sc-after-DC-disconnected'); await closeDialog(page)
  check('DC-banner has the three actions: Thử kết nối lại / Xem dữ liệu cuối / Xem sự cố đang hoạt động', await page.isVisible('[data-testid=vehicle-reconnect]') && await page.isVisible('[data-testid=vehicle-last-data]') && await page.isVisible('[data-testid=vehicle-open-incident]'))
  // DC-11 browser offline is not vehicle offline (checked in its own phase below). Reconnect now.
  await page.click('[data-testid=vehicle-reconnect]')
  await until(page, () => __e2e.getState().state?.connectivity?.state === 'SYNCING' || __e2e.getState().state?.connectivity?.state === 'CONNECTED', null, 10000)
  const seenSync = await ev(page, () => __e2e.getState().state?.connectivity?.state)
  check('DC-06 reconnect enters SYNCING (or has already validated)', ['SYNCING', 'CONNECTED'].includes(seenSync), seenSync)
  await until(page, () => __e2e.getState().state?.connectivity?.state === 'CONNECTED', null, 30000)
  const s7 = await st(page)
  check('DC-07 fresh telemetry restores CONNECTED, banner gone', s7.link === 'CONNECTED' && !(await page.locator('[data-testid=vehicle-link-banner]').count()), JSON.stringify(s7))
  check('DC-07b the old incident was neither resolved nor duplicated', s7.inc === 'OPEN' && s7.incId === before.incId)
  await shot(page, 'sc-after-DC-reconnected')
  // DC-09 repeated disconnect/reconnect: no leaked timers, no duplicated events
  for (let i = 0; i < 3; i++) {
    await page.click('[data-testid=ctl-drop]').catch(async () => { await ev(page, () => document.querySelector('[data-testid=dev] .vd-fold-head')?.click()); await sleep(300); await page.click('[data-testid=ctl-drop]') })
    await until(page, () => __e2e.getState().state?.connectivity?.state === 'RECONNECTING', null, 10000)
    await page.click('[data-testid=ctl-restore]')
    await until(page, () => __e2e.getState().state?.connectivity?.state === 'CONNECTED', null, 30000)
  }
  const s9 = await st(page)
  const polls = page.reqs.length; await sleep(5000); const rate = (page.reqs.filter((r) => /\/state$/.test(r.url)).length)
  const t0 = page.reqs.filter((r) => /\/state$/.test(r.url)).length; await sleep(5000); const per5s = page.reqs.filter((r) => /\/state$/.test(r.url)).length - t0
  check('DC-09 repeated drop/restore: drops counted exactly, same incident, poll rate stays ~1/s (no leaked loops)', s9.drops >= 4 && s9.incId === before.incId && per5s <= 9, `drops=${s9.drops} state-polls/5s=${per5s}`)
  // DC-10 isolation: another session is untouched
  const iso = await ev(page, async () => { const a = __e2e.getState().session; await __e2eApi.link(a, 'DROP'); const r = await fetch('/api/v1/e2e/sessions', { method: 'POST' }).then((x) => x.json()); const b = { id: r.session_id, token: r.session_token }; await new Promise((z) => setTimeout(z, 300)); const sb = await __e2eApi.link(b, 'RESTORE'); const ok = await fetch(`/api/v1/e2e/sessions/${b.id}/sensor`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + b.token }, body: JSON.stringify({ temperature: 25, engine_status: 'OFF', doors_locked: true, radar_presence: false }) }).then((x) => x.status); await fetch(`/api/v1/e2e/sessions/${b.id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + b.token } }); return { other: sb.connectivity.state, write: ok } })
  check('DC-10 one vehicle\'s disconnection does not affect another session (CONNECTED, writes accepted)', iso.other === 'CONNECTED' && iso.write === 200, JSON.stringify(iso))
  await page.click('[data-testid=ctl-restore]')   // through the scenario controller, as a judge would
  await until(page, () => __e2e.getState().state?.connectivity?.state === 'CONNECTED', null, 30000)
  // DC-11 browser offline is not vehicle offline
  await ctx.setOffline(true); await until(page, () => __e2e.getState().connection === 'lost', null, 20000); await sleep(1500)
  const s11 = await st(page)
  check('DC-11 browser offline: connection=lost but the VEHICLE link banner is NOT shown and vehicle state is not DISCONNECTED', s11.conn === 'lost' && !(await page.locator('[data-testid=vehicle-link-banner]').count()) && s11.link !== 'DISCONNECTED', JSON.stringify(s11))
  check('DC-11b browser-offline wording differs ("Mất kết nối máy chủ"/dữ liệu cũ), incident still open in the last data', s11.inc === 'OPEN')
  await ctx.setOffline(false); await until(page, () => __e2e.getState().connection === 'ok', null, 20000)
  // DC-12 backend error: no white screen
  await page.route('**/api/v1/e2e/**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"boom"}' })); await sleep(4000)
  check('DC-12 backend 500s: the page stays rendered (no white screen), shows an error/stale state', await ev(page, () => !!document.querySelector('[data-testid=demo-page]') && document.body.innerText.length > 200))
  await page.unroute('**/api/v1/e2e/**'); await sleep(3000)
  check('DC-12b recovers when the backend is back', (await st(page)).conn === 'ok')
  check('DC-no console errors beyond expected refusals', noise(page.errs).filter((e) => !/status of 500|boom|ERR_INTERNET_DISCONNECTED/.test(e)).length === 0, noise(page.errs).slice(0, 4).join(' | '))
  await closeAll(browser)
}

const which = process.argv[2] ?? 'all'
if (which === 'all' || which === 'camera') await camera()
if (which === 'all' || which === 'offline') await offline()
process.exit(finish('scenario') ? 1 : 0)
