// Phase 1 discovery: load prod, wait for hydration, enumerate every interactive element (page + phone iframe), log API traffic.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
const URL = process.env.URL ?? 'https://c4-app-068.cabinsentinel-platform.workers.dev/cockpit/vinfast/'
const OUT = 'evidence/discovery'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await ctx.newPage()
const net = [], cons = []
const t0 = Date.now()
page.on('response', (r) => { const u = r.url(); if (!/\.(png|jpg|svg|woff2?|css|mp4|pbf)(\?|$)/.test(u)) net.push({ t: Date.now() - t0, status: r.status(), method: r.request().method(), url: u.replace(/sessions\/[0-9a-f-]+/, 'sessions/:id') }) })
page.on('console', (m) => cons.push({ type: m.type(), text: m.text().slice(0, 300) }))
page.on('pageerror', (e) => cons.push({ type: 'pageerror', text: String(e).slice(0, 300) }))
await page.goto(URL, { waitUntil: 'networkidle' }).catch(() => {})
await page.waitForSelector('[data-testid="vf-cabin-tile"]', { timeout: 30000 })
await page.waitForFunction(() => !document.body.innerText.includes('Đang tạo phiên'), null, { timeout: 30000 })
await page.waitForTimeout(3000)
const perf = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const p = performance.getEntriesByType('paint'); return { domContentLoaded: n.domContentLoadedEventEnd, load: n.loadEventEnd, fcp: p.find((x) => x.name === 'first-contentful-paint')?.startTime, transfer: n.transferSize, resources: performance.getEntriesByType('resource').length, jsBytes: performance.getEntriesByType('resource').filter((r) => r.name.endsWith('.js')).reduce((a, r) => a + r.transferSize, 0) } })
await page.screenshot({ path: `${OUT}/baseline-1920-viewport.png` })
await page.screenshot({ path: `${OUT}/baseline-1920-full.png`, fullPage: true })
const enumerate = () => [...document.querySelectorAll('button,a[href],input,select,textarea,[role=button],[role=tab],[role=radio],[role=switch],[role=checkbox],[tabindex]:not([tabindex="-1"]),video[controls],summary')].map((el) => {
  const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
  return { tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), type: el.getAttribute('type'), name: (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 90), testid: el.closest('[data-testid]')?.getAttribute('data-testid'), pressed: el.getAttribute('aria-pressed'), selected: el.getAttribute('aria-selected'), checked: el.getAttribute('aria-checked'), expanded: el.getAttribute('aria-expanded'), disabled: el.disabled || el.getAttribute('aria-disabled') === 'true', hidden: el.closest('[aria-hidden=true]') ? true : false, visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0', w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }
})
const main = await page.evaluate(enumerate)
const frame = page.frames().find((f) => f.url().includes('/phone/'))
const phone = frame ? await frame.evaluate(enumerate) : []
const phoneText = frame ? await frame.evaluate(() => document.body.innerText) : ''
const storage = await page.evaluate(() => ({ session: Object.keys(sessionStorage), local: Object.keys(localStorage), cookies: document.cookie }))
writeFileSync(`${OUT}/inventory.json`, JSON.stringify({ url: URL, perf, main, phone, phoneUrl: frame?.url(), storage }, null, 1))
writeFileSync(`${OUT}/network.json`, JSON.stringify(net, null, 1)); writeFileSync(`${OUT}/console.json`, JSON.stringify(cons, null, 1))
writeFileSync(`${OUT}/phone-text.txt`, phoneText); writeFileSync(`${OUT}/page-text.txt`, await page.evaluate(() => document.body.innerText))
console.log(JSON.stringify({ perf, mainCount: main.length, mainVisible: main.filter((m) => m.visible).length, phoneCount: phone.length, storage, consoleErrors: cons.filter((c) => c.type === 'error' || c.type === 'pageerror') }, null, 1))
await b.close()
