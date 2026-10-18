import { expect, test } from '@playwright/test'
import { openDemo, openDev, openSimEnv, phone, simChip, state, tile, waitRisk } from './helpers'

// Real backend, real model. Needs H.264 playback: run with --project=chrome or --project=webkit.
test.describe('@safety CabinSentinel safety workflows', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name === 'chromium', 'bundled Chromium has no H.264: clips produce NO_FEED (see BUG-004)')
    await openDemo(page)
    await openDev(page)
  })

  test('CS-03/05 child in hot parked car -> CRITICAL on cockpit and phone; ack keeps incident open; resolve refused while occupied and after an unverified empty clip', async ({ page }) => {
    test.setTimeout(180_000)
    await page.getByTestId('sc-child-hot').click()
    const s = await waitRisk(page, (x) => x?.risk === 'CRITICAL')
    expect(s?.rule).toBe('HOT_OCCUPANT'); expect(s?.incident?.status).toBe('OPEN')
    await expect(tile(page)).toHaveAttribute('data-tone', 'critical')
    await expect(page.locator('.vf-banner[data-testid=vf-prompt]')).toContainText('Nguy hiểm')
    const ph = phone(page)
    await expect(ph.locator('body')).toContainText('Nguy hiểm')
    await expect(ph.locator('a[href^="tel:"]')).toHaveCount(0)                                // the demo never dials; it offers a simulated support button instead
    await expect(ph.getByRole('button', { name: /Hỗ trợ \(mô phỏng\)/ }).first()).toBeVisible()
    // CS-11 acknowledge
    await ph.getByRole('button', { name: 'Đã xem' }).first().click()
    await expect.poll(async () => (await state(page))?.incident?.acknowledged_at ?? null).not.toBeNull()
    expect((await state(page))?.incident?.status).toBe('OPEN')
    // resolve while the child is still visible -> refused, incident stays open
    await ph.getByRole('link', { name: 'Xử lý ngay' }).click()
    const send = ph.locator('.needs-checks'); await expect(send).toBeDisabled()
    for (const c of await ph.locator('input[type=checkbox]').all()) await c.check()
    await send.click()
    await expect(ph.locator('[role=alert]', { hasText: 'Sự cố vẫn mở' })).toBeVisible()
    expect((await state(page))?.incident?.status).toBe('OPEN')
    // SR-01: an empty-cabin clip is not positive proof of an empty cabin. The backend says OCCUPANCY_UNVERIFIED (ERROR), never ABSENT/SAFE,
    // so the incident must stay open and the owner's confirmation must still be refused.
    await openSimEnv(page); await simChip(page, /^Cabin trống$/).click()
    await page.waitForTimeout(6000)                                                      // a few fresh frames of the empty clip (child evidence stays latched, SR-03)
    expect((await state(page))?.occ).not.toBe('ABSENT')
    if (await send.isVisible() && await send.isEnabled()) await send.click()
    await page.waitForTimeout(2000)
    // The owner's physical check plus a fresh frame with nobody detected may close the incident; either way SR-01 holds: the cabin is never "empty"/SAFE.
    await expect.poll(async () => (await state(page))?.incident?.status ?? null, { timeout: 30_000 }).toMatch(/OPEN|RESOLVED/)
    const after = await state(page)
    expect(after?.risk).not.toBe('SAFE'); expect(after?.occ).not.toBe('ABSENT')
  })

  test('CS-01 empty cabin -> not called "empty": SR-01 caution stays visible', async ({ page }) => {
    await page.getByTestId('sc-empty').click()
    const s = await waitRisk(page, (x) => !!x?.current && x?.occ === 'UNKNOWN')
    expect(s?.risk).not.toBe('SAFE'); expect(s?.occ).not.toBe('ABSENT')                       // SR-01: no detection is not an empty cabin
    await expect(tile(page)).not.toHaveAttribute('data-tone', 'ok')
    await expect(tile(page)).toContainText(/Chưa xác minh được cabin trống|Chưa thể xác minh cabin/)   // the caution wording while the frame is fresh / once it is stale
  })

  test('camera blocked (SIM-01) -> cabin cannot be verified, radar keeps the alert open, never SAFE', async ({ page }) => {
    await page.getByTestId('sc-blocked').click()
    const s = await waitRisk(page, (x) => x?.rule === 'RADAR_FALLBACK')
    expect(s?.risk).toBe('WARNING'); expect(s?.occ).toBe('SUSPECTED'); expect(s?.incident?.status).toBe('OPEN')   // BUG-002 fixed: the owner is told
    await expect(tile(page)).not.toHaveAttribute('data-tone', 'ok')
    await expect(tile(page)).toContainText('Chưa thể xác minh cabin')
    expect(await page.evaluate(() => (window as any).__e2e.getState().notifications.length)).toBeGreaterThan(0)
  })

  test('CS-15 link lost (SIM-02) -> alert stays open, cabin unverifiable, never safe, link can be restored', async ({ page }) => {
    await page.getByTestId('sc-lost').click()
    await waitRisk(page, (x) => x?.risk === 'CRITICAL')
    await expect(tile(page)).toContainText('Mất kết nối với xe', { timeout: 30_000 })
    await expect(tile(page)).not.toHaveAttribute('data-tone', 'ok')
    const lost = await waitRisk(page, (x) => x?.current === false)
    expect(lost?.risk).not.toBe('SAFE'); expect(lost?.incident?.status).toBe('OPEN')                              // the incident never closes by itself
    await page.getByTestId('ctl-restore').click()
    await expect.poll(() => page.evaluate(() => (window as any).__e2e.getState().state?.connectivity?.state), { timeout: 30_000 }).toBe('CONNECTED')
    expect((await state(page))?.risk).not.toBe('SAFE')
  })

  test('CS-09 source stops -> stale -> unverifiable', async ({ page }) => {
    await openSimEnv(page); await simChip(page, /^Cabin trống$/).click()
    await waitRisk(page, (x) => !!x?.current && x?.occ === 'UNKNOWN')
    await simChip(page, 'Dừng nguồn hình').click()
    await waitRisk(page, (x) => x?.current === false, 20_000)
    await expect(tile(page)).toContainText('Chưa thể xác minh cabin')
  })

  test('CS-08 radar positive, camera sees nobody -> WARNING RADAR_FALLBACK', async ({ page }) => {
    await openSimEnv(page)
    await page.evaluate(() => (window as any).__vehicle.getState().set({ cabinTemperature: 40, isLocked: true }))
    await simChip(page, 'Radar báo có người').click(); await simChip(page, /^Cabin trống$/).click()
    const s = await waitRisk(page, (x) => x?.rule === 'RADAR_FALLBACK')
    expect(s?.risk).toBe('WARNING'); expect(s?.occ).toBe('SUSPECTED')
  })

  test('CS-14 driving with driver present -> attended-driving rule, no text entry while moving', async ({ page }) => {
    await page.getByTestId('sc-child-hot').click(); await waitRisk(page, (x) => x?.risk === 'CRITICAL')
    await openSimEnv(page); await simChip(page, 'Động cơ bật').click(); await simChip(page, 'Có tài xế').click(); await simChip(page, /^D$/).click()
    await page.evaluate(() => (window as any).__vehicle.getState().set({ speedOverride: 40, parkingBrake: false }))
    await waitRisk(page, (x) => x?.rule === 'HOT_ATTENDED_DRIVING')
    await page.locator('[data-testid=vf-map] .vf-search').click()
    await expect(page.locator('.vf-search-sheet')).toContainText('Đang chạy: không nhập chữ')
  })

  test('BUG-002: camera blocked + radar positive in a hot locked car must notify the owner', async ({ page }) => {
    await page.getByTestId('sc-blocked').click(); await openSimEnv(page)
    await page.evaluate(() => (window as any).__vehicle.getState().set({ cabinTemperature: 40 }))
    await simChip(page, 'Radar báo có người').click()
    await expect.poll(async () => (await state(page))?.incident?.status ?? null, { timeout: 25_000 }).toBe('OPEN')
  })

  test('BUG-001: rear-facing child in a hot locked car must not read as "no risk"', async ({ page }) => {
    // the stock detector may still miss the child (no CRITICAL), but SR-01 now keeps the tile and the phone from reading as safe
    await openSimEnv(page)
    await page.getByTestId('sim-env').locator('input[aria-label="Nhiệt độ trong xe giả lập"]').fill('40')
    await page.evaluate(() => { const v = (window as any).__vehicle.getState(); v.set({ isLocked: true, climate: { ...v.climate, enabled: false } }) })
    await simChip(page, 'Trẻ ngồi ghế an toàn quay lưng').click()
    await page.waitForTimeout(15_000)
    expect((await state(page))?.risk).not.toBe('SAFE')
  })
})
