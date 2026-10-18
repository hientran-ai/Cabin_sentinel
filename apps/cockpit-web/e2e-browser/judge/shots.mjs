// Screenshots of the page in the states the report needs. PREFIX=before for the old production bundle, after for the new one.
import { launch, newPage, check, finish, sleep, ev, shot, closeAll, waitRisk, OUT } from './lib.mjs'
const TARGET = process.env.TARGET ?? 'https://c4-app-068.cabinsentinel-platform.workers.dev'
const P = process.env.PREFIX ?? 'before'
const hosted = !/127\.0\.0\.1|localhost/.test(TARGET)
const browser = await launch({ devices: 2 })
const sel = (page, t) => `[data-testid=${t}]`
async function run(name, viewport, mobile) {
  const { page } = await newPage(browser, { viewport, mobile, guide: name === 'desktop-1366x768' && P !== 'before' })
  await page.goto(`${TARGET}/cockpit/vinfast/?debug=1`); await page.waitForSelector('[data-testid=sc-child-hot]'); await sleep(1500)
  await shot(page, `${P}-${name}-1-home`)
  if (name === 'desktop-1366x768' && P !== 'before') { await page.click('[data-testid=onboarding-close]').catch(() => undefined) }
  await page.click('[data-testid=sc-child-hot]'); await waitRisk(page, 'CRITICAL', 40000); await sleep(1500)
  await shot(page, `${P}-${name}-2-after-scenario`)
  await page.evaluate(() => window.__ui.getState().setOverlay('cabin')); await sleep(900)
  await shot(page, `${P}-${name}-3-cabin-overview`)
  for (const [tabId, label] of [['vf-tab-intro', 'how'], ['vf-tab-evidence', 'evidence']]) {
    await page.evaluate((id) => document.querySelector(`[data-testid=${id}]`)?.click(), tabId); await sleep(1200)
    await shot(page, `${P}-${name}-4-cabin-${label}`)
  }
  await page.close()
}
await run('desktop-1366x768', [1366, 768], false)
await run('mobile-390x844', [390, 844], true)
await run('tablet-768x1024', [768, 1024], true)
await closeAll(browser)
console.log('screenshots in', OUT)
