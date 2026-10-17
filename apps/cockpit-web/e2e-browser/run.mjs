// Multi-step CDP scenario on ONE page load (same session). Usage: node e2e-run.mjs <w> <h> <url> <steps.json>
// steps: [{ js, wait, shot, clip? }]  js runs in the page; shot = file name in shots/
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const [w, h, url, stepsFile] = process.argv.slice(2)
const steps = JSON.parse(readFileSync(stepsFile, 'utf8'))
const dir = process.env.SHOT_DIR || '.'
const profile = mkdtempSync(join(tmpdir(), 'cdp-'))
const port = 9300 + Math.floor(Math.random() * 500)
const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--use-angle=metal', '--enable-gpu-rasterization', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', ...(process.env.CHROME_FLAGS ? process.env.CHROME_FLAGS.split(' ') : []), `--window-size=${w},${h}`, 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page') } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0; const pending = new Map(); const logs = []
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300)) })
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Runtime.enable'); await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false }); await send('Page.enable')
await send('Page.navigate', { url }); await sleep(6000)
const helpers = `window.__click=(t,root)=>{const r=root?document.querySelector(root):document;const b=[...r.querySelectorAll('button')].find(x=>x.textContent.includes(t)&&!x.disabled);if(!b)throw new Error('no enabled button: '+t);b.click();return true};window.__text=(sel)=>document.querySelector(sel)?.innerText.replace(/\\n+/g,' | ');window.__pdoc=()=>document.querySelector('[data-testid=phone] iframe').contentDocument;window.__pclick=(t)=>{const b=[...__pdoc().querySelectorAll('button,a')].find(x=>x.textContent.includes(t)&&!x.disabled);if(!b)throw new Error('phone: no '+t);b.click();return true};window.__ptext=()=>__pdoc().body.innerText.replace(/\\n+/g,' | ').slice(0,900);window.__sleep=(ms)=>new Promise(r=>setTimeout(r,ms));`
await send('Runtime.evaluate', { expression: helpers })
for (const s of steps) {
  if (s.upload) { const doc = await send('DOM.getDocument', {}); const q = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '[data-testid=still-input]' }); await send('DOM.setFileInputFiles', { files: [s.upload], nodeId: q.result.nodeId }); console.log('uploaded', s.upload.split('/').pop()) }
  if (s.resize) { await send('Emulation.setDeviceMetricsOverride', { width: s.resize[0], height: s.resize[1], deviceScaleFactor: 1, mobile: false }); await sleep(900) }
  if (s.js) { const r = await send('Runtime.evaluate', { expression: `(async()=>{${s.js}})()`, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) logs.push('STEP ' + (s.note ?? '') + ' ' + JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails).slice(0, 250)); else if (r.result?.result?.value !== undefined) console.log((s.note ?? s.shot ?? 'step') + ':', JSON.stringify(r.result.result.value)) }
  if (s.wait) await sleep(s.wait)
  if (s.shot) { const shot = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(dir, s.shot), Buffer.from(shot.result.data, 'base64')); console.log('saved', s.shot) }
}
if (logs.length) console.log([...new Set(logs)].join('\n'))
ws.close(); chrome.kill(); await sleep(300); rmSync(profile, { recursive: true, force: true })
