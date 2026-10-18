// Shared helpers for exploratory runs against the deployed demo. ?debug=1 only exposes read hooks (window.__e2e etc.).
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
export const BASE = process.env.URL ?? 'https://c4-app-068.cabinsentinel-platform.workers.dev/cockpit/vinfast/'
export async function open({ w = 1920, h = 1080, query = '?debug=1', out, browser = chromium, ctxOpts = {} } = {}) {
  mkdirSync(out, { recursive: true })
  const b = await browser.launch(process.env.CHANNEL ? { channel: process.env.CHANNEL } : {})
  const ctx = await b.newContext({ viewport: { width: w, height: h }, ...ctxOpts })
  const page = await ctx.newPage()
  const log = [], net = []
  const t0 = Date.now()
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push({ t: Date.now() - t0, type: m.type(), text: m.text().slice(0, 240) }) })
  page.on('pageerror', (e) => log.push({ t: Date.now() - t0, type: 'pageerror', text: String(e).slice(0, 240) }))
  page.on('response', (r) => { if (r.url().includes('/api/')) net.push({ t: Date.now() - t0, s: r.status(), m: r.request().method(), u: r.url().replace(/.*\/api\/v1\/e2e/, '').replace(/sessions\/[0-9a-f-]+/, 'S') }) })
  await page.goto(BASE + query)
  await page.waitForSelector('[data-testid="vf-cabin-tile"]', { timeout: 30000 })
  await page.waitForFunction(() => window.__e2e && !window.__e2e.getState().booting && window.__e2e.getState().session, null, { timeout: 30000 })
  const phone = () => page.frames().find((f) => f.url().includes('/phone/'))
  const snap = async () => {
    const s = await page.evaluate(() => {
      const e = window.__e2e.getState(), st = e.state
      const flow = [...document.querySelectorAll('[data-testid=flow] li')].map((li) => li.className[0] + ':' + li.querySelector('b')?.textContent)
      return { session: e.session?.id.slice(0, 8), conn: e.connection, fails: e.failures, rev: st?.revision, risk: st?.risk_level, prev: st?.previous_risk_level, rule: st?.rule_id, occ: st?.occupancy_state, current: st?.decision_current, dq: st?.data_quality?.status, cam: st?.camera_status,
        incident: st?.incident ? `${st.incident.incident_id.slice(0, 8)}:${st.incident.status}${st.incident.acknowledged_at ? ':ACK' : ''}` : null, alert: st?.alert ? `${st.alert.stage}#${st.alert.sequence}` : null,
        dets: st?.last_observation?.vision?.detections?.map((d) => `${d.class}${Math.round(d.confidence * 100)}${d.age_group ? '/' + d.age_group : ''}`).join(',') ?? null,
        vis: st?.freshness?.vision?.status, sen: st?.freshness?.sensor?.status, temp: st?.sensor_snapshot?.temperature, notes: e.notifications.length,
        push: e.notifications[0]?.channels.push.state, feed: e.notifications[0]?.channels.in_app_feed.state, care: st?.care?.status, canCare: st?.care?.can_start,
        source: `${e.source.kind}${e.source.running ? '+' : ''}${e.source.cameraFault ? '!' + e.source.cameraFault : ''}`,
        flow: flow.join(' '),
        tile: document.querySelector('[data-testid=vf-cabin-tile] .main')?.textContent + ' | ' + document.querySelector('[data-testid=vf-cabin-tile] .why')?.textContent,
        prompt: [...document.querySelectorAll('[data-testid=vf-prompt]')].map((x) => x.textContent).join(' || '),
        toasts: [...document.querySelectorAll('[data-testid=vf-toasts] .vf-ctl')].map((x) => x.textContent).join(' / ') }
    })
    try { const f = phone(); s.phone = f ? (await f.evaluate(() => document.querySelector('main, #app, body')?.innerText ?? '')).replace(/\s+/g, ' ').slice(0, 260) : null } catch { s.phone = 'ERR' }
    return s
  }
  const save = (name, data) => writeFileSync(`${out}/${name}`, typeof data === 'string' ? data : JSON.stringify(data, null, 1))
  const shot = (name, full = false) => page.screenshot({ path: `${out}/${name}.png`, fullPage: full })
  return { b, ctx, page, phone, snap, save, shot, log, net, t0 }
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** Poll snap() every second for up to `s` seconds, until pred(snap) holds. Returns the timeline. */
export async function watch(h, s, pred = () => false, label = '') {
  const tl = []
  for (let i = 0; i < s; i++) { const x = await h.snap(); x.t = Math.round((Date.now() - h.t0) / 100) / 10; x.label = label; tl.push(x); if (pred(x)) break; await sleep(1000) }
  return tl
}
