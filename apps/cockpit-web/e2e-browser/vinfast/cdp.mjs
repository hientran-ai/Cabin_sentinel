// tiny CDP helper shared by shot/audit
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export async function open(url, w = 1920, h = 1080, extra = []) {
  const profile = mkdtempSync(join(tmpdir(), 'cdp-')), port = 9200 + Math.floor(Math.random() * 700)
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', ...extra, 'about:blank'], { stdio: 'ignore' })
  let t; for (let i = 0; i < 60 && !t; i++) { await sleep(200); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page') } catch {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r))
  let id = 0; const pend = new Map(); const errs = []
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
    if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description?.slice(0, 160) ?? m.params.exceptionDetails.text)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console.error ' + String(m.params.args[0]?.value ?? m.params.args[0]?.description ?? '').slice(0, 140)) })
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
  const ev = async (js) => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${js}})()`, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result?.result?.value }
  await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url }); await sleep(6500)
  const close = async () => { ws.close(); chrome.kill(); await sleep(300); rmSync(profile, { recursive: true, force: true }) }
  return { send, ev, errs, close }
}
