import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { openDemo, tile } from './helpers'

test.describe('accessibility', () => {
  test('keyboard reaches scenarios, cockpit tile and quick controls with a visible focus ring', async ({ page }) => {
    await openDemo(page)
    const seen = new Set<string>()
    for (let i = 0; i < 45; i++) {
      await page.keyboard.press('Tab')
      const f = await page.evaluate(() => { const e = document.activeElement as HTMLElement; const cs = getComputedStyle(e); return { name: e.getAttribute('aria-label') || e.innerText || '', ring: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none' } })
      expect(f.ring, `focus ring on "${f.name}"`).toBe(true); seen.add(f.name.split(':')[0].trim())
    }
    for (const n of ['Đặt lại', 'Giám sát cabin', 'Tổng quan xe']) expect([...seen].some((s) => s.startsWith(n))).toBe(true)
  })

  test('reduced motion: no running animations on the home screen', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1920, height: 1080 } }); const page = await ctx.newPage()
    await openDemo(page); await page.waitForTimeout(1500)
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0)
    await ctx.close()
  })

  test('BUG-016/025: no serious axe violations', async ({ page }) => {
    test.fail(true, 'BUG-016, BUG-025 open')
    await openDemo(page); await page.getByTestId('vf-cabin-tile').click()
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
  })
})

test.describe('responsive', () => {
  for (const [w, h] of [[1920, 1080], [1440, 900]]) {
    test(`${w}x${h}: safety tile and phone above the fold, no horizontal scroll`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage(); await openDemo(page)
      await expect(tile(page)).toBeInViewport(); await expect(page.getByTestId('phone')).toBeInViewport({ ratio: 0.3 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await ctx.close()
    })
  }
  test('BUG-012: 1366x768 keeps the safety tile above the fold', async ({ browser }) => {
    test.fail(true, 'BUG-012 open')
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }); const page = await ctx.newPage(); await openDemo(page)
    await expect(tile(page)).toBeInViewport({ ratio: 1 }); await ctx.close()
  })
  test('fullscreen cockpit fills 1366x768 with no scroll', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }); const page = await ctx.newPage()
    await openDemo(page, '/cockpit/vinfast/?view=cockpit&debug=1')
    await expect(tile(page)).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
    await ctx.close()
  })
})

test.describe('visual regression', () => {
  test('fullscreen cockpit home (masked clock/map/media)', async ({ page }) => {
    await openDemo(page, '/cockpit/vinfast/?view=cockpit&debug=1')
    await page.waitForTimeout(1500)
    await expect(page).toHaveScreenshot('cockpit-home.png', { mask: [page.getByTestId('vf-map'), page.getByTestId('vf-media'), page.locator('.vf-bl-time, .vf-tm-time, .vf-za'), page.getByTestId('vf-cabin-tile').locator('.vf-cap')], animations: 'disabled' })
  })
})
