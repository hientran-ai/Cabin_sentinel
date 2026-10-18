// Responsive + accessibility of the Giám sát cabin dialog and the judge page, at six viewports (plus phone landscape).
import { PAGE, check, finish, launch, newPage, waitRisk, shot, sleep, closeAll, ev, noHScroll, clickable } from './lib.mjs'

const VIEWPORTS = [
  ['iphone-390x844', 390, 844, true], ['iphone-se-375x812', 375, 812, true], ['iphone-max-430x932', 430, 932, true], ['ipad-768x1024', 768, 1024, true],
  ['laptop-1366x768', 1366, 768, false], ['desktop-1920x1080', 1920, 1080, false], ['phone-landscape-844x390', 844, 390, true],
]
const TARGET = process.env.TARGET_BASE ?? undefined

const geometry = () => {
  const vw = innerWidth, vh = innerHeight
  const box = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } }
  const dlg = box('[data-testid=cabin-monitor]'), close = box('[data-testid=cm-close]'), head = box('.cm-head'), tabs = box('.cm-tabs')
  const tabEls = [...document.querySelectorAll('.cm-tabs button')]
  const clippedTabs = tabEls.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.innerText)
  const tabH = tabEls.map((b) => Math.round(b.getBoundingClientRect().height))
  const small = [...document.querySelectorAll('[data-testid=cabin-monitor] button, [data-testid=cabin-monitor] summary, [data-testid=cabin-monitor] input[type=checkbox]')].filter((b) => b.getClientRects().length).map((b) => { const r = b.getBoundingClientRect(); return { t: (b.innerText || b.getAttribute('aria-label') || b.tagName).trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) } }).filter((x) => x.h < 40 || x.w < 40)
  const body = document.querySelector('.cm-body')
  const overflowing = [...document.querySelectorAll('.cm-card, .cm-hero, .cm-step, .cm-viewer, .cm-source-bar')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > dlg.r + 1 || r.left < dlg.l - 1 }).map((e) => e.className)
  return { vw, vh, dlg, close, head, tabs, clippedTabs, tabH, small, bodyOverflowX: body.scrollWidth > body.clientWidth + 1, bodyScrollable: body.scrollHeight > body.clientHeight + 1, overflowing, docScrollW: document.documentElement.scrollWidth }
}

const contrast = () => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 1]; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1] }
  const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat([1])
  const bgOf = (el) => { const chain = []; for (let e = el; e; e = e.parentElement) chain.push(parse(getComputedStyle(e).backgroundColor)); let c = [10, 34, 80, 1]; for (const b of chain.reverse()) if (b[3] > 0) c = over(b, c); return c }
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  const out = []
  const sel = ['.cm-head h2', '.cm-badge', '.cm-tabs button[aria-selected=true]', '.cm-tabs button[aria-selected=false]', '.cm-hero-status', '.cm-why', '.cm-muted', '.cm-note', '.cm-eyebrow', '.cm-card h4', '.cm-facts dt', '.cm-facts dd', '.cm-btn', '.cm-tile small', '.cm-caution', '.cm-step-t span', '.cm-viewer figcaption']
  for (const s of sel) for (const e of document.querySelectorAll(s)) {
    if (!e.getClientRects().length || !e.innerText?.trim()) continue
    const cs = getComputedStyle(e); const fg = parse(cs.color); const bg = bgOf(e); const r = ratio(over(fg, bg), bg)
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700, large = size >= 24 || (size >= 18.66 && bold)
    out.push({ s, r: Math.round(r * 100) / 100, need: large ? 3 : 4.5, text: e.innerText.trim().slice(0, 20) })
  }
  return out
}

async function one([name, w, h, mobile], base) {
  const browser = await launch()
  const { page } = await newPage(browser, { viewport: [w, h], mobile })
  await page.goto(PAGE(base)); await page.waitForSelector('[data-testid=sc-child-hot]'); await sleep(800)
  check(`[${name}] home: no horizontal overflow`, await noHScroll(page), `scrollWidth ${await ev(page, () => document.documentElement.scrollWidth)} / ${w}`)
  await shot(page, `after-${name}-1-home`)
  await page.click('[data-testid=sc-child-hot]'); await waitRisk(page, 'CRITICAL', 40000); await sleep(800)
  const narrow = w < 1200
  if (narrow) { check(`[${name}] phone/tablet: "Giám sát cabin" shortcut is on the page and clickable`, await clickable(page, '[data-testid=open-cabin]')); await page.click('[data-testid=open-cabin]') }
  else await page.evaluate(() => document.querySelector('[data-testid=vf-cabin-tile]').click())
  await page.waitForSelector('[data-testid=cabin-monitor]'); await sleep(500)
  for (const [tab, label] of [['vf-tab-overview', 'overview'], ['vf-tab-intro', 'how'], ['vf-tab-evidence', 'evidence']]) {
    await page.click(`[data-testid=${tab}]`); await sleep(700)
    if (label === 'evidence') await page.waitForSelector('[data-testid=cm-frame]', { timeout: 25000 }).catch(() => undefined)
    const g = await ev(page, geometry)
    const t = `[${name}] ${label}`
    check(`${t}: dialog fits inside the viewport`, g.dlg.l >= -1 && g.dlg.r <= g.vw + 1 && g.dlg.t >= -1 && g.dlg.b <= g.vh + 1, JSON.stringify({ dlg: [g.dlg.l, g.dlg.t, g.dlg.r, g.dlg.b].map(Math.round), vp: [g.vw, g.vh] }))
    check(`${t}: close button visible, >= 44 px, inside the viewport`, g.close.w >= 44 && g.close.h >= 44 && g.close.r <= g.vw && g.close.t >= 0 && g.close.b <= g.vh, JSON.stringify(g.close))
    check(`${t}: header does not overlap the tabs`, g.head.b <= g.tabs.t + 1, `${Math.round(g.head.b)} <= ${Math.round(g.tabs.t)}`)
    check(`${t}: tab labels are not cut off`, g.clippedTabs.length === 0, g.clippedTabs.join(','))
    check(`${t}: tabs are >= 44 px tall (touch)`, g.tabH.every((x) => x >= 44), g.tabH.join(','))
    check(`${t}: no horizontal overflow inside the dialog`, !g.bodyOverflowX && g.overflowing.length === 0 && g.docScrollW <= g.vw + 1, g.overflowing.join(',') || `docScrollW ${g.docScrollW}`)
    check(`${t}: touch targets (buttons) are at least 40 px`, g.small.length === 0, JSON.stringify(g.small.slice(0, 4)))
    const active = await ev(page, () => { const s = document.querySelector('.cm-tabs button[aria-selected=true]'); const a = getComputedStyle(s, '::after').transform; const r = s.getBoundingClientRect(); return { a, ok: a === 'matrix(1, 0, 0, 1, 0, 0)' || a === 'none', n: document.querySelectorAll('.cm-tabs button[aria-selected=true]').length, vis: r.left >= 0 && r.right <= innerWidth } })
    check(`${t}: exactly one active tab, indicator fully drawn, tab inside the viewport`, active.n === 1 && active.ok && active.vis, JSON.stringify(active))
    await shot(page, `after-${name}-4-cabin-${label}`)
    if (label === 'evidence') {
      const v = await ev(page, () => { const e = document.querySelector('.cm-stage'); const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, ar: r.width / r.height, vw: innerWidth } })
      check(`${t}: viewer is 16:9-ish (or height-capped) and never wider than the screen`, v.w <= v.vw && v.ar >= 1.2 && v.ar <= 2.4, JSON.stringify(v))
    }
  }
  // independent scroll
  const sc = await ev(page, () => { const b = document.querySelector('.cm-body'); const y0 = scrollY; b.scrollTop = 99999; return { moved: b.scrollTop > 0 || b.scrollHeight <= b.clientHeight, pageMoved: scrollY !== y0, locked: document.documentElement.classList.contains('cm-lock') } })
  check(`[${name}] dialog body scrolls on its own; the page behind does not move; scroll lock on`, sc.moved && !sc.pageMoved && sc.locked, JSON.stringify(sc))
  // contrast on the three tabs
  const bad = []
  for (const tab of ['vf-tab-overview', 'vf-tab-intro', 'vf-tab-evidence']) { await page.click(`[data-testid=${tab}]`); await sleep(400); bad.push(...(await ev(page, contrast)).filter((x) => x.r < x.need)) }
  const uniq = [...new Map(bad.map((b) => [b.s + b.r, b])).values()]
  check(`[${name}] colour contrast of dialog text (WCAG AA: 4.5, large 3)`, uniq.length === 0, JSON.stringify(uniq.slice(0, 5)))
  await page.click('[data-testid=cm-close]'); await sleep(400)
  check(`[${name}] after closing: no dialog, scroll lock released, page clickable`, !(await page.locator('[data-testid=cabin-monitor]').count()) && await ev(page, () => !document.documentElement.classList.contains('cm-lock')) && await clickable(page, '[data-testid=sc-empty]'))
  check(`[${name}] no console errors`, page.errs.length === 0, page.errs.join(' | '))
  await closeAll(browser)
}

for (const v of VIEWPORTS) await one(v, TARGET)
process.exit(finish('responsive') ? 1 : 0)
