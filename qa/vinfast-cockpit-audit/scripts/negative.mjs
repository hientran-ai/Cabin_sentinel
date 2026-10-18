// Phase 5: failure injection against a MOCKED backend (page.route). Production is never disrupted.
import { chromium } from 'playwright'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
const BASE = 'https://c4-app-068.cabinsentinel-platform.workers.dev/cockpit/vinfast/?debug=1'
const OUT = 'evidence/negative'; mkdirSync(OUT, { recursive: true })
const CRIT = JSON.parse(readFileSync('fixtures/critical.json')), SAFE = JSON.parse(readFileSync('fixtures/safe.json'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await chromium.launch()
const R = []
async function mk(behave) {
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await ctx.newPage()
  const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)))
  const calls = []
  const m = { rev: 1, state: SAFE.state, ...behave }
  await page.route('**/api/v1/e2e/**', async (route) => {
    const u = new URL(route.request().url()), p = u.pathname.replace('/api/v1/e2e', ''), meth = route.request().method()
    calls.push(`${meth} ${p.replace(/sessions\/[^/]+/, 'S')}`)
    const j = (status, body, headers = {}) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers })
    const o = m.override?.(meth, p, m); if (o) return o(route, j)
    if (p === '/status') return j(200, CRIT.status)
    if (p === '/sessions' && meth === 'POST') return j(200, { session_id: 'mock-' + Math.random().toString(16).slice(2, 10), session_token: 'tok', vehicle_id: 'v' })
    if (p.endsWith('/state')) return j(200, { ...m.state, session_id: p.split('/')[2], revision: m.state.revision, server_time: new Date().toISOString() })
    if (p.endsWith('/notifications')) return j(200, m.notes ?? [])
    if (p.includes('/history')) return j(200, { items: [], next_after: 0 })
    if (meth === 'DELETE') return j(200, { deleted: true })
    return j(200, { committed: null })
  })
  await page.goto(BASE)
  await page.waitForSelector('[data-testid=vf-cabin-tile]')
  const snap = () => page.evaluate(() => ({ tile: document.querySelector('[data-testid=vf-cabin-tile]')?.innerText.replace(/\s+/g, ' ').slice(0, 120), tone: document.querySelector('[data-testid=vf-cabin-tile]')?.dataset.tone, banners: [...document.querySelectorAll('.vd-banner')].map((x) => x.innerText).join(' | '), sess: document.querySelector('.vd-sess')?.textContent, conn: window.__e2e?.getState().connection, prompt: [...document.querySelectorAll('[data-testid=vf-prompt]')].map((x) => x.innerText.replace(/\s+/g, ' ')).join(' || '), root: document.getElementById('root')?.children.length }))
  return { ctx, page, calls, errs, m, snap }
}
async function T(id, name, behave, body) {
  const t = await mk(behave)
  try { const r = await body(t); R.push({ id, name, status: r.pass ? 'PASS' : 'FAIL', detail: r.detail, errs: t.errs }) }
  catch (e) { R.push({ id, name, status: 'ERROR', detail: String(e).slice(0, 300), errs: t.errs }) }
  await t.page.screenshot({ path: `${OUT}/${id}.png` }).catch(() => {})
  const x = R.at(-1); console.log(x.status.padEnd(5), id, name, '|', String(x.detail).slice(0, 260), x.errs.length ? ' PAGEERR ' + x.errs.join(';') : '')
  await t.ctx.close()
}
const notSafe = (s) => s.tone !== 'ok' && !/Chưa thấy nguy cơ/.test(s.tile ?? '') || /Dữ liệu cũ/.test(s.tile)
await T('N-00', 'Mock baseline: SAFE fixture renders as "Chưa thấy nguy cơ" with SR-01 caution', {}, async ({ snap }) => { await sleep(3000); const s = await snap(); return { pass: s.tone === 'ok' && /bỏ sót|không có nghĩa/.test(s.tile), detail: JSON.stringify(s) } })
await T('N-01', 'GET /status 500', { override: (meth, p) => p === '/status' && ((r, j) => j(500, { detail: 'boom' })) }, async ({ snap }) => { await sleep(3000); const s = await snap(); return { pass: /boom/.test(s.banners), detail: JSON.stringify(s) } })
await T('N-02', 'Model not ready (status.model.ready=false)', { override: (meth, p) => p === '/status' && ((r, j) => j(200, { ...CRIT.status, model: { ready: false } })) }, async ({ snap }) => { await sleep(3000); const s = await snap(); return { pass: /Model suy luận chưa sẵn sàng/.test(s.banners), detail: JSON.stringify(s) } })
await T('N-03', 'POST /sessions 503 -> visible error, no SAFE; recovery when backend returns', { failSessions: true, override: (meth, p, m) => p === '/sessions' && m.failSessions && ((r, j) => j(503, { detail: 'Service Unavailable' })) }, async ({ snap, m, page, calls }) => { await sleep(3000); const a = await snap(); m.failSessions = false; await sleep(8000); const b2 = await snap(); const retried = calls.filter((c) => c === 'POST /sessions').length; await page.click('[data-testid=reset]'); await sleep(3000); const c = await snap(); return { pass: /Không tạo được phiên/.test(a.banners) && notSafe(a), detail: `during: ${JSON.stringify(a)} || 8s after backend recovered (auto-retry POST /sessions count=${retried}): ${b2.sess} banners="${b2.banners}" || after Đặt lại: ${c.sess} banners="${c.banners}"` } })
await T('N-04', 'GET /state 500 after SAFE -> stale/last-known within 5 s, never green', {}, async ({ snap, m }) => { await sleep(3000); const a = await snap(); m.override = (meth, p) => p.endsWith('/state') && ((r, j) => j(500, { detail: 'db down' })); const t0 = Date.now(); let s; for (let i = 0; i < 10; i++) { await sleep(500); s = await snap(); if (s.conn === 'lost') break } const dt = Date.now() - t0; return { pass: a.tone === 'ok' && s.conn === 'lost' && notSafe(s), detail: `before tone=${a.tone}; lost after ${dt} ms; ${JSON.stringify(s)}` } })
await T('N-05', 'GET /state 401 -> new session + note', {}, async ({ snap, m, calls }) => { await sleep(2500); let once = false; m.override = (meth, p) => p.endsWith('/state') && !once && ((r, j) => { once = true; return j(401, { detail: 'bad token' }) }); await sleep(3000); const s = await snap(); return { pass: /Phiên cũ không còn hợp lệ/.test(s.banners) && calls.filter((c) => c === 'POST /sessions').length === 2, detail: `${JSON.stringify(s)} sessions=${calls.filter((c) => c === 'POST /sessions').length}` } })
await T('N-06', 'GET /state 429 Retry-After:5', {}, async ({ snap, m, calls }) => { await sleep(2500); m.override = (meth, p) => p.endsWith('/state') && ((r, j) => j(429, { detail: 'Too Many Requests' }, { 'Retry-After': '5' })); const n0 = calls.length; await sleep(5000); const s = await snap(); const stateCalls = calls.slice(n0).filter((c) => c.endsWith('/state')).length; return { pass: notSafe(s), detail: `${JSON.stringify(s)}; /state calls in 5 s while 429 = ${stateCalls} (Retry-After ignored if >1)` } })
await T('N-07', 'Out-of-order: CRITICAL rev 50 then SAFE rev 49 must not overwrite', {}, async ({ snap, m }) => { m.state = { ...CRIT.state, revision: 50 }; await sleep(3000); const a = await snap(); m.state = { ...SAFE.state, revision: 49 }; await sleep(3000); const b2 = await snap(); return { pass: /Nguy hiểm/.test(a.tile) && /Nguy hiểm/.test(b2.tile), detail: `rev50: ${a.tile} || rev49 SAFE served: ${b2.tile}` } })
await T('N-08', 'GET /state returns {} (empty object, 200)', {}, async ({ snap, m, page }) => { m.override = (meth, p) => p.endsWith('/state') && ((r, j) => j(200, {})); await sleep(4000); const s = await snap(); return { pass: s.root > 0 && notSafe(s), detail: JSON.stringify(s) } })
await T('N-09', 'GET /state returns non-JSON 200 (HTML)', {}, async ({ snap, m }) => { await sleep(2000); m.override = (meth, p) => p.endsWith('/state') && ((r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html>maintenance</html>' })); await sleep(4000); const s = await snap(); return { pass: s.root > 0 && notSafe(s), detail: JSON.stringify(s) } })
await T('N-10', 'GET /state hangs 12 s (client timeout 10 s)', {}, async ({ snap, m }) => { await sleep(2500); m.override = (meth, p) => p.endsWith('/state') && (async (r, j) => { await sleep(12000); return j(200, SAFE.state).catch(() => {}) }); await sleep(7000); const s = await snap(); return { pass: notSafe(s), detail: `7 s into hang: ${JSON.stringify(s)}` } })
await T('N-11', 'State with null risk fields (partial) - risk_level missing', {}, async ({ snap, m }) => { m.state = { ...SAFE.state, risk_level: undefined, revision: 60 }; await sleep(3500); const s = await snap(); return { pass: s.root > 0 && notSafe(s), detail: JSON.stringify(s) } })
await T('N-12', 'Rapid 6x "Đặt lại" clicks: sessions created / erased', {}, async ({ page, calls, snap }) => { await sleep(2500); const n0 = calls.filter((c) => c === 'POST /sessions').length; for (let i = 0; i < 6; i++) await page.click('[data-testid=reset]', { delay: 5 }); await sleep(3000); const n = calls.filter((c) => c === 'POST /sessions').length - n0, d = calls.filter((c) => c.startsWith('DELETE')).length; const s = await snap(); return { pass: n <= 2, detail: `POST /sessions=${n}, DELETE=${d}; final ${s.sess}` } })
await T('N-13', 'Reload mid-session keeps the same session (sessionStorage) and does not resume a source', {}, async ({ page, snap }) => { await sleep(2500); const a = (await snap()).sess; await page.reload(); await page.waitForSelector('[data-testid=vf-cabin-tile]'); await sleep(2500); const b2 = (await snap()).sess; return { pass: a === b2, detail: `${a} -> ${b2}` } })
await T('N-14', 'Notifications 500 while state OK: state still current', {}, async ({ snap, m }) => { m.state = { ...CRIT.state, revision: 70 }; m.override = (meth, p) => p.endsWith('/notifications') && ((r, j) => j(500, { detail: 'x' })); await sleep(3500); const s = await snap(); return { pass: /Nguy hiểm/.test(s.tile) && s.conn === 'ok', detail: JSON.stringify(s) } })
await T('N-15', 'Backend says decision_current=false with SAFE -> must not show green', {}, async ({ snap, m }) => { m.state = { ...SAFE.state, decision_current: false, revision: 80 }; await sleep(3500); const s = await snap(); return { pass: notSafe(s), detail: JSON.stringify(s) } })
await T('N-16', 'Unknown risk_level value from backend ("FATAL")', {}, async ({ snap, m }) => { m.state = { ...CRIT.state, risk_level: 'FATAL', revision: 90 }; await sleep(3500); const s = await snap(); return { pass: s.root > 0 && notSafe(s), detail: JSON.stringify(s) } })
writeFileSync(`${OUT}/results.json`, JSON.stringify(R, null, 1))
console.log(R.reduce((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {}))
await b.close()
