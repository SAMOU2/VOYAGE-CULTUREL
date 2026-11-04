import { defineConfig } from '@playwright/test'

const baseURL = process.env.UI_BASE_URL || 'http://127.0.0.1:3000'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH

export default defineConfig({
  testDir: './tests/ui',
  outputDir: '.cache/playwright-results',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 12_000 },
  reporter: 'list',
  use: {
    baseURL,
    headless: true,
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
    { name: 'ordinateur', use: { viewport: { width: 1440, height: 940 } } },
    {
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
