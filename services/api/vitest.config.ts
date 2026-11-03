import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    env: { MONITOR_ENABLED: 'false' },
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.int.test.ts'],
  },
});
