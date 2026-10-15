import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@ghal/process-ir': path.resolve(__dirname, 'modules/process-ir/src'),
      '@ghal/protocols': path.resolve(__dirname, 'modules/protocols/src'),
      '@ghal/runtime': path.resolve(__dirname, 'modules/runtime/src'),
      '@ghal/governance': path.resolve(__dirname, 'modules/governance/src'),
      '@ghal/audit': path.resolve(__dirname, 'modules/audit/src'),
    },
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
