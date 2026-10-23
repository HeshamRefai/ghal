import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@ghal/process-ir': path.resolve(__dirname, 'modules/process-ir/src/types.ts'),
      '@ghal/protocols': path.resolve(__dirname, 'modules/protocols/src/state-machines.ts'),
      '@ghal/runtime': path.resolve(__dirname, 'modules/runtime/src/engine.ts'),
      '@ghal/governance': path.resolve(__dirname, 'modules/governance/src/policy.ts'),
      '@ghal/audit': path.resolve(__dirname, 'modules/audit/src'),
      '@ghal/ingestion': path.resolve(__dirname, 'modules/ingestion/src'),
      '@ghal/metrics': path.resolve(__dirname, 'modules/metrics/src'),
      '@ghal/diagnostics': path.resolve(__dirname, 'modules/diagnostics/src'),
      '@ghal/redesign': path.resolve(__dirname, 'modules/redesign/src'),
      '@ghal/outcomes': path.resolve(__dirname, 'modules/outcomes/src'),
    },
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
