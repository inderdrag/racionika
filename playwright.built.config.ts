import { defineConfig } from '@playwright/test';
import config from './playwright.config';
export default defineConfig(config, {
  use: {
    baseURL: 'http://127.0.0.1:8790',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] }
      : {},
  },
  webServer: {
    command: 'node scripts/start-built-demo.mjs',
    url: 'http://127.0.0.1:8790/v1/config',
    reuseExistingServer: false,
  },
});
