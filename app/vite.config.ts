import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/health': 'http://127.0.0.1:8787', '/v1': 'http://127.0.0.1:8787' },
  },
  resolve: {
    alias: {
      '@racionika/shared': new URL('../packages/shared/src/index.ts', import.meta.url).pathname,
    },
  },
});
