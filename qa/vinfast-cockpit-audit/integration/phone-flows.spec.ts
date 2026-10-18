import { expect, test } from '@playwright/test'
import { DEMO, openDemo, phone, tile } from '../tests/helpers'

// Owner phone flows added with the Apple-style redesign: demo sign-in, personalisation tab, full history with sample data, VinFast-only demo.
// the phone frame is 800 px tall: give the page room so its fixed tab bar is inside the viewport
test.use({ viewport: { width: 1366, height: 1500 } })
const btn = (ph: ReturnType<typeof phone>, name: string | RegExp) => ph.getByRole('button', { name })

test.describe('owner phone: sign-in', () => {
  test('opens on the sign-in screen, signs in with the demo account, and can sign out again', async ({ page }) => {
    await openDemo(page, DEMO, { signedIn: false })
    const ph = phone(page)
    await expect(ph.locator('body')).toContainText('Cabin Noir')
    await expect(ph.locator('.verdict')).toHaveCount(0)                               // nothing about the car before sign-in
    await btn(ph, 'Dùng tài khoản demo').click()
    await expect(ph.locator('input.otp')).toHaveValue('246810')                       // demo code is filled in, no SMS is sent
    await btn(ph, 'Đăng nhập').click()
    await expect(ph.locator('.verdict').first()).toBeVisible()
    await ph.getByRole('link', { name: /Cá nhân hoá/ }).click()
    await expect(ph.locator('body')).toContainText('090•••••68')                      // phone number is masked
    await btn(ph, 'Đăng xuất').click()
    await expect(ph.getByRole('button', { name: 'Dùng tài khoản demo' })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('cn.token'))).toBeNull()
  })

  test('rejects a malformed number and a wrong code', async ({ page }) => {
    await openDemo(page, DEMO, { signedIn: false })
    const ph = phone(page)
    await ph.getByLabel('Số điện thoại').fill('12345')
    await btn(ph, 'Tiếp tục').click()
    await expect(ph.locator('.toast.err').last()).toContainText('10 chữ số')
    await ph.getByLabel('Số điện thoại').fill('0912345678')
    await btn(ph, 'Tiếp tục').click()
    await ph.locator('input.otp').fill('000000')
    await btn(ph, 'Đăng nhập').click()
    await expect(ph.locator('.toast.err').last()).toContainText('Mã không đúng')
    await expect(ph.locator('.verdict')).toHaveCount(0)
  })
})

test.describe('owner phone: history with sample data', () => {
  test('shows the sample alerts labelled simulated, the 7/30/90 range, CSV and an openable incident', async ({ page }) => {
    await openDemo(page)
    const ph = phone(page)
    await ph.getByRole('link', { name: /Lịch sử/ }).click()
    await expect(ph.locator('body')).toContainText('4 sự cố')                          // default range is 7 days
    await ph.getByRole('button', { name: '30', exact: true }).click()
    await expect(ph.locator('body')).toContainText('8 sự cố')                          // 30 days: all eight sample alerts
    await expect(ph.locator('body')).toContainText('Mô phỏng')
    await expect(ph.getByRole('button', { name: 'Tải nhật ký (CSV)' })).toBeVisible()
    await expect(ph.locator('.icard').first()).toContainText('dữ liệu mẫu')
    await ph.locator('.icard').first().click()
    await expect(ph.locator('body')).toContainText('Đã đóng sự cố')                   // demo incidents are closed, never open or fake-live
    await ph.getByRole('link', { name: 'Xem lịch sử' }).click()
    await ph.getByRole('tab', { name: 'Hoạt động thiết bị' }).click()
    await expect(ph.locator('body')).toContainText('Camera bị che')
    await ph.getByRole('tab', { name: /^Cảnh báo/ }).click()
    await expect(ph.locator('.icard').first()).toBeVisible()
  })
})

test.describe('owner phone: personalisation', () => {
  test('a profile and its photo stay on the phone; nothing personal is sent to the backend', async ({ page }) => {
    const sent: string[] = []
    page.on('request', (r) => { if (r.method() !== 'GET') sent.push(`${r.url()} ${r.postData() ?? ''}`) })
    await openDemo(page)
    const ph = phone(page)
    await ph.getByRole('link', { name: /Cá nhân hoá/ }).click()
    await ph.getByRole('button', { name: 'Thú cưng' }).first().click()
    await ph.locator('.sheet input[type=text]').nth(0).fill('MựcRiêngTư')
    await ph.locator('.sheet input[type=text]').nth(1).fill('Corgi')
    await ph.getByRole('button', { name: 'Lưu', exact: true }).click()
    await expect(ph.locator('body')).toContainText('MựcRiêngTư')
    expect(await page.evaluate(() => localStorage.getItem('cs.profiles.v1'))).toContain('MựcRiêngTư')
    await ph.getByRole('button', { name: /Sửa hồ sơ MựcRiêngTư/ }).click()
    await ph.getByRole('button', { name: 'Xoá', exact: true }).click()
    await ph.getByRole('button', { name: 'Xoá', exact: true }).last().click()
    await expect(ph.locator('body')).not.toContainText('MựcRiêngTư')
    expect(await page.evaluate(() => localStorage.getItem('cs.profiles.v1'))).not.toContain('MựcRiêngTư')
    expect(sent.filter((s) => s.includes('MựcRiêngTư') || s.includes('Corgi'))).toEqual([])
  })

  test('pet chip is greyed with no fresh data; after the DEMO-05 clip the chip starts Cabin Care without touching the alert', async ({ page }, info) => {
    test.skip(info.project.name === 'chromium', 'needs H.264 playback for the clip (use chrome or webkit)')
    test.setTimeout(180_000)
    await openDemo(page)
    const ph = phone(page)
    await expect(ph.locator('.chip.pet.off')).toHaveCount(1)
    await page.getByTestId('scenario-selector').click()
    await page.getByTestId('start-DEMO-05').click()
    await expect(page.getByTestId('cabin-monitor')).toBeVisible()
    await page.keyboard.press('Escape')                                                  // close the cabin monitor so the phone is reachable
    await expect(page.getByTestId('cabin-monitor')).toBeHidden()
    await expect.poll(() => page.evaluate(() => (window as any).__e2e.getState().state?.risk_level), { timeout: 90_000 }).toBe('CRITICAL')
    await expect(ph.locator('.chip.pet:not(.off)')).toHaveCount(1)
    const careCalls: string[] = []
    page.on('response', async (r) => { if (r.url().includes('/care/')) careCalls.push(`${r.request().method()} ${r.url().split('/care/')[1]} ${r.status()} ${(await r.text()).slice(0, 160)}`) })
    await ph.locator('.chip.pet').click()
    await expect.poll(() => careCalls.length, { timeout: 15_000, message: 'chip must call the care API' }).toBeGreaterThan(0)
    console.log(careCalls.join('\n'))
    await expect.poll(() => page.evaluate(() => (window as any).__e2e.getState().state?.care?.status)).toBe('ACTIVE')
    expect(await page.evaluate(() => (window as any).__e2e.getState().state?.care?.profile)).toBe('PET')
    expect(await page.evaluate(() => (window as any).__e2e.getState().state?.risk_level)).toBe('CRITICAL')   // comfort never lowers the alert
    await expect(tile(page)).toHaveAttribute('data-tone', 'critical')
  })
})

test('the demo is VinFast only: SU7 and Tesla URLs land on the VinFast demo', async ({ page }) => {
  for (const path of ['/cockpit/', '/cockpit/tesla/']) {
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    expect(new URL(page.url()).pathname).toBe('/cockpit/vinfast/')
  }
  await expect(page).toHaveTitle(/VinFast/)
})

test.describe('judge entry: Bắt đầu demo', () => {
  test('lands on the main cabin screen; the car phone app explains the car-phone link; the clip keeps being analysed after 10 s', async ({ page }, info) => {
    test.skip(info.project.name === 'chromium', 'needs H.264 playback for the clip (use chrome or webkit)')
    test.setTimeout(90_000)
    await openDemo(page)
    await page.getByTestId('scenario-selector').click()
    await page.getByTestId('start-DEMO-05').click()
    await expect(page.getByTestId('cabin-monitor')).toBeVisible()
    await expect(page.getByTestId('vf-cabin-detail')).toBeVisible()                                  // Tổng quan, not the evidence tab
    await expect(page.getByTestId('vf-evidence')).toHaveCount(0)
    await expect(page.getByTestId('cm-car-phone')).toHaveCount(0)                                    // the explainer lives in the car UI, not in this dialog
    // the 10 s clip loops: frames keep being accepted well past its length and the feed never turns into "camera lost"
    await expect.poll(() => page.evaluate(() => (window as any).__e2e.getState().metrics.accepted), { timeout: 40_000 }).toBeGreaterThanOrEqual(14)
    expect(await page.evaluate(() => (window as any).__e2e.getState().state?.camera_status)).toBe('OK')
    expect(await page.evaluate(() => (window as any).__e2e.getState().source.playerPhase)).not.toBe('ENDED')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('cabin-monitor')).toBeHidden()
    await page.locator('[data-testid=vf-launcher] button[aria-label="Điện thoại"]').click()
    await expect(page.getByTestId('vf-car-phone')).toContainText('Điện thoại chủ xe')
    await page.getByTestId('vf-go-phone').click()
    await expect(page.getByTestId('phone')).toBeInViewport({ ratio: 0.5 })
    await expect(page.getByTestId('phone')).toHaveClass(/cm-flash/)
  })
})

test.describe('car ↔ phone sync', () => {
  test('a new incident shows an in-page alert banner on the phone, and the incident page carries the masked report frame', async ({ page }, info) => {
    test.skip(info.project.name === 'chromium', 'needs H.264 playback for the clip (use chrome or webkit)')
    test.setTimeout(90_000)
    await openDemo(page)
    const ph = phone(page)
    await expect(ph.locator('.verdict').first()).toBeVisible()
    await page.getByTestId('scenario-selector').click()
    await page.getByTestId('start-DEMO-05').click()
    await expect(page.getByTestId('cabin-monitor')).toBeVisible()
    await page.keyboard.press('Escape')
    const banner = ph.locator('.banner-n').first()
    await expect(banner).toBeVisible({ timeout: 30_000 })                                         // the phone announces the incident, not only the bell badge
    await expect(banner).toContainText(/có thể có người trong xe/i)
    // The radar alert can precede the first decoded/inferred frame. Wait for actual image evidence.
    await page.waitForFunction(() => (window as any).__e2eCapture.getThumbInfo()?.kind === 'CLIP_FRAME')
    // Hold one analysed frame while the phone fetches its report copy.
    await page.evaluate(() => (window as any).__e2eCapture.getVideo().pause())
    await page.waitForTimeout(1000)
    await ph.locator('a[href^="#/incident/"]').first().click()
    await expect(ph.getByRole('link', { name: /Về trang chủ/ })).toBeVisible()
    const photo = ph.locator('.report-frame img.alert-photo')
    await expect(photo).toBeVisible({ timeout: 15_000 })
    // Compare the actual report bytes with the one shared processed thumb, never the source clip.
    const digest = async (element: HTMLImageElement) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await (await fetch(element.src)).arrayBuffer()))).join(',')
    const phoneHash = await photo.evaluate(digest)
    const sharedHash = await page.evaluate(async () => {
      const w = window as any, thumb = w.__e2eCapture.getThumbInfo(), bridge = w.__phoneBridge.latestFrame()
      if (!thumb || bridge?.url !== thumb.url || !['YUNET', 'HEAD', 'FULL'].includes(thumb.maskMethod)) throw new Error('Unqualified report frame')
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await (await fetch(thumb.url)).arrayBuffer()))).join(',')
    })
    expect(phoneHash).toBe(sharedHash)
    expect(await page.evaluate(() => (window as any).__e2e.getState().metrics.accepted)).toBeGreaterThan(0)
  })
})
