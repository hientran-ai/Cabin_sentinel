import { open, watch } from './lib.mjs'
const h = await open({ out: 'evidence/alarm-prompts' })
await h.page.click('[data-testid=sc-child-hot]'); await watch(h, 20, (x) => x.risk === 'CRITICAL'); await new Promise((r) => setTimeout(r, 1500))
console.log(JSON.stringify(await h.page.evaluate(() => [...document.querySelectorAll('[role=alert]')].map((e) => { const r = e.getBoundingClientRect(); const cx = r.x + r.width / 2, cy = r.y + r.height / 2; const top = document.elementFromPoint(cx, cy); return { cls: String(e.className).slice(0, 40), box: [r.x, r.y, r.width, r.height].map(Math.round), visibleOnTop: e === top || e.contains(top), coveredBy: e === top || e.contains(top) ? null : String(top?.className?.baseVal ?? top?.className).slice(0, 40), text: e.innerText.replace(/\s+/g, ' ').slice(0, 70) } })), null, 1))
// toast vs media widget overlap
console.log(JSON.stringify(await h.page.evaluate(() => { const t = document.querySelector('.vf-toast')?.getBoundingClientRect(), m = document.querySelector('[data-testid=vf-media]')?.getBoundingClientRect(); return { toast: t && [t.x, t.y, t.width, t.height].map(Math.round), media: m && [m.x, m.y, m.width, m.height].map(Math.round), toastBg: getComputedStyle(document.querySelector('.vf-toast')).backgroundColor } })))
await h.page.screenshot({ path: 'evidence/alarm-prompts/cockpit-zoom.png', clip: { x: 520, y: 300, width: 820, height: 680 } })
const ph = h.phone(); await ph.waitForTimeout(2500)
await h.page.screenshot({ path: 'evidence/alarm-prompts/phone-zoom.png', clip: { x: 1450, y: 300, width: 340, height: 680 } })
await h.b.close()
