import { open, sleep } from './lib.mjs'
const h = await open({ out: 'evidence/debug' }); const P = h.page
await P.locator('[data-testid=vf-map] .vf-search').click(); await sleep(600)
console.log('sheet places (empty q):', await P.locator('.vf-search-sheet .vf-place').count(), (await P.locator('.vf-search-sheet').innerText().catch(() => 'NO SHEET')).replace(/\s+/g, ' ').slice(0, 300))
await P.locator('.vf-search-sheet input').fill('hoan'); await sleep(300)
console.log('after hoan:', await P.locator('.vf-search-sheet .vf-place').count())
await P.locator('.vf-search-sheet input').fill('Hồ'); await sleep(300)
console.log('after Hồ:', await P.locator('.vf-search-sheet .vf-place').count())
await h.shot('search')
await P.evaluate(() => window.__ui.getState().setOverlay(null)); await sleep(400)
await P.locator('[data-testid=cockpit] button[aria-label="Thư viện ứng dụng"]').click(); await sleep(500)
const info = await P.locator('[data-testid=vf-library] button').evaluateAll((b) => b.map((x) => { const r = x.getBoundingClientRect(); const c = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return `${x.getAttribute('aria-label')} ${Math.round(r.y)} ${Math.round(r.height)} hit=${c === x || x.contains(c) ? 'self' : (c?.className?.baseVal ?? c?.className)}` }))
console.log(info.join('\n')); await h.shot('library')
await h.b.close()
