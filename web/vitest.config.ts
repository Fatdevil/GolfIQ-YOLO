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
      '../shared/playslike/__tests__/**/*.spec.ts',
      '../shared/runs/__tests__/**/*.spec.ts',
      'tests/**/*.spec.ts',
      '../tests/shared/caddie/**/*.spec.ts',
      '../tests/shared/greeniq/**/*.spec.ts',
      '../tests/shared/sg/**/*.spec.ts',
      '../tests/shared/follow/**/*.spec.ts',
    ],
    exclude: [
      // Extend Vitest defaults; add repo-specific excludes below.
      ...configDefaults.exclude,
    ],
    passWithNoTests: true,
  }
});
