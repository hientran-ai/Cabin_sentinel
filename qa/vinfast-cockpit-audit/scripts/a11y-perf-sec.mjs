// Accessibility (axe + keyboard + reduced motion), performance (load, memory growth, request rate), passive security.
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { writeFileSync, mkdirSync } from 'node:fs'
const URL = 'https://c4-app-068.cabinsentinel-platform.workers.dev/cockpit/vinfast/'
const OUT = 'evidence/a11y-perf-sec'; mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ channel: 'chrome' })
const out = {}
// ---- axe: page (incl. phone iframe) at home and with cabin panel open
{
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } }); const p = await ctx.newPage()
  await p.goto(URL + '?debug=1'); await p.waitForSelector('[data-testid=vf-cabin-tile]'); await p.waitForTimeout(3000)
  const sum = (r) => r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, sample: v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' :: ' + (n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 160)) }))
  out.axeHome = sum(await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze())
  await p.click('[data-testid=vf-cabin-tile]'); await p.waitForTimeout(600)
  out.axeCabinPanel = sum(await new AxeBuilder({ page: p }).include('[data-testid=cockpit]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
  // alerts announced? count live regions
  out.liveRegions = await p.evaluate(() => ({ alerts: document.querySelectorAll('[role=alert]').length, status: document.querySelectorAll('[role=status]').length, ariaLive: [...document.querySelectorAll('[aria-live]')].map((e) => e.getAttribute('aria-live') + ':' + (e.dataset.testid ?? e.className).slice(0, 30)) }))
  await p.evaluate(() => window.__ui.getState().setOverlay(null))
  // keyboard: first 40 tab stops, focus visibility
  await p.mouse.click(5, 5)
  const stops = []
  for (let i = 0; i < 45; i++) {
    await p.keyboard.press('Tab')
    stops.push(await p.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return { el: (e.getAttribute('aria-label') || e.innerText || e.tagName).replace(/\s+/g, ' ').slice(0, 40), inFrame: e.tagName === 'IFRAME', outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, shadow: cs.boxShadow !== 'none', visible: r.width > 0 && r.y < innerHeight * 3 } }))
  }
  out.tabStops = stops
  out.focusIndicatorMissing = stops.filter((s) => !s.outline && !s.shadow).map((s) => s.el)
  // hidden-but-focusable: aria-hidden subtrees containing focusable elements
  out.ariaHiddenFocusable = await p.evaluate(() => [...document.querySelectorAll('[aria-hidden=true] button, [aria-hidden=true] a[href], [aria-hidden=true] input')].map((e) => e.getAttribute('aria-label') || e.innerText.slice(0, 30)))
  // duplicate role=alert prompts and their boxes
  out.prompts = await p.evaluate(() => [...document.querySelectorAll('[data-testid=vf-prompt]')].map((e) => { const r = e.getBoundingClientRect(); return { cls: e.className.slice(0, 40), role: e.getAttribute('role'), box: [r.x, r.y, r.width, r.height].map(Math.round), text: e.innerText.replace(/\s+/g, ' ').slice(0, 60) } }))
  // perf: memory growth during 60 s of polling + 40 overlay toggles
  const mem = async () => p.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null)
  const m0 = await mem(); const reqs = []; p.on('request', (r) => { if (r.url().includes('/api/')) reqs.push(Date.now()) })
  const tLat = []
  for (let i = 0; i < 40; i++) { const t = Date.now(); await p.click('[data-testid=vf-cabin-tile]'); await p.waitForSelector('[data-testid=vf-cabin-detail]'); tLat.push(Date.now() - t); await p.keyboard.press('Escape'); await p.waitForTimeout(250) }
  await p.waitForTimeout(30000)
  const m1 = await mem()
  out.perf = { heapMBStart: m0, heapMBAfter40TogglesAnd30s: m1, overlayOpenLatencyMs: { median: tLat.sort((a, b) => a - b)[20], max: tLat.at(-1) }, apiRequestsPerSecIdle: +(reqs.filter((t) => t > Date.now() - 30000).length / 30).toFixed(2) }
  const nav = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: Math.round(performance.getEntriesByType('paint').find((x) => x.name === 'first-contentful-paint')?.startTime), lcp: null, jsKB: Math.round(performance.getEntriesByType('resource').filter((r) => /\.js/.test(r.name)).reduce((a, r) => a + r.transferSize, 0) / 1024), resources: performance.getEntriesByType('resource').length, totalKB: Math.round(performance.getEntriesByType('resource').reduce((a, r) => a + r.transferSize, 0) / 1024) } })
  out.load = nav
  // storage / secrets passive
  out.storage = await p.evaluate(() => ({ session: Object.fromEntries(Object.keys(sessionStorage).map((k) => [k, sessionStorage.getItem(k).replace(/"token":"[^"]+"/, '"token":"<redacted len ' + (JSON.parse(sessionStorage.getItem(k)).token?.length ?? 0) + '>"')])), localKeys: Object.keys(localStorage), localSizes: Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k).length])) }))
  out.urlHasToken = /token|session/i.test(p.url())
  await ctx.close()
}
// ---- reduced motion: is motion disabled?
{
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' }); const p = await ctx.newPage()
  await p.goto(URL); await p.waitForSelector('[data-testid=vf-cabin-tile]'); await p.waitForTimeout(2000)
  out.reducedMotion = await p.evaluate(() => { const anim = document.getAnimations().filter((a) => a.playState === 'running').map((a) => (a.animationName || a.constructor.name) + '@' + (a.effect?.target?.className?.baseVal ?? a.effect?.target?.className ?? '').toString().slice(0, 30)); const blink = [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).animationName !== 'none').map((e) => getComputedStyle(e).animationName + '@' + String(e.className?.baseVal ?? e.className).slice(0, 30)); return { runningAnimations: anim.slice(0, 15), cssAnimated: blink.slice(0, 15), videosAutoplaying: [...document.querySelectorAll('video')].filter((v) => !v.paused).length } })
  await ctx.close()
}
await b.close()
writeFileSync(`${OUT}/results.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify({ ...out, tabStops: out.tabStops.map((s) => s.el + (s.outline || s.shadow ? '' : ' [NO-FOCUS-RING]')) }, null, 1).slice(0, 9000))
