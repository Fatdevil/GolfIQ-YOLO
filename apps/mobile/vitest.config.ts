import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(rootDir, 'src');
const repoRoot = resolve(rootDir, '..', '..');
const setupFile = resolve(rootDir, 'vitest.setup.ts');

export default defineConfig({
  root: rootDir,
  ssr: {
    noExternal: ['@testing-library/react-native', 'react-native'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: [setupFile],
    css: false,
    deps: {
      optimizer: {
        web: {
          include: ['@testing-library/react-native'],
        },
      },
    },
    include: [
      '__tests__/**/*.{spec,test}.ts',
      '__tests__/**/*.{spec,test}.tsx',
    ],
  },
  resolve: {
    alias: {
      '@app': srcDir,
      '@shared': resolve(repoRoot, 'shared'),
      'react-native': resolve(srcDir, 'runtime/react-native.tsx'),
      '@react-navigation/native': resolve(srcDir, 'runtime/react-navigation-native.tsx'),
      '@react-navigation/native-stack': resolve(srcDir, 'runtime/react-navigation-native-stack.tsx'),
      'expo-barcode-scanner': resolve(srcDir, 'runtime/expo-barcode-scanner.tsx'),
      'expo-av': resolve(srcDir, 'runtime/expo-av.ts'),
      '@react-native-async-storage/async-storage': resolve(srcDir, 'runtime/async-storage.ts'),
    },
  },
});
