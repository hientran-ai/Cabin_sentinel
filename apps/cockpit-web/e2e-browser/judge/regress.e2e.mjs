// Regression on the integration build: three care modes, eight videos, mobile, and the "Gửi lại xác nhận" fix.
import { PAGE, check, finish, launch, newPage, shot, sleep, closeAll, ev, clickable, noHScroll } from './lib.mjs'
const until = (page, fn, arg, ms = 40000) => page.waitForFunction(fn, arg, { timeout: ms })
const startFromSelector = async (page, id) => { await page.click('[data-testid=scenario-selector]'); await page.click(`[data-testid=start-${id}]`); await page.waitForSelector('[data-testid=cabin-monitor]', { timeout: 40000 }) }
const closeDialog = async (page) => { await page.click('[data-testid=cm-close]').catch(() => undefined); await sleep(400) }
const present = (page, sel) => page.locator(sel).count().then((n) => n > 0)
const noise = (e) => e.filter((x) => !/status of 409|status of 5\d\d/.test(x))

async function modes() {
  const browser = await launch(); const { page } = await newPage(browser, { viewport: [1920, 1080] })
  await page.goto(PAGE()); await page.waitForSelector('[data-testid=scenario-selector]'); await sleep(1500)
  await startFromSelector(page, 'DEMO-05'); await closeDialog(page)
  await until(page, () => __e2e.getState().state?.care?.can_start)   // the 10 s clip ends on its own; the incident stays open
  for (const [id, sw, profile] of [['camping', 'Chế độ cắm trại', 'ADULT'], ['baby', 'Dỗ bé', 'CHILD'], ['pet', 'Chế độ thú cưng', 'PET']]) {
    const t = `mode ${id}`
    await page.evaluate(() => window.__ui.getState().setOverlay('carmode')); await page.waitForSelector('[data-testid=vf-carmode]')
    await page.evaluate((m) => document.querySelector(`.vf-modecard[data-mode=${m}]`).click(), id); await sleep(300)
    await page.evaluate((l) => document.querySelector(`[role=switch][aria-label="${l}"]`).click(), sw)
    await until(page, () => __e2e.getState().state?.care?.status === 'ACTIVE', null, 15000)
    await page.waitForSelector('[data-testid=vf-care]', { state: 'attached' })
    check(`${t}: enters, care screen shows profile ${profile}`, (await ev(page, () => __e2e.getState().state.care.profile)) === profile && await page.isVisible('[data-testid=vf-care]'))
    check(`${t}: exit buttons present`, await page.isVisible('[data-testid=care-home]') && await page.isVisible('[data-testid=care-stop]'))
    await page.click('[data-testid=care-home]')
    check(`${t}: Về màn hình chính leaves, mode keeps running, chip shown`, !(await present(page, '[data-testid=vf-care]')) && await page.isVisible('[data-testid=vf-care-chip]') && (await ev(page, () => __e2e.getState().state.care.status)) === 'ACTIVE')
    await page.click('[data-testid=vf-care-chip]'); await page.keyboard.press('Escape')
    check(`${t}: Esc leaves`, !(await present(page, '[data-testid=vf-care]')))
    await page.click('[data-testid=vf-care-chip]'); await page.waitForSelector('[data-testid=vf-care]'); await page.goBack(); await sleep(500)
    check(`${t}: browser Back leaves and stays on the page`, !(await present(page, '[data-testid=vf-care]')) && page.url().includes('/cockpit/vinfast'))
    await page.click('[data-testid=vf-care-chip]'); await page.waitForSelector('[data-testid=vf-care]'); await page.click('[data-testid=care-stop]')
    await until(page, () => __e2e.getState().state?.care?.status !== 'ACTIVE', null, 15000); await sleep(500)
    check(`${t}: Tắt chế độ ends it, no screen, no chip`, !(await present(page, '[data-testid=vf-care]')) && !(await present(page, '[data-testid=vf-care-chip]')))
    await page.evaluate(() => document.querySelector('.vf-panel .vf-close')?.click()); await sleep(500)
  }
  check('modes: no console errors', noise(page.errs).length === 0, noise(page.errs).slice(0, 3).join(' | '))
  await closeAll(browser)
}

async function videos() {
  const browser = await launch(); const { page } = await newPage(browser, { viewport: [1366, 768] })
  await page.goto(PAGE()); await page.waitForSelector('[data-testid=scenario-selector]'); await sleep(1500)
  for (let i = 1; i <= 8; i++) {
    const id = `DEMO-0${i}`
    await startFromSelector(page, id)
    const ok = await until(page, () => __e2e.getState().metrics.accepted >= 2 || ['UNSUPPORTED_CODEC', 'SOURCE_UNAVAILABLE', 'ERROR'].includes(__e2e.getState().source.playerPhase), null, 45000).then(() => true).catch(() => false)
    const r = await ev(page, () => { const s = __e2e.getState(), x = s.state; return { acc: s.metrics.accepted, phase: s.source.playerPhase, risk: x?.risk_level, rule: x?.rule_id, occ: x?.occupancy_state, det: (x?.last_observation?.vision?.detections ?? []).map((d) => d.class).join(',') } })
    check(`${id}: starts, plays, >= 2 frames analysed by the real model`, ok && r.acc >= 2, JSON.stringify(r))
    await closeDialog(page)
  }
  check('videos: no console errors', noise(page.errs).length === 0, noise(page.errs).slice(0, 3).join(' | '))
  await closeAll(browser)
}

async function mobile() {
  const browser = await launch()
  for (const [name, w, h] of [['iphone-390x844', 390, 844], ['iphone-se-375x812', 375, 812], ['ipad-768x1024', 768, 1024]]) {
    const { page } = await newPage(browser, { viewport: [w, h], mobile: true })
    await page.goto(PAGE()); await page.waitForSelector('[data-testid=scenario-selector]'); await sleep(1500)
    check(`[${name}] home: no horizontal overflow`, await noHScroll(page), `scrollWidth ${await ev(page, () => document.documentElement.scrollWidth)}`)
    await shot(page, `reg-${name}-home`)
    await startFromSelector(page, 'DEMO-05')
    const g = await ev(page, () => { const d = document.querySelector('[data-testid=cabin-monitor]').getBoundingClientRect(), c = document.querySelector('[data-testid=cm-close]').getBoundingClientRect(); return { fits: d.left >= -1 && d.right <= innerWidth + 1 && d.bottom <= innerHeight + 1, close: c.width >= 44 && c.right <= innerWidth, hs: document.documentElement.scrollWidth <= innerWidth + 1 } })
    check(`[${name}] cabin dialog fits, close button usable, no overflow`, g.fits && g.close && g.hs, JSON.stringify(g))
    await shot(page, `reg-${name}-dialog`)
    await closeDialog(page)
    check(`[${name}] after close, the page is clickable`, await clickable(page, '[data-testid=scenario-selector]'))
    await page.context().close()
  }
  await closeAll(browser)
}

async function confirmFix() {
  const browser = await launch(); const { page } = await newPage(browser, { viewport: [1366, 900] })
  await page.goto(PAGE()); await page.waitForSelector('[data-testid=scenario-selector]'); await sleep(1500)
  await startFromSelector(page, 'DEMO-05'); await closeDialog(page)
  await until(page, () => __e2e.getState().state?.incident_id)
  const f = page.frameLocator('iframe').first()
  await f.locator('a[href^="#/incident"], .verdict, [href*="incident"]').first().click({ timeout: 15000 }).catch(() => undefined)
  const id = await ev(page, () => __e2e.getState().state.incident_id)
  await page.evaluate((i) => { document.querySelector('iframe').contentWindow.location.hash = `#/incident/${i}` }, id); await sleep(1500)
  const boxes = f.locator('input[type=checkbox]'); await boxes.first().waitFor({ timeout: 15000 })
  for (let i = 0; i < 3; i++) await boxes.nth(i).check()
  // a new revision appears after the person opened the screen (state changes: lock toggled in the simulator)
  await ev(page, () => { const v = __vehicle.getState(); v.set({ cabinTemperature: v.cabinTemperature + 1 }) }); await sleep(100)
  await ev(page, () => __e2e.getState().setSim({ driverPresent: true })); await sleep(3500)
  const rev0 = await ev(page, () => __e2e.getState().state.revision)
  await f.getByRole('button', { name: /Gửi xác nhận/ }).click(); await sleep(1500)
  const rejected = await f.getByText(/Sự cố đã thay đổi|Dữ liệu đã cũ|Cần kiểm tra|Vẫn phát hiện|chưa nhìn được|chưa thống nhất/).first().isVisible().catch(() => false)
  const cleared = (await f.locator('input[type=checkbox]:checked').count()) === 0
  const resendDisabled = await f.getByRole('button', { name: /Gửi lại xác nhận/ }).isDisabled().catch(() => null)
  const state = await ev(page, () => __e2e.getState().state.incident.status)
  check('resend: a rejected confirmation shows a reason, keeps the incident OPEN', rejected && state === 'OPEN', `rejected=${rejected} incident=${state} rev=${rev0}`)
  check('resend: after a "changed/stale" rejection the ticks are cleared and "Gửi lại xác nhận" is DISABLED until the person looks again', cleared && resendDisabled === true, `cleared=${cleared} disabled=${resendDisabled}`)
  await shot(page, 'reg-resend')
  await closeAll(browser)
}

const w = process.argv[2] ?? 'all'
if (w === 'all' || w === 'modes') await modes()
if (w === 'all' || w === 'videos') await videos()
if (w === 'all' || w === 'mobile') await mobile()
if (w === 'all' || w === 'resend') await confirmFix()
process.exit(finish('regress') ? 1 : 0)
