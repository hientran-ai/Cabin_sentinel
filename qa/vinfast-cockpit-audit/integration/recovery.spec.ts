import { expect, test } from '@playwright/test'
import { CRITICAL, mockBackend, openDemo, phone, tile } from '../tests/helpers'

test('critical state interrupts comfort audio (API fixture, not detection evidence)', async ({ page }) => {
  await mockBackend(page, CRITICAL.state); await openDemo(page)
  await page.waitForFunction(() => (window as any).__e2e.getState().state?.risk_level === 'CRITICAL')
  const playing = await page.evaluate(async () => {
    const audio = await import('/cockpit/src/e2e/comfortAudio.ts')
    audio.play('ambient')
    return audio.audioState().playing
  })
  expect(playing).toBeNull()
})

test('phone demo cannot dial emergency services (API fixture, not detection evidence)', async ({ page }) => {
  await mockBackend(page, CRITICAL.state); await openDemo(page)
  await expect(phone(page).locator('.verdict').first()).toBeVisible()
  await expect(phone(page).locator('a[href^="tel:"]')).toHaveCount(0)
})

test('malformed JSON and missing nested state keep cockpit visible and old critical explicit', async ({ page }) => {
  const mock = await mockBackend(page, CRITICAL.state); const { errors } = await openDemo(page)
  await expect(tile(page)).toBeVisible()
  for (const bad of ['{}', 'null', '{ broken', JSON.stringify({ ...CRITICAL.state, freshness: null }), JSON.stringify({ ...CRITICAL.state, risk_level: 'SURPRISE' })]) {
    mock.override = (_m, p) => p.endsWith('/state') ? (r) => r.fulfill({ status: 200, contentType: 'application/json', body: bad }) : undefined
    await expect.poll(() => page.evaluate(() => (window as any).__e2e.getState().connection)).toBe('lost')
    await expect(tile(page)).toBeVisible()
    await expect(page.getByTestId('scenario-selector')).toBeEnabled()
  }
  mock.override = undefined
  await expect.poll(() => page.evaluate(() => (window as any).__e2e.getState().connection)).toBe('ok')
  expect(errors).toEqual([])
})
