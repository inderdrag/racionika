import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './app/e2e',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'], browserName: 'chromium' } }],
  webServer: {
    command: 'npm run dev:demo',
    url: 'http://127.0.0.1:8787/v1/config',
    reuseExistingServer: !process.env.CI,
  },
});
