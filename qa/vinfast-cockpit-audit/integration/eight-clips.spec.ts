import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'

for (let n = 1; n <= 8; n++) {
  const id = `DEMO-0${n}`
  test(`${id} decodes actual video, runs actual model and cleans up`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', e => { if (!/ResizeObserver/.test(String(e))) errors.push(String(e)) })
    await page.goto('/cockpit/vinfast/?debug=1', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => (window as any).__e2e?.getState().session)
    await page.getByTestId('scenario-selector').click()
    await page.getByTestId(`start-${id}`).click()
    await expect(page.getByTestId('cabin-monitor')).toBeVisible()
    await page.getByRole('tab', { name: 'Bằng chứng' }).click()
    await expect(page.getByTestId('actual-demo-video').locator('video')).toHaveCount(0)   // the source clip runs parked: judges only see the analysed (masked) detect frame
    await expect(page.getByTestId('cm-frame')).toBeVisible({ timeout: 30000 })
    const phase = await page.getByTestId('player-phase').textContent()
    if (phase?.includes('READY') || phase?.includes('ENDED')) await page.getByRole('button', { name: 'Phát lại clip', exact: true }).click()
    await expect.poll(() => page.evaluate(() => (window as any).__e2e.getState().metrics.accepted), { timeout: 30000 }).toBeGreaterThanOrEqual(2)
    await expect(page.getByTestId('cm-privacy')).toContainText('chưa đảm bảo che hết')
    // Polling can briefly have no committed state after source reset; sample only a matching frame.
    await page.waitForFunction(() => { const w = window as any; return w.__e2e.getState().state?.last_observation?.frame_id === w.__e2eCapture.getThumbInfo()?.frameId && !!w.__e2eCapture.getThumbInfo() })
    const evidence = await page.evaluate(() => {
      const s = (window as any).__e2e.getState()
      const v = (window as any).__e2eCapture.getVideo()
      return { privacy: { method: (window as any).__e2eCapture.getThumbInfo().maskMethod, sharedWithPhone: (window as any).__phoneBridge.latestFrame()?.url === (window as any).__e2eCapture.getThumbInfo().url }, source: s.source, model: s.state.model, observation: s.state.last_observation, risk: s.state.risk_level, rule: s.state.rule_id, incident: s.state.incident, notifications: s.notifications, media: { src: v.currentSrc, width: v.videoWidth, height: v.videoHeight, time: v.currentTime, muted: v.muted } }
    })
    expect(evidence.privacy.sharedWithPhone).toBe(true)
    expect(['YUNET', 'HEAD', 'FULL', 'NONE']).toContain(evidence.privacy.method)   // NONE: sample clip frame with no detection box (show build)
    expect(evidence.source.scenarioId).toBe(id)
    expect(evidence.observation.vision.source).toBe('MODEL_INFERENCE')
    expect(evidence.observation.source).toBe('CLIP_FRAME')
    expect(evidence.observation.frame_id).toContain(evidence.source.runId)
    expect(evidence.media.width).toBeGreaterThan(0)
    expect(evidence.media.time).toBeGreaterThan(0)
    expect(evidence.media.muted).toBe(true)
    if (n === 2) expect(evidence.risk).toBe('ERROR')
    if (n === 5) { expect(evidence.risk).toBe('CRITICAL'); expect(evidence.notifications.length).toBe(1) }
    if (n === 7) { expect(evidence.rule).toBe('ATTENDED_DRIVING'); expect(evidence.incident).toBeNull(); expect(evidence.notifications).toHaveLength(0) }
    writeFileSync(info.outputPath(`${id}-actual.json`), JSON.stringify(evidence, null, 2))
    await page.screenshot({ path: info.outputPath(`${id}-evidence.png`), fullPage: true })
    // Native replay is a user operation on the mounted evidence player. Closing the panel detaches
    // that element, so exercise replay before closing rather than waiting on detached media.play().
    await page.evaluate(() => { const v = (window as any).__e2eCapture.getVideo(); v.loop = false; v.currentTime = v.duration - .15 })   // clips loop for judges; switch the loop off to test the end
    await expect.poll(() => page.evaluate(() => (window as any).__e2e.getState().source.playerPhase)).toBe('ENDED')
    await page.evaluate(async () => { const v = (window as any).__e2eCapture.getVideo(); v.currentTime = 0; await v.play() })
    await expect.poll(() => page.evaluate(() => (window as any).__e2e.getState().source.running)).toBe(true)
    await page.getByTestId('cm-close').click()
    await expect(page.getByTestId('scenario-pipeline')).toContainText('SIMULATED SENSOR DATA')
    if (n === 5) {
      await expect(page.getByTestId('smart-interaction')).toHaveAttribute('data-kind', 'SAFETY')
      await expect(page.getByTestId('vf-toasts').locator('[role=alert]')).toHaveCount(0)
    }
    expect(errors).toEqual([])
    await page.evaluate(() => (window as any).__e2eCapture.stopSource())
    await expect.poll(() => page.evaluate(() => (window as any).__e2e.getState().source.playerPhase)).toBe('IDLE')
  })
}
