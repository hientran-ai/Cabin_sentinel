// Browser E2E for the final integration: real backend (YOLO + YuNet + rules), real
// production frontend, Chromium fake camera fed by a public sample image.
// Evidence keeps metadata, hashes and screenshots only — never image bytes or credentials.
//
//   PLAYWRIGHT_CORE=/path/to/playwright-core FAKE_VIDEO=/path/frame.mjpeg FACE_BOXES='[[x1,y1,x2,y2],…]' \
//   EVIDENCE_DIR=/path/to/evidence [CHROMIUM_PATH=/path/to/chrome] node scripts/e2e-final-integration.mjs
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const FRONTEND = process.env.FRONTEND_URL || 'http://127.0.0.1:5183'
const API = process.env.API_URL || 'http://127.0.0.1:7863'
const OUT = process.env.EVIDENCE_DIR
const FACE_BOXES = JSON.parse(process.env.FACE_BOXES || '[]')
const VALID_IMAGE = process.env.VALID_IMAGE
if (!OUT || !process.env.FAKE_VIDEO) throw new Error('EVIDENCE_DIR and FAKE_VIDEO are required')
mkdirSync(OUT, { recursive: true })

const receipt = { started_at: new Date().toISOString(), frontend: FRONTEND, api: API, scenarios: {}, notes: [] }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const check = (name, ok, detail = {}) => { receipt.scenarios[name] = { passed: Boolean(ok), ...detail }; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`) }

// Records camera call metadata in the page. Image data is reduced to a SHA-256 prefix.
const recorder = () => {
  window.__frames = []; window.__calls = []
  const original = window.fetch.bind(window)
  window.fetch = async (...args) => {
    const url = String(args[0]); const method = (args[1]?.method || 'GET').toUpperCase(); const started = performance.now()
    const response = await original(...args)
    const kind = url.includes('/gradio_api/upload') ? 'upload' : url.includes('/gradio_api/call/') ? `${method === 'GET' ? 'result' : 'call'}:${url.split('/call/')[1].split('/')[0]}` : url.includes('/api/v1/demo/analyze') ? 'analyze' : null
    if (kind) {
      const entry = { kind, status: response.status, started_ms: Math.round(started) }
      window.__calls.push(entry)
      if (kind === 'result:camera_frame') {
        response.clone().text().then(async text => {
          entry.duration_ms = Math.round(performance.now() - started)
          const raw = text.split(/\r?\n\r?\n/).find(x => x.includes('event: complete'))?.split(/\r?\n/).find(x => x.startsWith('data:'))?.slice(5)
          if (!raw) return
          const s = JSON.parse(raw)[0]; const p = s.preview || {}
          let previewSha
          if (p.data_url) previewSha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p.data_url)))].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('')
          window.__frames.push({ at: Date.now(), sequence: s.frame?.sequence, captured_at: s.frame?.captured_at, risk: s.risk_level, rule: s.rule_id, current: s.decision_current,
            yolo_ms: s.frame?.latency_ms, detections: (s.vision_detections || []).map(d => d.class), actions: (s.actions || []).map(a => `${a.tool}:${a.status}`),
            preview: { status: p.status, method: p.method, sequence: p.sequence, faces: p.detected_faces, masked: p.masked_regions, privacy_ms: p.latency_ms, sha256_prefix: previewSha },
            result_wait_ms: entry.duration_ms, error: s.code })
        }).catch(() => {})
      } else entry.duration_ms = Math.round(performance.now() - started)
    }
    return response
  }
}

// Visible-DOM privacy audit: raw capture must never be rendered.
const privacyAudit = faceBoxes => {
  const rect = el => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } }
  const videos = [...document.querySelectorAll('video')].map(v => { const cs = getComputedStyle(v); return { hidden: v.hidden, display: cs.display, visibility: cs.visibility, opacity: cs.opacity, ...rect(v), has_stream: Boolean(v.srcObject) } })
  const images = [...document.querySelectorAll('img')].map(i => ({ src_scheme: i.src.split(':')[0], ...rect(i) }))
  const canvas = document.querySelector('.realtime-preview canvas')
  const result = { videos, images, canvas: null, video_visible: videos.some(v => !v.hidden && v.display !== 'none' && v.w > 0 && v.h > 0) }
  if (!canvas) return result
  const cs = getComputedStyle(canvas)
  result.canvas = { hidden: canvas.hidden, display: cs.display, filter: cs.filter, width: canvas.width, height: canvas.height, ...rect(canvas) }
  const ctx = canvas.getContext('2d'); const visible = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  result.canvas.corner_rgba = [...visible.slice(0, 4)]
  const video = document.querySelector('.realtime-preview video')
  if (video?.videoWidth && canvas.width === 640) {
    const raw = document.createElement('canvas'); raw.width = canvas.width; raw.height = canvas.height
    const rc = raw.getContext('2d'); rc.drawImage(video, 0, 0, raw.width, raw.height)
    const rawData = rc.getImageData(0, 0, raw.width, raw.height).data
    const diff = (x1, y1, x2, y2) => { let sum = 0, n = 0; for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) { const i = (y * raw.width + x) * 4; sum += Math.abs(rawData[i] - visible[i]) + Math.abs(rawData[i + 1] - visible[i + 1]) + Math.abs(rawData[i + 2] - visible[i + 2]); n += 3 } return +(sum / n).toFixed(2) }
    // Face interiors vs. a face-free band at the bottom of the frame (no boxes drawn there for this sample).
    result.pixel_diff = { faces: faceBoxes.map(([x1, y1, x2, y2]) => diff(x1 + 6, y1 + 6, x2 - 6, y2 - 6)), background_band: diff(20, 440, 620, 470) }
  }
  return result
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${process.env.FAKE_VIDEO}`] })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['camera'] })
await context.addInitScript(recorder)
const page = await context.newPage()
const consoleErrors = []
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })

try {
  // Scenario 1 — normal camera
  await page.goto(`${FRONTEND}/#live-cabin`)
  await page.getByText('Contract camera phù hợp').waitFor({ timeout: 30000 })
  const preStart = await page.evaluate(privacyAudit, FACE_BOXES)
  await page.locator('.camera-consent input').check()
  await page.locator('.camera-controls').getByRole('button', { name: 'Bật camera' }).click()
  await page.locator('.realtime-preview .live-chip', { hasText: 'YOLO · frame' }).waitFor({ timeout: 60000 })
  await page.getByText(/Privacy: \d+ mặt phát hiện/).waitFor({ timeout: 30000 })
  await sleep(2500)
  const normal = await page.evaluate(privacyAudit, FACE_BOXES)
  const hero = await page.locator('.hero-status').innerText()
  const actions = await page.locator('.action-panel').innerText()
  const frames1 = await page.evaluate(() => window.__frames.slice())
  await page.screenshot({ path: join(OUT, 'normal-camera.png'), fullPage: false })
  const lastFrame = frames1.at(-1) || {}
  check('1_normal_camera', !normal.video_visible && !preStart.video_visible && normal.canvas?.filter === 'none' && /CRITICAL/.test(hero) &&
    lastFrame.preview?.status === 'PROCESSED' && lastFrame.preview?.faces >= 1 && /simulated|Mô phỏng/i.test(actions) && /PENDING_CONFIRMATION|pending/i.test(actions) &&
    normal.pixel_diff && normal.pixel_diff.faces.every(d => d > normal.pixel_diff.background_band * 3), {
    hero: hero.split('\n').slice(0, 3), actions_panel: actions.split('\n').filter(Boolean).slice(0, 10), last_frame: lastFrame, frames_seen: frames1.length,
    privacy_before_start: preStart, privacy_running: normal,
  })

  // Scenario 2 — backend outage (browser cannot reach the camera API)
  await page.route('**/gradio_api/**', route => route.abort('connectionrefused'))
  await page.locator('.cabin-panel .form-error').waitFor({ timeout: 30000 })
  await sleep(3500)
  const outage = await page.evaluate(privacyAudit, FACE_BOXES)
  const outageHero = await page.locator('.hero-status').innerText()
  const outageError = await page.locator('.cabin-panel .form-error').innerText()
  await page.screenshot({ path: join(OUT, 'backend-outage.png') })
  const blank = outage.canvas && (outage.canvas.hidden || JSON.stringify(outage.canvas.corner_rgba) === JSON.stringify([39, 59, 62, 255]))
  check('2_backend_outage', !outage.video_visible && blank && /UNKNOWN/.test(outageHero) && /Current decision unavailable/.test(outageHero), {
    hero: outageHero.split('\n').slice(0, 3), camera_error: outageError, privacy: outage, preview_blank: blank,
  })

  // Scenario 3 — recovery
  const beforeRecovery = await page.evaluate(() => window.__frames.length)
  await page.unroute('**/gradio_api/**')
  await page.waitForFunction(n => window.__frames.length > n + 1 && window.__frames.at(-1).preview?.status === 'PROCESSED', beforeRecovery, { timeout: 60000 })
  await page.locator('.realtime-preview .live-chip', { hasText: 'YOLO · frame' }).waitFor({ timeout: 30000 })
  await sleep(1500)
  const recovered = await page.evaluate(privacyAudit, FACE_BOXES)
  const recoveredHero = await page.locator('.hero-status').innerText()
  const errorsAfter = await page.locator('.cabin-panel .form-error').count()
  await page.screenshot({ path: join(OUT, 'backend-recovery.png') })
  check('3_backend_recovery', errorsAfter === 0 && /CRITICAL/.test(recoveredHero) && !recovered.video_visible && recovered.pixel_diff?.faces.every(d => d > recovered.pixel_diff.background_band * 3), {
    hero: recoveredHero.split('\n').slice(0, 3), camera_error_elements: errorsAfter, privacy: recovered,
  })

  // Scenario 4 — late (stale) response: hold one camera_frame result for 4 s (> 3 s capture TTL)
  let held = false
  await page.route('**/gradio_api/call/camera_frame/**', async route => {
    if (!held && route.request().method() === 'GET') { held = true; await sleep(4000) }
    await route.continue()
  })
  await page.waitForFunction(() => true)
  await sleep(3500)
  const during = await page.evaluate(privacyAudit, FACE_BOXES)
  const duringHero = await page.locator('.hero-status').innerText()
  await sleep(1500)
  const lateFrames = await page.evaluate(() => window.__frames.slice(-3))
  await page.unroute('**/gradio_api/call/camera_frame/**')
  await page.waitForFunction(() => window.__frames.at(-1)?.result_wait_ms < 3000, null, { timeout: 30000 })
  await sleep(1500)
  const afterLateHero = await page.locator('.hero-status').innerText()
  const duringBlank = during.canvas && JSON.stringify(during.canvas.corner_rgba) === JSON.stringify([39, 59, 62, 255])
  check('4_stale_response', held && duringBlank && /UNKNOWN/.test(duringHero) && /CRITICAL/.test(afterLateHero), {
    held_one_result_ms: 4000, preview_blank_while_late: duringBlank, hero_while_late: duringHero.split('\n').slice(0, 2), late_frames: lateFrames,
    hero_after: afterLateHero.split('\n').slice(0, 2),
  })
  const allFrames = await page.evaluate(() => window.__frames.slice())
  const calls = await page.evaluate(() => window.__calls.slice())

  // Stop camera before switching modes
  await page.locator('.camera-controls').getByRole('button', { name: 'Tắt camera' }).click()
  await sleep(1500)
  const stopped = await page.evaluate(privacyAudit, FACE_BOXES)
  check('camera_stop_hides_preview', !stopped.video_visible && (stopped.canvas === null || stopped.canvas.hidden) && stopped.videos.every(v => !v.has_stream), { privacy: stopped })

  // Scenario 6 — corrupt upload
  await page.locator('#demo-image').setInputFiles({ name: 'corrupt.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('this is not a jpeg at all '.repeat(40)) })
  await page.getByRole('button', { name: /Analyze with CabinSentinel/ }).click()
  await page.locator('.demo-panel .form-error').waitFor({ timeout: 30000 })
  const corruptError = await page.locator('.demo-panel .form-error').innerText()
  const corruptCalls = await page.evaluate(() => window.__calls.filter(c => c.kind === 'analyze'))
  check('6_corrupt_upload', corruptCalls.length === 1 && corruptCalls[0].status === 422 && /decoded|invalid/i.test(corruptError), { http: corruptCalls, ui_error: corruptError })

  // Scenario 7 — duplicate submission of a valid image
  await page.locator('#demo-image').setInputFiles({ name: 'cabin.jpg', mimeType: 'image/jpeg', buffer: readFileSync(VALID_IMAGE) })
  await page.locator('#demo-scenario').selectOption('hot_locked')
  const submit = page.getByRole('button', { name: /Analyze with CabinSentinel/ })
  await submit.evaluate(button => { button.click(); button.click(); button.click() })
  await page.waitForFunction(() => window.__calls.filter(c => c.kind === 'analyze').length >= 2 && !document.querySelector('.analyze-button .spin'), null, { timeout: 90000 })
  await sleep(2000)
  const uploadCalls = await page.evaluate(() => window.__calls.filter(c => c.kind === 'analyze'))
  const uploadHero = await page.locator('.hero-status').innerText()
  check('7_duplicate_submission', uploadCalls.length === 2 && uploadCalls[1].status === 200 && /CRITICAL/.test(uploadHero), {
    analyze_requests_total: uploadCalls.length, note: 'request 1 = corrupt upload (422); triple click on the valid image produced exactly one request', http: uploadCalls, hero: uploadHero.split('\n').slice(0, 2),
  })
  await page.screenshot({ path: join(OUT, 'image-upload.png') })

  // Scenario 5 — multi-vehicle switch with a late response for the previous vehicle
  await page.route('**/api/v1/vehicles/VF8-DEMO-01/state', async route => { await sleep(3000); await route.continue() })
  await page.goto(`${FRONTEND}/#fleet`)
  await page.getByLabel('Role').selectOption('admin')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: 'Select VF5-DEMO-03' }).waitFor()
  await sleep(300)
  await page.getByRole('button', { name: 'Select VF5-DEMO-03' }).click()
  const seen = []
  for (let i = 0; i < 25; i++) {
    seen.push(await page.evaluate(() => ({ id: document.querySelector('.vehicle-detail')?.getAttribute('data-vehicle-id'), text: document.querySelector('[data-testid=vehicle-explanation]')?.textContent || null })))
    await sleep(200)
  }
  await page.unroute('**/api/v1/vehicles/VF8-DEMO-01/state')
  const fleetRows = await page.locator('.fleet-row:not(.fleet-head)').allInnerTexts()
  await page.screenshot({ path: join(OUT, 'multi-vehicle.png'), fullPage: true })
  const leaked = seen.some(s => s.id !== 'VF5-DEMO-03' || (s.text && /39\.2/.test(s.text)))
  check('5_switch_vehicle', !leaked && seen.at(-1).text && /24\.0°C/.test(seen.at(-1).text), { samples: seen.filter((s, i) => i % 5 === 0), fleet_rows: fleetRows.map(r => r.replace(/\n/g, ' | ')) })

  // Guardian flow — owner creates a trip and records entry; guardian reads status in a separate page
  await page.getByRole('button', { name: /Sign out/ }).click()
  await page.getByLabel('Role').selectOption('owner')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: 'Select VF9-DEMO-02' }).click()
  await page.getByRole('button', { name: /Create trip/ }).click()
  const card = page.locator('.trip-card').first()
  await card.waitFor()
  const codes = await card.locator('code').allInnerTexts()
  const [tripId, guardianToken] = codes
  const guardian = await context.newPage()
  await guardian.goto(`${FRONTEND}/#guardian`)
  await guardian.getByLabel('Trip ID').fill(tripId)
  await guardian.getByLabel('Guardian token').fill(guardianToken)
  await guardian.getByRole('button', { name: 'Check status' }).click()
  await guardian.getByTestId('child-status').filter({ hasText: 'UNKNOWN' }).waitFor()
  const enteredButton = card.getByRole('button', { name: /Child entered/ })
  await enteredButton.evaluate(button => { button.click(); button.click() })
  await guardian.getByTestId('child-status').filter({ hasText: 'INSIDE' }).waitFor({ timeout: 15000 })
  await guardian.screenshot({ path: join(OUT, 'guardian-flow.png') })
  const guardianText = await guardian.locator('.guardian-card').innerText()
  const tripEvents = await (await fetch(`${API}/api/v1/guardian/trips/${tripId}/child-status`, { headers: { Authorization: `Bearer ${guardianToken}` } })).json()
  const ownerOther = await fetch(`${API}/api/v1/vehicles`, { headers: { Authorization: `Bearer ${guardianToken}` } })
  check('guardian_flow', /INSIDE/.test(guardianText) && tripEvents.event_count === 1 && tripEvents.identity_verified === false && ownerOther.status === 403 && guardian.url().indexOf(guardianToken) === -1, {
    guardian_card: guardianText.split('\n').filter(Boolean).slice(0, 6), event_count_after_double_click: tripEvents.event_count, guardian_cannot_list_vehicles: ownerOther.status,
  })
  await guardian.close()

  receipt.camera_frames = allFrames
  receipt.camera_calls_summary = Object.entries(calls.reduce((acc, c) => { (acc[c.kind] ||= []).push(c.duration_ms); return acc }, {}))
    .map(([kind, durations]) => ({ kind, n: durations.length, median_ms: durations.filter(Number.isFinite).sort((a, b) => a - b)[Math.floor(durations.length / 2)] }))
} catch (error) {
  receipt.error = String(error?.stack || error)
  await page.screenshot({ path: join(OUT, 'e2e-failure.png') }).catch(() => {})
  console.error(error)
} finally {
  receipt.console_errors = consoleErrors
  receipt.finished_at = new Date().toISOString()
  receipt.passed = !receipt.error && Object.values(receipt.scenarios).every(s => s.passed)
  writeFileSync(join(OUT, 'browser-receipt.json'), JSON.stringify(receipt, null, 2))
  await browser.close()
  console.log(receipt.passed ? 'ALL PASS' : 'SOME FAILED')
  process.exitCode = receipt.passed ? 0 : 1
}
