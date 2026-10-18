import { expect, type Page, type Route } from '@playwright/test'
import { readFileSync } from 'node:fs'

export const DEMO = '/cockpit/vinfast/?debug=1'

/** Open the demo and wait for a backend session (the page creates one on load). */
export async function openDemo(page: Page, path = DEMO, opts: { signedIn?: boolean } = {}) {
  const errors: string[] = []
  // The owner phone now opens on its demo sign-in. Flows that are not about signing in start already signed in (same token the sign-in stores).
  if (opts.signedIn !== false) await page.addInitScript(() => { try { localStorage.setItem('cn.token', 'e2e-session') } catch { /* blocked */ } })
  page.on('pageerror', (e) => { if (!/ResizeObserver loop/.test(String(e))) errors.push(String(e)) })   // WebKit's benign ResizeObserver notice
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('vf-cabin-tile')).toBeVisible()
  await page.waitForFunction(() => (window as any).__e2e && !(window as any).__e2e.getState().booting && (window as any).__e2e.getState().session)
  return { errors }
}

/** Committed backend state as the page holds it (read-only debug hook). */
export const state = (page: Page) => page.evaluate(() => {
  const s = (window as any).__e2e.getState().state
  return s && { risk: s.risk_level as string, rule: s.rule_id as string, occ: s.occupancy_state as string, current: s.decision_current as boolean, incident: s.incident as null | { status: string; acknowledged_at: string | null }, camera: s.camera_status as string | null }
})
export const ui = (page: Page, key: string) => page.evaluate((k) => (window as any).__ui.getState()[k], key)
export const vehicle = (page: Page, path: string) => page.evaluate((p) => p.split('.').reduce((o: any, k) => o?.[k], (window as any).__vehicle.getState()), path)

export async function waitRisk(page: Page, pred: (s: Awaited<ReturnType<typeof state>>) => boolean, timeout = 30_000) {
  await expect.poll(async () => pred(await state(page)), { timeout, intervals: [500] }).toBe(true)
  return state(page)
}
export const tile = (page: Page) => page.getByTestId('vf-cabin-tile')
export const phone = (page: Page) => page.frameLocator('[data-testid=phone] iframe')
export const cockpitButton = (page: Page, label: string) => page.locator(`[data-testid=cockpit] button[aria-label="${label}"]`).first()

/** The scenario fixtures (sc-*), the simulated environment and the traces live in the folded "Dành cho người phát triển" section. */
export async function openDev(page: Page) {
  const head = page.getByTestId('dev').locator('.vd-fold-head').first()
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click()
  await expect(page.getByTestId('scenario-controls')).toBeVisible()
}

export async function openSimEnv(page: Page) {
  await openDev(page)
  const head = page.getByTestId('sim-env').locator('.vd-fold-head')
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click()
}
export const simChip = (page: Page, text: string | RegExp) => page.getByTestId('sim-env').locator('button', { hasText: text }).first()

// ---- mocked backend for resilience tests (production is never disrupted) ---------------------------------------------
const fx = (n: string) => JSON.parse(readFileSync(new URL(`../fixtures/${n}.json`, import.meta.url), 'utf8'))
export const CRITICAL = fx('critical'), SAFE = fx('safe')
export interface Mock { state: any; override?: (method: string, path: string) => ((route: Route) => Promise<void>) | undefined; calls: string[] }
export async function mockBackend(page: Page, initial = SAFE.state): Promise<Mock> {
  const m: Mock = { state: initial, calls: [] }
  await page.route('**/api/v1/e2e/**', async (route) => {
    const u = new URL(route.request().url()), p = u.pathname.replace('/api/v1/e2e', ''), meth = route.request().method()
    m.calls.push(`${meth} ${p.replace(/sessions\/[^/]+/, 'S')}`)
    const o = m.override?.(meth, p); if (o) return o(route)
    const j = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (p === '/status') return j(CRITICAL.status)
    if (p === '/sessions' && meth === 'POST') return j({ session_id: `mock${Math.random().toString(16).slice(2, 10)}`, session_token: 't', vehicle_id: 'v' })
    if (p.endsWith('/state')) return j({ ...m.state, session_id: p.split('/')[2] })
    if (p.endsWith('/notifications')) return j([])
    if (p.includes('/history')) return j({ items: [], next_after: 0 })
    return j({ committed: null, deleted: true })
  })
  return m
}
