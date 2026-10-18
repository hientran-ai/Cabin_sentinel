import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './integration', timeout: 90000, workers: 1, fullyParallel: false,
  expect: { timeout: 20000 },
  reporter: [['list'], ['json', { outputFile: '../../docs/final-integration-20261017/playwright-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4187', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  outputDir: '../../docs/final-integration-20261017/playwright-artifacts',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1366, height: 768 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1366, height: 768 } } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } } },
  ],
})
