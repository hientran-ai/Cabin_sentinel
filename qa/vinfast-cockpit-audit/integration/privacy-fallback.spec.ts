import { expect, test } from '@playwright/test'
import { openDemo } from '../tests/helpers'

test.afterEach(async ({ page }) => {
  await page.evaluate(() => (window as any).__e2eCapture?.stopSource())
  await page.unrouteAll({ behavior: 'wait' })
})

// Response fault injection only: these are not real detector/age measurements.
for (const variant of ['missing-preview', 'missing-box', 'no-detections'] as const) {
  test(`privacy fallback: ${variant} never publishes an unmasked thumb`, async ({ page }) => {
    await page.route('**/observations', async route => {
      const response = await route.fetch(), body = await response.json()
      body.preview = { status: 'UNAVAILABLE', data_url: null }
      if (variant === 'missing-box') body.vision.detections = [{ class: 'person', confidence: .9 }]
      if (variant === 'no-detections') body.vision.detections = []
      await route.fulfill({ response, json: body })
    })
    await openDemo(page)
    await page.getByTestId('scenario-selector').click()
    await page.getByTestId('start-DEMO-05').click()
    await page.getByRole('tab', { name: 'Bằng chứng' }).click()
    const method = variant === 'missing-preview' ? 'HEAD' : 'FULL'
    await expect(page.getByTestId('cm-privacy')).toHaveAttribute('data-method', method)
    await expect(page.getByTestId('cm-privacy')).toContainText('chưa đảm bảo che hết')
    await expect(page.getByTestId('cm-frame')).toBeVisible()
    const shared = await page.evaluate(() => {
      const w = window as any, t = w.__e2eCapture.getThumbInfo()
      return { same: t.url === w.__phoneBridge.latestFrame()?.url, obscured: t.obscured, masked: t.masked }
    })
    expect(shared).toEqual({ same: true, obscured: method === 'FULL', masked: method === 'HEAD' })
  })
}
