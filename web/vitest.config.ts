import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/__tests__/**/*.spec.ts',
      '../shared/playslike/__tests__/**/*.spec.ts',
      '../shared/runs/__tests__/**/*.spec.ts',
      '../golfiq/app/src/screens/utils/__tests__/**/*.spec.ts'
    ]
  }
});
