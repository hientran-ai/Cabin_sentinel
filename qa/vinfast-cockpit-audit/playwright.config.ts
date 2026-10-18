import { defineConfig, devices } from '@playwright/test'

// BASE_URL defaults to the deployed demo. Safety specs need H.264 playback: use the `chrome` (branded) or `webkit` project,
// never the bundled Chromium (it cannot decode the sample clips and the backend correctly reports NO_FEED).
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://c4-app-068.cabinsentinel-platform.workers.dev',
    viewport: { width: 1920, height: 1080 },
    trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure',
  },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1920, height: 1080 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1920, height: 1080 } }, grep: /@smoke|@safety/ },
  ],
})
