import { defineConfig } from '@playwright/test';
import config from './playwright.config';
export default defineConfig(config, {
  use: {
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/local/bin/chromium',
      args: ['--no-sandbox'],
    },
  },
});
