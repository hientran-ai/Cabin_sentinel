import { expect, test } from '@playwright/test'

test('one demo entry opens eight video scenarios plus the simulated ones and returns to Cockpit', async ({ page }) => {
  await page.goto('/cockpit/vinfast/?debug=1')
  const entry = page.getByRole('button', { name: 'Trải nghiệm tình huống', exact: true })
  await expect(entry).toBeVisible({ timeout: 5000 })
  await entry.click()
  const dialog = page.getByRole('dialog', { name: 'Trải nghiệm tình huống' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('[data-scenario-id^="DEMO-"]')).toHaveCount(8)                    // the eight clips
  await expect(dialog.locator('article.vs-sim[data-scenario-id]')).toHaveCount(2)                 // simulated scenarios, listed apart from the clips
  for (let n = 1; n <= 8; n++) await expect(dialog.locator(`[data-scenario-id="DEMO-0${n}"] img`)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(entry).toBeFocused()
})
