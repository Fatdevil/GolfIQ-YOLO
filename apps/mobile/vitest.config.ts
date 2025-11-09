import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(rootDir, 'src');
const repoRoot = resolve(rootDir, '..', '..');

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    include: ['__tests__/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@app': srcDir,
      '@shared': resolve(repoRoot, 'shared'),
      'react-native': resolve(srcDir, 'runtime/react-native.tsx'),
      '@react-navigation/native': resolve(srcDir, 'runtime/react-navigation-native.tsx'),
      '@react-navigation/native-stack': resolve(srcDir, 'runtime/react-navigation-native-stack.tsx'),
    },
  },
});
