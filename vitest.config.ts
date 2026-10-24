import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['{app,server,packages}/**/*.test.ts'], environment: 'node' },
  resolve: {
    alias: {
      '@racionika/shared': new URL('./packages/shared/src/index.ts', import.meta.url).pathname,
    },
  },
});
