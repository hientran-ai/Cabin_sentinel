// Navigation: the three care modes (camping, baby, pet), full-window views, overlays, browser Back, other skins. Nobody gets stuck.
import { BASE, PAGE, check, finish, launch, newPage, waitRisk, shot, sleep, closeAll, ev, clickable, noHScroll } from './lib.mjs'

const careState = (page) => ev(page, () => __e2e.getState().state?.care?.status ?? null)
const waitCare = (page, want, ms = 15000) => page.waitForFunction((w) => (__e2e.getState().state?.care?.status === 'ACTIVE') === w, want, { timeout: ms })
const present = (page, sel) => page.locator(sel).count().then((n) => n > 0)
const url = (page) => new URL(page.url())
/** waits until `sel` is gone (panels fade out for 200 ms before they leave the DOM) */
const gone = (page, sel, ms = 3000) => page.waitForFunction((q) => !document.querySelector(q), sel, { timeout: ms }).then(() => true).catch(() => false)

async function modes(viewportName, viewport, mobile) {
  const browser = await launch()
  const { page } = await newPage(browser, { viewport, mobile })
  await page.goto(PAGE()); await page.waitForSelector('[data-testid=sc-child-hot]')
  await page.click('[data-testid=sc-child-hot]'); await waitRisk(page, 'CRITICAL')
  await page.waitForFunction(() => __e2e.getState().state?.care?.can_start, null, { timeout: 15000 })
  const startUrl = page.url()
  const MODES = [
    { id: 'camping', sw: 'Chế độ cắm trại', profile: 'ADULT' },
    { id: 'baby', sw: 'Dỗ bé', profile: 'CHILD' },
    { id: 'pet', sw: 'Chế độ thú cưng', profile: 'PET' },
  ]
  for (const m of MODES) {
    const t = `[${viewportName}] mode ${m.id}`
    await page.evaluate(() => window.__ui.getState().setOverlay('carmode')); await page.waitForSelector('[data-testid=vf-carmode]')
    await page.evaluate((id) => document.querySelector(`.vf-modecard[data-mode=${id}]`).click(), m.id)
    await sleep(300)
    await page.evaluate((l) => document.querySelector(`[role=switch][aria-label="${l}"]`).click(), m.sw)
    await waitCare(page, true)
    await page.waitForSelector('[data-testid=vf-care]', { state: 'attached' })
    check(`${t}: enter from the home screen, care screen appears`, (await ev(page, () => __e2e.getState().state.care.profile)) === m.profile && await page.isVisible('[data-testid=vf-care]'), `profile=${m.profile}`)
    await shot(page, `nav-${viewportName}-${m.id}-care`)
    check(`${t}: labelled exit buttons are on the screen ("Về màn hình chính", "Tắt chế độ")`, await page.isVisible('[data-testid=care-home]') && await page.isVisible('[data-testid=care-stop]'))
    // exit 1: Home button on the care screen
    await page.click('[data-testid=care-home]')
    check(`${t}: "Về màn hình chính" leaves the screen, the mode keeps running, a way back is shown`, !(await present(page, '[data-testid=vf-care]')) && (await careState(page)) === 'ACTIVE' && await page.isVisible('[data-testid=vf-care-chip]'))
    await shot(page, `nav-${viewportName}-${m.id}-home`)
    // re-enter through the chip
    await page.click('[data-testid=vf-care-chip]')
    check(`${t}: re-enter from the "Mở lại" chip`, await page.isVisible('[data-testid=vf-care]'))
    // exit 2: Escape
    await page.keyboard.press('Escape')
    check(`${t}: Esc hides the care screen`, !(await present(page, '[data-testid=vf-care]')))
    // exit 3: browser Back
    await page.click('[data-testid=vf-care-chip]'); await page.waitForSelector('[data-testid=vf-care]')
    await page.goBack(); await sleep(400)
    check(`${t}: browser Back hides the care screen and stays on this page`, !(await present(page, '[data-testid=vf-care]')) && url(page).pathname === new URL(startUrl).pathname, page.url())
    // exit 4: Trang chủ in the bottom bar
    await page.click('[data-testid=vf-care-chip]'); await page.waitForSelector('[data-testid=vf-care]')
    await page.evaluate(() => document.querySelector('[aria-label="Trang chủ"]').click()); await sleep(300)
    check(`${t}: the home button of the car also leaves it`, !(await present(page, '[data-testid=vf-care]')))
    check(`${t}: nothing invisible blocks clicks afterwards (cabin tile is clickable)`, await clickable(page, '[data-testid=vf-cabin-tile]') || await clickable(page, '[data-testid=vf-care-chip]'))
    // exit 5: stop the mode
    await page.click('[data-testid=vf-care-chip]'); await page.waitForSelector('[data-testid=vf-care]')
    await page.click('[data-testid=care-stop]'); await waitCare(page, false)
    await sleep(500)
    check(`${t}: "Tắt chế độ" ends the mode: no screen, no chip`, !(await present(page, '[data-testid=vf-care]')) && !(await present(page, '[data-testid=vf-care-chip]')))
    // close the car-mode panel by its X
    await page.evaluate(() => window.__ui.getState().setOverlay('carmode')); await page.waitForSelector('[data-testid=vf-carmode]')
    await page.evaluate(() => document.querySelector('.vf-panel .vf-close').click()); await sleep(500)
    check(`${t}: the X of the Chế độ xe panel closes it`, !(await present(page, '[data-testid=vf-carmode]')))
    await page.waitForFunction(() => __e2e.getState().state?.care?.can_start || true)
  }
  check(`[${viewportName}] modes: no console errors`, page.errs.length === 0, page.errs.join(' | '))
  await closeAll(browser)
}

async function views() {
  const browser = await launch()
  const { page } = await newPage(browser, { viewport: [1366, 768] })
  await page.goto(PAGE()); await page.waitForSelector('[data-testid=fullscreen-cockpit]')
  const base = url(page).pathname
  // fullscreen cockpit: enter, interact, leave by every route
  await page.click('[data-testid=fullscreen-cockpit]'); await page.waitForSelector('[data-testid=exit-mode]')
  check('V1 full-window car screen has a labelled exit "Thoát toàn màn hình"', /Thoát toàn màn hình/.test(await page.innerText('[data-testid=exit-mode]')) && url(page).searchParams.get('view') === 'cockpit')
  await page.evaluate(() => window.__ui.getState().setOverlay('vehicle')); await page.waitForSelector('.vf-panel')
  await page.keyboard.press('Escape')
  check('V2 interaction then Esc: closes the open panel first (stays in full-window view)', await gone(page, '.vf-panel') && url(page).searchParams.get('view') === 'cockpit')
  await page.keyboard.press('Escape'); await sleep(300)
  check('V3 second Esc leaves full-window view', url(page).searchParams.get('view') === null && await present(page, '[data-testid=demo-page]'))
  await page.click('[data-testid=fullscreen-cockpit]'); await page.waitForSelector('[data-testid=exit-mode]')
  await page.click('[data-testid=exit-mode]'); await page.waitForSelector('[data-testid=demo-page]')
  check('V4 exit button returns to the demo page, no reload needed', url(page).searchParams.get('view') === null && await clickable(page, '[data-testid=sc-child-hot]'))
  await page.click('[data-testid=fullscreen-cockpit]'); await page.waitForSelector('[data-testid=exit-mode]')
  await page.goBack(); await page.waitForSelector('[data-testid=demo-page]')
  check('V5 browser Back from full-window view returns to the demo page', url(page).searchParams.get('view') === null)
  await page.goForward(); await page.waitForSelector('[data-testid=exit-mode]')
  check('V6 browser Forward re-enters; page still usable', url(page).searchParams.get('view') === 'cockpit')
  // overlay inside full-window view + Back
  await page.evaluate(() => window.__ui.getState().setOverlay('carmode')); await page.waitForSelector('[data-testid=vf-carmode]')
  await page.goBack()
  check('V7 Back with a panel open closes the panel first (does not jump pages)', await gone(page, '[data-testid=vf-carmode]') && url(page).searchParams.get('view') === 'cockpit')
  await page.click('[data-testid=exit-mode]'); await page.waitForSelector('[data-testid=demo-page]')
  // open the layer, then exit the view: layer closes, entries stay consistent
  await page.click('[data-testid=fullscreen-cockpit]'); await page.waitForSelector('[data-testid=exit-mode]')
  await page.evaluate(() => window.__ui.getState().setOverlay('cabin')); await page.waitForSelector('[data-testid=cabin-monitor]')
  check('V8 exit button reachable above the open cabin dialog', await ev(page, () => { const b = document.querySelector('[data-testid=exit-mode]'); const r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!t && b.contains(t) }))
  await page.evaluate(() => document.querySelector('[data-testid=exit-mode]').click()); await page.waitForSelector('[data-testid=demo-page]'); await sleep(500)
  check('V9 leaving the view with a dialog open: dialog closed too, no ghost overlay', !(await present(page, '[data-testid=cabin-monitor]')) && await clickable(page, '[data-testid=sc-empty]'))
  const h0 = await ev(page, () => history.length)
  for (let i = 0; i < 5; i++) { await page.evaluate(() => window.__ui.getState().setOverlay('cabin')); await page.waitForSelector('[data-testid=cabin-monitor]'); await page.click('[data-testid=cm-close]'); await gone(page, '[data-testid=cabin-monitor]'); await sleep(150) }
  check('V10 opening and closing a dialog 5 times does not grow the history (no back-button trap)', (await ev(page, () => history.length)) <= h0 + 1, `history.length ${h0} -> ${await ev(page, () => history.length)}`)
  // map mode
  await page.goto(PAGE()); await page.waitForSelector('[data-testid=demo-page]')
  await page.evaluate(() => window.__ui.getState().setOverlay('map')); await sleep(600)
  check('M1 map mode: "Thu nhỏ bản đồ" is on screen', await present(page, '[aria-label="Thu nhỏ bản đồ"]'))
  await page.evaluate(() => document.querySelector('[aria-label="Thu nhỏ bản đồ"]').click()); await sleep(400)
  check('M2 map mode: leaves by its button', (await ev(page, () => __ui.getState().overlay)) === null)
  await page.evaluate(() => window.__ui.getState().setOverlay('map')); await sleep(300); await page.keyboard.press('Escape'); await sleep(300)
  check('M3 map mode: Esc leaves', (await ev(page, () => __ui.getState().overlay)) === null)
  await page.evaluate(() => window.__ui.getState().setOverlay('map')); await sleep(300); await page.goBack(); await sleep(600)
  check('M4 map mode: Back leaves (stays on page)', (await ev(page, () => __ui.getState().overlay)) === null && url(page).pathname === base)
  // cabin dialog X / backdrop / Esc / Back
  await page.evaluate(() => window.__ui.getState().setOverlay('cabin')); await page.waitForSelector('[data-testid=cabin-monitor]')
  await page.click('[data-testid=cm-close]')
  check('N1 cabin dialog: X closes', !(await present(page, '[data-testid=cabin-monitor]')))
  await page.evaluate(() => window.__ui.getState().setOverlay('cabin')); await page.waitForSelector('[data-testid=cabin-monitor]')
  await page.mouse.click(4, 4); await sleep(300)
  check('N2 cabin dialog: clicking outside closes', !(await present(page, '[data-testid=cabin-monitor]')))
  await page.evaluate(() => window.__ui.getState().setOverlay('cabin')); await page.waitForSelector('[data-testid=cabin-monitor]')
  await page.keyboard.press('Escape'); await sleep(300)
  check('N3 cabin dialog: Esc closes', !(await present(page, '[data-testid=cabin-monitor]')))
  await page.evaluate(() => window.__ui.getState().setOverlay('cabin')); await page.waitForSelector('[data-testid=cabin-monitor]')
  await page.goBack(); await sleep(400)
  check('N4 cabin dialog: Back closes and stays on page', !(await present(page, '[data-testid=cabin-monitor]')) && url(page).pathname === base)
  check('N5 page scroll is unlocked after closing (no stuck scroll lock)', await ev(page, () => !document.documentElement.classList.contains('cm-lock') && getComputedStyle(document.documentElement).overflow !== 'hidden'))
  // camera overlay: X closes; a camera started in it is released
  await page.evaluate(() => window.__ui.getState().setOverlay('camera')); await page.waitForSelector('[data-testid=vf-camera]')
  await page.click('[data-testid=camera-start]'); await page.waitForSelector('[data-testid=camera-live-chip]', { timeout: 15000 })
  check('K1 camera panel: LIVE chip + real video playing', await ev(page, () => { const v = document.querySelector('[data-testid=camera-live-video]'); return !!v && v.videoWidth > 0 }))
  await shot(page, 'nav-camera-panel-live')
  await page.evaluate(() => document.querySelector('[aria-label="Đóng camera"]').click()); await sleep(600)
  check('K2 camera panel: X closes it and releases the camera it started', !(await present(page, '[data-testid=vf-camera]')) && await ev(page, () => __camera.getDeviceStream() === null))
  // gear R opens the rear camera and leaving R closes it
  await page.evaluate(() => window.__vehicle.getState().setGear('R')); await sleep(500)
  check('K3 reverse gear opens the rear camera', (await ev(page, () => __ui.getState().overlay)) === 'camera')
  await page.evaluate(() => document.querySelector('[aria-label="Đóng camera"]').click()); await sleep(500)
  check('K4 …and its X closes it even in reverse', (await ev(page, () => __ui.getState().overlay)) === null)
  await page.evaluate(() => window.__vehicle.getState().setGear('P')); await sleep(300)
  check('Z0 no console errors in navigation tests', page.errs.length === 0, page.errs.join(' | '))
  await closeAll(browser)
}

async function skins() {
  const browser = await launch()
  const { page } = await newPage(browser, { viewport: [1366, 768] })
  for (const [name, path] of [['SU7', '/cockpit/'], ['Tesla', '/cockpit/tesla/']]) {
    await page.goto(`${BASE}${path}`); await page.waitForSelector('[data-testid=back-to-vinfast]', { timeout: 20000 })
    await page.click('[data-testid=back-to-vinfast]'); await page.waitForSelector('[data-testid=demo-page]', { timeout: 20000 })
    check(`S1 ${name} skin: "← Về demo VinFast" returns to the main demo`, url(page).pathname === '/cockpit/vinfast/')
    await page.goto(`${BASE}${path}?view=cockpit`); await page.waitForSelector('[data-testid=exit-mode]', { timeout: 20000 })
    await page.click('[data-testid=exit-mode]'); await page.waitForSelector('[data-testid=back-to-vinfast]', { timeout: 20000 })
    check(`S2 ${name} skin: full-window view has an exit back to its page`, url(page).searchParams.get('view') === null)
  }
  await closeAll(browser)
}

const which = process.argv[2] ?? 'all'
if (which === 'all' || which === 'modes') { await modes('desktop-1920', [1920, 1080], false); await modes('laptop-1366', [1366, 768], false) }
if (which === 'all' || which === 'mobile') await modes('iphone-390', [390, 844], true)
if (which === 'all' || which === 'views') await views()
if (which === 'all' || which === 'skins') await skins()
process.exit(finish('nav') ? 1 : 0)
