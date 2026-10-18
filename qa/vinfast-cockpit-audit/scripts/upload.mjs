// Upload path: valid/invalid formats, corrupt, empty, oversized, hostile filename. Real backend (prod), uploads are repo sample frames.
import { open, sleep } from './lib.mjs'
const h = await open({ out: 'evidence/upload' }); const P = h.page; const R = []
let dialogs = 0; P.on('dialog', (d) => { dialogs++; d.dismiss() })
await P.click('[data-testid=sim-env] .vd-fold-head')
const reqs = []; P.on('response', async (r) => { if (r.url().includes('/observations')) reqs.push({ s: r.status(), body: (await r.text().catch(() => '')).slice(0, 200) }) })
async function up(id, file, mime) {
  const n0 = reqs.length
  const st = await P.evaluate(() => window.__e2e.getState().state?.revision)
  await P.setInputFiles('[data-testid=still-input]', { name: file.split('/').pop(), mimeType: mime, buffer: (await import('node:fs')).readFileSync(file) })
  await sleep(6000)
  const s = await h.snap(); const err = await P.locator('[data-testid=sim-env] .vd-err').innerText().catch(() => '')
  const r = { id, file: file.split('/').pop(), mime, requests: reqs.slice(n0), uiError: err, source: s.source, risk: s.risk, rule: s.rule, dets: s.dets, tile: s.tile, revBefore: st, revAfter: s.rev, label: await P.evaluate(() => window.__e2e.getState().source.label) }
  R.push(r); console.log(JSON.stringify(r)); await h.shot(id)
}
await up('U-01', 'fixtures/empty.jpg', 'image/jpeg')
await up('U-02', 'fixtures/child.png', 'image/png')
await up('U-03', 'fixtures/anim.gif', 'image/gif')
await up('U-04', 'fixtures/corrupt.jpg', 'image/jpeg')
await up('U-05', 'fixtures/zero.jpg', 'image/jpeg')
await up('U-06', 'fixtures/huge-noise.jpg', 'image/jpeg')
await up('U-07', 'fixtures/<img src=x onerror=alert(1)>.jpg', 'image/jpeg')
await up('U-08', 'fixtures/empty.jpg', 'text/plain')
console.log('dialogs', dialogs)
h.save('results.json', { R, dialogs, console: h.log })
await h.b.close()
