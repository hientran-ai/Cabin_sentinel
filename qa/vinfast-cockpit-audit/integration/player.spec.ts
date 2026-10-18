import { expect, test } from '@playwright/test'

test('falls back to actual WebM frames when H.264 capability is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.canPlayType
    HTMLMediaElement.prototype.canPlayType = function (type) { return /mp4|avc/i.test(type) ? '' : original.call(this, type) }
  })
  await page.goto('/cockpit/vinfast/?debug=1')
  await page.waitForFunction(() => (window as any).__e2eCapture && (window as any).__e2e?.getState().session)
  await page.evaluate(() => (window as any).__e2eCapture.startClip({ id: 'DEMO-02', label: 'DEMO-02 Cabin trống', file: 'scenarios/videos/empty-cabin.mp4', fallbackFile: 'scenarios/videos/empty-cabin.webm', note: '' }))
  await expect.poll(() => page.evaluate(() => (window as any).__e2eCapture.getVideo()?.currentSrc ?? '')).toContain('.webm')
  await expect.poll(() => page.evaluate(() => (window as any).__e2e.getState().metrics.accepted)).toBeGreaterThan(0)
  expect(await page.evaluate(() => (window as any).__e2e.getState().metrics.lastReply?.vision.source)).toBe('MODEL_INFERENCE')
})
