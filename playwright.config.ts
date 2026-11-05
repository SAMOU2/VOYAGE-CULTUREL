import { defineConfig } from '@playwright/test'

const baseURL = process.env.UI_BASE_URL || `http://127.0.0.1:${process.env.UI_PORT || 3100}`
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
export default defineConfig({
  testDir: './tests/ui',
  outputDir: '.cache/playwright-results',
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: {
    baseURL,
    headless: true,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath,
      args: executablePath
        ? [
            '--no-sandbox',
            '--no-zygote',
            '--disable-dev-shm-usage',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ]
        : [],
    },
  },
  projects: [
    {
      name: 'ordinateur',
      testMatch: 'stand.spec.ts',
      use: { viewport: { width: 1366, height: 900 } },
    },
    {
      name: 'mobile',
      testMatch: 'stand.spec.ts',
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'borne-43',
      testMatch: 'large-screen.spec.ts',
      use: { viewport: { width: 1920, height: 1080 }, hasTouch: true, deviceScaleFactor: 1 },
    },
  ],
  webServer: process.env.UI_BASE_URL
    ? undefined
    : {
        command: 'npx tsx scripts/ui-server.ts',
        url: `${baseURL}/api/health`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
})
