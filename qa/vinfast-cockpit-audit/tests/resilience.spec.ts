import { expect, test } from '@playwright/test'
import { CRITICAL, mockBackend, openDemo, tile } from './helpers'

// Failure injection against a MOCKED backend (page.route). Nothing here touches the production API.
test.describe('resilience (mocked backend)', () => {
  test('state 500 after SAFE -> last-known or unverifiable, never green', async ({ page }) => {
    const m = await mockBackend(page); await openDemo(page)
    // SR-01: a backend SAFE with no analysed source in this browser is shown as "unknown", never as green
    await expect(tile(page)).not.toHaveAttribute('data-tone', 'ok')
    m.override = (_m, p) => (p.endsWith('/state') ? (r) => r.fulfill({ status: 500, body: '{"detail":"x"}' }) : undefined)
    await expect(tile(page)).toContainText(/Dữ liệu cũ|Chưa thể xác minh/, { timeout: 8000 })
    await expect(tile(page)).not.toHaveAttribute('data-tone', 'ok')
  })

  test('older revision never overwrites a newer one', async ({ page }) => {
    const m = await mockBackend(page, { ...CRITICAL.state, revision: 50 }); await openDemo(page)
    await expect(tile(page)).toHaveAttribute('data-tone', 'critical')
    m.state = { ...m.state, risk_level: 'SAFE', rule_id: 'EMPTY_CABIN', revision: 49 }
    await page.waitForTimeout(3000)
    await expect(tile(page)).toHaveAttribute('data-tone', 'critical')
  })

  test('401 -> fresh session with an explanation', async ({ page }) => {
    const m = await mockBackend(page); await openDemo(page)
    let once = false
    m.override = (_m, p) => (p.endsWith('/state') && !once ? async (r) => { once = true; await r.fulfill({ status: 401, body: '{"detail":"bad"}' }) } : undefined)
    await expect(page.locator('.vd-banner')).toContainText('Phiên cũ không còn hợp lệ')
  })

  test('session creation 503 -> visible error, tile not safe', async ({ page }) => {
    const m = await mockBackend(page)
    m.override = (meth, p) => (p === '/sessions' && meth === 'POST' ? (r) => r.fulfill({ status: 503, body: '{"detail":"Service Unavailable"}' }) : undefined)
    await page.goto('/cockpit/vinfast/?debug=1')
    await expect(page.locator('.vd-banner.crit')).toContainText('Không tạo được phiên')
    await expect(tile(page)).not.toHaveAttribute('data-tone', 'ok')
  })

  test('decision_current=false with SAFE is never shown as safe', async ({ page }) => {
    await mockBackend(page, { ...CRITICAL.state, risk_level: 'SAFE', rule_id: 'EMPTY_CABIN', decision_current: false }); await openDemo(page)
    await expect(tile(page)).toContainText('Chưa thể xác minh cabin')
  })

  test('BUG-003: malformed state body must not blank the cockpit', async ({ page }) => {
    const m = await mockBackend(page); await openDemo(page)
    m.override = (_m, p) => (p.endsWith('/state') ? (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }) : undefined)
    await page.waitForTimeout(3000)
    await expect(tile(page)).toBeVisible()
  })

  test('BUG-020: rapid reset clicks create one session', async ({ page }) => {
    test.fail(true, 'BUG-020 open: every click creates and erases a session')
    const m = await mockBackend(page); await openDemo(page)
    const n0 = m.calls.filter((c) => c === 'POST /sessions').length
    for (let i = 0; i < 6; i++) await page.getByTestId('reset').click({ delay: 5 })
    await page.waitForTimeout(2000)
    expect(m.calls.filter((c) => c === 'POST /sessions').length - n0).toBeLessThanOrEqual(1)
  })
})
