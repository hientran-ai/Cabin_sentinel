import { expect, test } from '@playwright/test'
import { openDemo, openDev, state, tile } from './helpers'

test.describe('@smoke application start', () => {
  test('loads, creates a session and never starts as safe', async ({ page }) => {
    const { errors } = await openDemo(page)
    await expect(page).toHaveTitle(/VinFast HMI · CabinSentinel/)
    await expect(page.locator('.vd-head p')).toContainText('giả lập')                       // simulation disclaimer is visible
    await expect(page.locator('.vd-sess')).toContainText(/Phiên [0-9a-f]{8}/)
    await openDev(page)                                                                    // fixtures sit in the developer fold; judges use "Trải nghiệm tình huống"
    await expect(page.getByTestId('scenario-selector')).toBeVisible()
    for (const id of ['sc-child-hot', 'sc-empty', 'sc-blocked', 'sc-lost', 'reset']) await expect(page.getByTestId(id)).toBeVisible()
    await expect(tile(page)).not.toHaveAttribute('data-tone', 'ok')                       // SR-01: no data is not "empty"
    await expect(tile(page)).toContainText(/Chưa (có dữ liệu|thể xác minh)/)
    await expect(page.frameLocator('[data-testid=phone] iframe').locator('body')).toContainText('Không coi là an toàn')
    expect((await state(page))?.risk ?? 'NONE').not.toBe('SAFE')
    expect(errors).toEqual([])
  })

  test('flow bar starts at step 1 and shows 7 stages', async ({ page }) => {
    await openDemo(page)
    const steps = page.getByTestId('flow').locator('li')
    await expect(steps).toHaveCount(7)
    await expect(steps.first()).toHaveAttribute('aria-current', 'step')
  })

  test('fullscreen cockpit view renders without the demo chrome', async ({ page }) => {
    await openDemo(page, '/cockpit/vinfast/?view=cockpit&debug=1')
    await expect(page.getByTestId('scenarios')).toHaveCount(0)
    await expect(tile(page)).toBeInViewport()
  })
})
