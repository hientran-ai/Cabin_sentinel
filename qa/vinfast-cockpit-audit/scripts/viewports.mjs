// Responsive / zoom / cross-browser: layout metrics + screenshots; core alarm per browser engine.
import { chromium, webkit, firefox } from 'playwright'
import { open, watch } from './lib.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
const OUT = 'evidence/viewports'; mkdirSync(OUT, { recursive: true })
const VPS = [[1920, 1080, '100%'], [1440, 900, '100%'], [1366, 768, '100%'], [1024, 768, '100%'], [390, 844, 'mobile'], [1536, 864, '1920@125%'], [1280, 720, '1920@150%']]
const metrics = () => {
  const de = document.documentElement, cockpit = document.querySelector('[data-testid=cockpit]')?.getBoundingClientRect(), phone = document.querySelector('[data-testid=phone]')?.getBoundingClientRect()
  const art = document.querySelector('[data-testid=vf-artboard]'); const scale = art ? new DOMMatrix(getComputedStyle(art).transform).a : null
  const btns = [...document.querySelectorAll('[data-testid=cockpit] button')].filter((b) => !b.closest('[aria-hidden=true]')).map((b) => b.getBoundingClientRect()).filter((r) => r.width > 0)
  const small = btns.filter((r) => r.width < 24 || r.height < 24).length, under44 = btns.filter((r) => r.width < 44 || r.height < 44).length
  const minBtn = btns.reduce((m, r) => Math.min(m, r.width, r.height), 999)
  const clipped = [...document.querySelectorAll('.vd button, .vd-flow li, .vd-head h1')].filter((e) => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible').length
  const tile = document.querySelector('[data-testid=vf-cabin-tile]')?.getBoundingClientRect()
  const tileFont = parseFloat(getComputedStyle(document.querySelector('[data-testid=vf-cabin-tile] .main')).fontSize) * (scale ?? 1)
  return { docW: de.scrollWidth, vw: innerWidth, hScroll: de.scrollWidth > innerWidth + 1, docH: de.scrollHeight, vh: innerHeight, cockpit: cockpit && [Math.round(cockpit.width), Math.round(cockpit.height), Math.round(cockpit.y)], cockpitScale: scale && +scale.toFixed(3), phone: phone && [Math.round(phone.x), Math.round(phone.y), Math.round(phone.width), Math.round(phone.height)], phoneAboveFold: phone ? phone.y < innerHeight : null, tileAboveFold: tile ? tile.bottom <= innerHeight : null, cockpitButtons: btns.length, minButtonPx: Math.round(minBtn), buttonsUnder24px: small, buttonsUnder44px: under44, tileHeadlinePx: +tileFont.toFixed(1), clippedTextEls: clipped }
}
const R = {}
const b = await chromium.launch()
for (const [w, h, tag] of VPS) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, ...(tag === 'mobile' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}) })
  const p = await ctx.newPage(); await p.goto('https://c4-app-068.cabinsentinel-platform.workers.dev/cockpit/vinfast/'); await p.waitForSelector('[data-testid=vf-cabin-tile]'); await p.waitForTimeout(3500)
  R[`${w}x${h} ${tag}`] = await p.evaluate(metrics)
  await p.screenshot({ path: `${OUT}/${w}x${h}.png` }); await p.screenshot({ path: `${OUT}/${w}x${h}-full.png`, fullPage: true })
  if (w === 1920) { await p.goto('https://c4-app-068.cabinsentinel-platform.workers.dev/cockpit/vinfast/?view=cockpit'); await p.waitForSelector('[data-testid=vf-cabin-tile]'); await p.waitForTimeout(2500); R['1920x1080 fullscreen-cockpit'] = await p.evaluate(metrics); await p.screenshot({ path: `${OUT}/fullscreen-1920.png` }) }
  if (w === 1366) { await p.goto('https://c4-app-068.cabinsentinel-platform.workers.dev/cockpit/vinfast/?view=cockpit'); await p.waitForSelector('[data-testid=vf-cabin-tile]'); await p.waitForTimeout(2500); R['1366x768 fullscreen-cockpit'] = await p.evaluate(metrics); await p.screenshot({ path: `${OUT}/fullscreen-1366.png` }) }
  await ctx.close()
}
await b.close()
writeFileSync(`${OUT}/metrics.json`, JSON.stringify(R, null, 1)); console.table(Object.fromEntries(Object.entries(R).map(([k, v]) => [k, { hScroll: v.hScroll, docH: v.docH, scale: v.cockpitScale, cockpit: String(v.cockpit), phoneFold: v.phoneAboveFold, tileFold: v.tileAboveFold, minBtn: v.minButtonPx, '<24': v.buttonsUnder24px, '<44': v.buttonsUnder44px, btns: v.cockpitButtons, tilePx: v.tileHeadlinePx, clipped: v.clippedTextEls }])))
// engines: core alarm with the bundled engines (codec support differs)
const E = {}
for (const [name, eng, channel] of [['chromium-bundled', chromium], ['chrome', chromium, 'chrome'], ['webkit', webkit], ['firefox', firefox]]) {
  try {
    if (channel) process.env.CHANNEL = channel; else delete process.env.CHANNEL
    const hh = await open({ browser: eng, out: `${OUT}/engine-${name}`, w: 1440, h: 900 })
    await hh.page.click('[data-testid=sc-child-hot]')
    const tl = await watch(hh, 25, (x) => x.risk === 'CRITICAL' || x.cam === 'NO_FEED')
    await hh.shot('after-child-hot')
    const last = tl.at(-1); E[name] = { secondsToResult: tl.length, risk: last.risk, rule: last.rule, cam: last.cam, dets: last.dets, tile: last.tile, errors: hh.log.filter((l) => l.type !== 'warning').map((l) => l.text).slice(0, 4) }
    await hh.b.close()
  } catch (e) { E[name] = { error: String(e).slice(0, 200) } }
}
writeFileSync(`${OUT}/engines.json`, JSON.stringify(E, null, 1)); console.log(JSON.stringify(E, null, 1))
