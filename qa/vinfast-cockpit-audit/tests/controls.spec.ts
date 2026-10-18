import { expect, test } from '@playwright/test'
import { cockpitButton, openDemo, vehicle } from './helpers'

test.describe('vehicle controls (simulated store)', () => {
  test.beforeEach(async ({ page }) => { await openDemo(page) })

  for (const [name, key] of [['Cửa trước trái', 'doors.frontLeft'], ['Cửa sau phải', 'doors.rearRight'], ['Cốp sau', 'rearTrunkOpen'], ['Cổng sạc', 'chargingPortOpen']] as const) {
    test(`${name} label toggles and reverses`, async ({ page }) => {
      const btn = page.locator(`[data-testid=vf-car] button[aria-label^="${name}:"]`)
      const before = await vehicle(page, key)
      await btn.click(); expect(await vehicle(page, key)).toBe(!before); await expect(btn).toHaveAttribute('aria-label', /Mở/)
      await btn.click(); expect(await vehicle(page, key)).toBe(before)
    })
  }

  test('lock button only flips the simulated input, says SIMULATED and sends no lock command', async ({ page }) => {
    const calls: string[] = []
    page.on('request', (r) => { if (r.method() !== 'GET') calls.push(`${r.method()} ${new URL(r.url()).pathname}`) })
    const before = await vehicle(page, 'isLocked')
    const btn = page.locator('[data-testid=cockpit] button[aria-label^="Khoá cửa"]')
    await expect(btn).toHaveAttribute('aria-label', /mô phỏng, không điều khiển xe thật/)
    await btn.click()
    await expect(page.getByTestId('vf-toasts')).toContainText('MÔ PHỎNG')
    expect(await vehicle(page, 'isLocked')).toBe(!before)                              // the simulated input feeds the alert rules
    await btn.click()
    expect(await vehicle(page, 'isLocked')).toBe(before)
    expect(calls.filter((c) => /lock|unlock|door/i.test(c))).toEqual([])               // nothing that could actuate a real vehicle
  })

  test('set temperature steps by 0.5 and is clamped', async ({ page }) => {
    const t0 = await vehicle(page, 'climate.driverTemperature')
    await cockpitButton(page, 'Tăng nhiệt độ đặt bên lái').click()
    expect(await vehicle(page, 'climate.driverTemperature')).toBe(t0 + 0.5)
    for (let i = 0; i < 30; i++) await cockpitButton(page, 'Tăng nhiệt độ đặt bên lái').click()
    expect(await vehicle(page, 'climate.driverTemperature')).toBeLessThanOrEqual(28)
  })

  test('seat heat popover selects a level', async ({ page }) => {
    await page.locator('[data-testid=cockpit] [data-seat-btn] button').click()
    await page.locator('.vf-seatpop [role=radio]', { hasText: 'Cao' }).click()
    expect(await vehicle(page, 'climate.seatHeatDriver')).toBe(3)
  })

  test('car wash mode closes an open door (simulated) and then turns on', async ({ page }) => {
    await page.evaluate(() => (window as any).__vehicle.getState().toggleDoor('frontLeft'))
    await page.getByTestId('vf-modewidget').click()
    await page.locator('[data-testid=vf-carmode] [data-mode=wash][role=radio]').click()
    const wash = page.locator('[data-testid=vf-carmode] [role=switch][aria-label="Chế độ rửa xe"]')
    await expect(wash).toBeEnabled()
    await wash.click()
    await expect(wash).toHaveAttribute('aria-checked', 'true')
    expect(await page.evaluate(() => Object.values((window as any).__vehicle.getState().doors).some(Boolean))).toBe(false)
  })

  test('all four vehicle modes can be switched on and off', async ({ page }) => {
    await page.getByTestId('vf-modewidget').click()
    for (const [mode, label] of [['camping', 'Chế độ cắm trại'], ['baby', 'Chế độ bé'], ['pet', 'Chế độ thú cưng'], ['wash', 'Chế độ rửa xe']]) {
      await page.locator(`[data-testid=vf-carmode] [data-mode=${mode}][role=radio]`).click()
      const sw = page.locator(`[data-testid=vf-carmode] [role=switch][aria-label="${label}"]`)
      await expect(sw).toBeEnabled()
      await sw.click(); await expect(sw).toHaveAttribute('aria-checked', 'true')
      await sw.click(); await expect(sw).toHaveAttribute('aria-checked', 'false')
    }
  })

  test('map search, route and end route', async ({ page }) => {
    await page.locator('[data-testid=vf-map] .vf-search').click()
    await page.locator('.vf-search-sheet input').fill('Hồ')
    await page.locator('.vf-search-sheet .vf-place').first().click()
    await expect(page.getByTestId('vf-route')).toBeVisible()
    await cockpitButton(page, 'Kết thúc dẫn đường').click()
    await expect(page.getByTestId('vf-route')).toHaveCount(0)
  })
})
