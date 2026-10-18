// Shared helpers for the judge-page browser tests (Playwright). Every check prints PASS / FAIL / BLOCKED / NOT TESTABLE with evidence.
// BASE: where the page is served (local Worker or the production URL). HOSTED_BASE: a NON-localhost origin that behaves like production
// (frames of a real camera are not uploaded there): cabin.localhost is a secure context for the browser but is not one of the hosts the app
// treats as "this machine", so it gets exactly the hosted behaviour.
import { chromium, webkit } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const BASE = (process.env.BASE ?? 'http://127.0.0.1:8787').replace(/\/$/, '')
export const PROD = /^https:\/\//.test(BASE)
export const HOSTED_BASE = PROD ? BASE : (process.env.HOSTED_BASE ?? 'http://cabin.localhost:8787').replace(/\/$/, '')
export const OUT = process.env.OUT ?? new URL('./out/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
export const PAGE = (base = BASE, q = '') => `${base}/cockpit/vinfast/?debug=1${q}`

const results = []
export function check(id, ok, evidence = '', status) {
  const s = status ?? (ok ? 'PASS' : 'FAIL')
  results.push({ id, status: s, evidence: String(evidence).slice(0, 400) })
  console.log(`${s.padEnd(13)} ${id}${evidence ? '  · ' + String(evidence).slice(0, 240) : ''}`)
}
export const blocked = (id, why) => check(id, false, why, 'BLOCKED')
export const notTestable = (id, why) => check(id, false, why, 'NOT TESTABLE')
export function finish(name) {
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ base: BASE, hosted: HOSTED_BASE, at: new Date().toISOString(), results }, null, 2))
  const c = (s) => results.filter((r) => r.status === s).length
  console.log(`\n${name}: ${c('PASS')} PASS · ${c('FAIL')} FAIL · ${c('BLOCKED')} BLOCKED · ${c('NOT TESTABLE')} NOT TESTABLE (of ${results.length})`)
  return c('FAIL')
}

/** every browser we start; a crash in a test must not leave a camera-holding, frame-sending browser behind */
const live = new Set()
async function reap(err) { if (err) console.error(err); for (const b of live) await b.close().catch(() => undefined); process.exit(err ? 1 : 0) }
process.on('uncaughtException', reap); process.on('unhandledRejection', reap)
export const hostedArgs = []

/** opts: fakeDevice (default true), autoAccept (fake-ui, default true), devices (count), engine 'chromium'|'webkit' */
export async function launch(opts = {}) {
  const { fakeDevice = true, autoAccept = true, devices = 1, engine = 'chromium', extraArgs = [] } = opts
  if (engine === 'webkit') { const b = await webkit.launch({ headless: true }); live.add(b); return b }
  const args = [...hostedArgs, ...extraArgs]
  if (autoAccept) args.push('--use-fake-ui-for-media-stream')
  if (fakeDevice) args.push(`--use-fake-device-for-media-stream${devices > 1 ? `=device-count=${devices}` : ''}`)
  // system Chrome: Playwright's bundled Chromium cannot decode the H.264 sample clips (set CHROME_CHANNEL=chromium to force the bundled one)
  const channel = process.env.CHROME_CHANNEL ?? 'chrome'
  const b = await chromium.launch({ headless: true, args, ...(channel === 'chromium' ? {} : { channel }) })
  live.add(b)
  return b
}

export const VIEWPORTS = { 'iphone-390x844': [390, 844, true], 'iphone-se-375x812': [375, 812, true], 'iphone-max-430x932': [430, 932, true], 'ipad-768x1024': [768, 1024, true], 'laptop-1366x768': [1366, 768, false], 'desktop-1920x1080': [1920, 1080, false] }

export async function newPage(browser, { viewport = [1366, 768], mobile = false, permissions = ['camera'], guide = false, reducedMotion } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: viewport[0], height: viewport[1] }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, permissions, reducedMotion,
    userAgent: mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' : undefined,
  })
  if (!guide) await ctx.addInitScript(() => { try { localStorage.setItem('cabin-onboarding-v1', '1') } catch { /* ignore */ } })
  const page = await ctx.newPage()
  page.errs = []; page.reqs = []
  page.on('pageerror', (e) => page.errs.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource.*(40[14])/.test(m.text())) page.errs.push(`console: ${m.text()}`) })
  page.on('requestfailed', (r) => { if (!/tile|openfreemap|maplibre|nominatim|osrm|open-meteo/i.test(r.url()) && r.failure()?.errorText !== 'net::ERR_ABORTED') page.errs.push(`requestfailed: ${r.method()} ${r.url()} ${r.failure()?.errorText}`) })
  page.on('request', (r) => page.reqs.push({ url: r.url(), method: r.method(), body: r.method() === 'POST' ? (r.postData() ?? '') : '' }))
  return { ctx, page }
}

export const ev = (page, fn, arg) => page.evaluate(fn, arg)
export const waitRisk = (page, risk, ms = 25000) => page.waitForFunction((r) => { const s = window.__e2e?.getState().state; return s?.risk_level === r && s.decision_current }, risk, { timeout: ms })
export const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false })
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** true when the element at the centre of `sel` is `sel` itself (or inside it): nothing invisible covers it */
export const clickable = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!t && (t === el || el.contains(t)) }, sel)
export const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
export async function openCabin(page) {
  await page.evaluate(() => window.__ui.getState().setOverlay('cabin'))
  await page.waitForSelector('[data-testid=cabin-monitor]')
}
export const closeAll = async (browser) => { for (const c of browser.contexts()) await c.close(); await browser.close(); live.delete(browser) }
