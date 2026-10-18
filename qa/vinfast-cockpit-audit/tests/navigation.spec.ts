import { expect, test } from '@playwright/test'
import { cockpitButton, openDemo, ui } from './helpers'

const LAUNCHER: [string, string][] = [['Camera', 'camera'], ['Giám sát cabin', 'cabin'], ['Điện thoại', 'phone'], ['Âm nhạc', 'media'], ['Sạc / EV', 'map'], ['Cài đặt', 'vehicle']]

test.describe('cockpit navigation', () => {
  test.beforeEach(async ({ page }) => { await openDemo(page) })

  for (const [label, overlay] of LAUNCHER) {
    test(`launcher "${label}" opens ${overlay} and Escape closes it`, async ({ page }) => {
      if (overlay === 'map') test.fail(true, 'BUG-031 open: the auto-focused search input swallows Escape, map stays open')
      await page.locator(`[data-testid=vf-launcher] button[aria-label="${label}"]`).click()
      await expect.poll(() => ui(page, 'overlay')).toBe(overlay)
      await page.keyboard.press('Escape')
      await expect.poll(() => ui(page, 'overlay')).toBeNull()
    })
  }

  test('quick buttons toggle their panel; Home and the X button close panels', async ({ page }) => {
    await cockpitButton(page, 'Tổng quan xe').click()
    await expect(page.getByTestId('vf-settings')).toBeVisible()
    await cockpitButton(page, 'Tổng quan xe').click()
    await expect.poll(() => ui(page, 'overlay')).toBeNull()
    await cockpitButton(page, 'Thư viện ứng dụng').click()
    await page.locator('[data-testid=cockpit] .vf-close').first().click()
    await expect.poll(() => ui(page, 'overlay')).toBeNull()
    await page.getByTestId('vf-modewidget').click()
    await expect(page.getByTestId('vf-carmode')).toBeVisible()
    await cockpitButton(page, 'Trang chủ').click()
    await expect.poll(() => ui(page, 'overlay')).toBeNull()
  })

  test('cabin detail tabs and phone-only acknowledgement', async ({ page }) => {
    await page.getByTestId('vf-cabin-tile').click()
    await page.getByTestId('vf-tab-intro').click(); await expect(page.getByTestId('vf-cabin-intro')).toBeVisible()
    await page.getByTestId('vf-tab-evidence').click(); await expect(page.getByTestId('vf-evidence')).toContainText('SR-01')
    await page.getByTestId('vf-tab-overview').click()
    await expect(page.getByTestId('vf-cabin-detail').getByRole('button', { name: /Đã xem|Đóng sự cố/ })).toHaveCount(0)
  })

  test('reverse gear opens the rear camera, P closes it', async ({ page }) => {
    await page.evaluate(() => (window as any).__vehicle.getState().setGear('R'))
    await expect.poll(() => ui(page, 'overlay')).toBe('camera')
    await page.evaluate(() => (window as any).__vehicle.getState().setGear('P'))
    await expect.poll(() => ui(page, 'overlay')).toBeNull()
  })

  test('BUG-018: keyboard focus moves into an opened panel', async ({ page }) => {
    test.fail(true, 'BUG-018 open: focus stays on the launcher button behind the panel')
    await cockpitButton(page, 'Tổng quan xe').focus(); await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.vf-panel'))).toBe(true)
  })
})
