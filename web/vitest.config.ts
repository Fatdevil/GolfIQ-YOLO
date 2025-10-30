import path from 'node:path';
import { defineConfig } from 'vitest/config';

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
      '../tests/shared/greeniq/**/*.spec.ts',
    ],
    exclude: [
      '../tests/shared/caddie/**',
      '../tests/shared/sg/**',
    ],
    passWithNoTests: true,
  }
});
