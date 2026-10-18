// BEFORE evidence against the currently deployed (old) bundle: can a visitor leave each care mode?
import { launch, newPage, check, finish, sleep, ev, shot, closeAll, waitRisk } from './lib.mjs'
const PROD = process.env.PROD_URL ?? 'https://c4-app-068.cabinsentinel-platform.workers.dev'
const browser = await launch()
const { page } = await newPage(browser, { viewport: [1920, 1080] })
await page.goto(`${PROD}/cockpit/vinfast/?debug=1`); await page.waitForSelector('[data-testid=sc-child-hot]')
console.log('bundle:', await ev(page, () => [...document.scripts].map((s) => s.src).filter(Boolean).join(' ')))
await page.click('[data-testid=sc-child-hot]'); await waitRisk(page, 'CRITICAL', 40000)
await page.waitForFunction(() => __e2e.getState().state?.care?.can_start, null, { timeout: 20000 })
for (const [id, sw] of [['camping', 'Chế độ cắm trại'], ['baby', 'Dỗ bé'], ['pet', 'Chế độ thú cưng']]) {
  await page.evaluate(() => window.__ui.getState().setOverlay('carmode')); await page.waitForSelector('[data-testid=vf-carmode]')
  await page.evaluate((m) => document.querySelector(`.vf-modecard[data-mode=${m}]`).click(), id); await sleep(300)
  await page.evaluate((l) => document.querySelector(`[role=switch][aria-label="${l}"]`).click(), sw)
  await page.waitForFunction(() => __e2e.getState().state?.care?.status === 'ACTIVE', null, { timeout: 15000 })
  await sleep(1200)
  const btns = await ev(page, () => [...document.querySelectorAll('[data-testid=vf-care] button')].map((b) => b.innerText.trim()).filter(Boolean))
  const covered = await ev(page, () => { const r = document.querySelector('[data-testid=vf-care]')?.getBoundingClientRect(); return !!r })
  check(`BEFORE ${id}: care screen visible=${covered}; buttons on it: ${JSON.stringify(btns)}`, btns.some((t) => /chính|Thoát|Đóng|Tắt chế độ/.test(t)), 'a visitor needs an exit control on this screen')
  await shot(page, `before-prod-${id}`)
  await page.keyboard.press('Escape'); await sleep(400)
  const stillThere = await ev(page, () => !!document.querySelector('[data-testid=vf-care]'))
  check(`BEFORE ${id}: Esc leaves the care screen`, !stillThere)
  await page.evaluate(() => document.querySelector('[aria-label="Trang chủ"]').click()); await sleep(400)
  check(`BEFORE ${id}: the car's Home button leaves the care screen`, !(await ev(page, () => !!document.querySelector('[data-testid=vf-care]'))))
  // stop the mode through the backend the way the phone would, so the next mode can start
  await page.evaluate(async () => { const s = __e2e.getState(); await __e2eApi.careStop(s.session, 'PHONE').catch(() => undefined) })
  await page.waitForFunction(() => __e2e.getState().state?.care?.status !== 'ACTIVE', null, { timeout: 15000 })
}
process.exit(finish('before-prod') ? 0 : 0)
