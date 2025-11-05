import path from 'node:path';
import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  test: {
    include: [
      'src/__tests__/**/*.spec.ts',
      'src/overlay/**/*.spec.tsx',
      '../shared/playslike/__tests__/**/*.spec.ts',
      '../shared/runs/__tests__/**/*.spec.ts',
      '../shared/shotsense/__tests__/**/*.spec.ts',
      '../shared/telemetry/__tests__/**/*.spec.ts',
      '../shared/caddie/**/*.spec.ts',
      '../shared/learning/**/*.spec.ts',
      'tests/**/*.spec.ts',
      'tests/**/*.spec.tsx',
      '../tests/shared/caddie/**/*.spec.ts',
      '../tests/shared/greeniq/**/*.spec.ts',
      '../tests/shared/game/**/*.spec.ts',
      '../tests/shared/sg/**/*.spec.ts',
      '../tests/shared/follow/**/*.spec.ts',
      '../tests/shared/sync/**/*.spec.ts',
      '../shared/follow/__tests__/**/*.spec.ts',
      '../shared/round/__tests__/**/*.spec.ts',
      '../tests/shared/round/**/*.spec.ts',
    ],
    exclude: [
      // Extend Vitest defaults; add repo-specific excludes below.
      ...configDefaults.exclude,
    ],
    passWithNoTests: true,
  }
});
