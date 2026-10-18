import { open, watch } from './lib.mjs'
import { writeFileSync } from 'node:fs'
const h = await open({ out: 'evidence/fixtures-capture' })
const grab = () => h.page.evaluate(async () => { const s = window.__e2e.getState().session; const g = (p) => fetch(`/api/v1/e2e/sessions/${s.id}${p}`, { headers: { Authorization: `Bearer ${s.token}` } }).then((r) => r.json()); return { state: await g('/state'), notifications: await g('/notifications'), history: await g('/history?after=0'), status: await fetch('/api/v1/e2e/status').then((r) => r.json()) } })
await h.page.click('[data-testid=sc-child-hot]')
await watch(h, 20, (x) => x.risk === 'CRITICAL')
writeFileSync('fixtures/critical.json', JSON.stringify(await grab(), null, 1))
await h.page.click('[data-testid=reset]'); await new Promise((r) => setTimeout(r, 3000))
await h.page.click('[data-testid=sc-empty]')
await watch(h, 25, (x) => x.risk === 'SAFE' && x.current)
writeFileSync('fixtures/safe.json', JSON.stringify(await grab(), null, 1))
await h.b.close()
