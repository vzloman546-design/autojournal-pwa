const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: false,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:8765',
    locale: 'ru-RU',
    colorScheme: 'light',
    serviceWorkers: 'block',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'webkit-iphone', use: { ...devices['iPhone 13'], viewport: {width: 390, height: 844} } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'], viewport: {width: 390, height: 844} } }
  ],
  webServer: process.env.BASE_URL ? undefined : {
    command: 'node tests/server.cjs',
    url: 'http://127.0.0.1:8765',
    reuseExistingServer: !process.env.CI
  }
});
