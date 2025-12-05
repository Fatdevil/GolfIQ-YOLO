import path from 'node:path';
import { defineConfig, configDefaults } from 'vitest/config';

const abDescriptor = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable');
if (!abDescriptor) {
  Object.defineProperty(ArrayBuffer.prototype, 'resizable', { get() { return false; } });
}

if (typeof SharedArrayBuffer !== 'undefined') {
  const sabDescriptor = Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'growable');
  if (!sabDescriptor) {
    Object.defineProperty(SharedArrayBuffer.prototype, 'growable', { get() { return false; } });
  }
}

export default defineConfig({
  test: {
    include: [
      'tests/**/*.spec.ts',
      'tests/**/*.spec.tsx',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/**/__tests__/**/*.{ts,tsx}',
    ],
    exclude: [
      ...configDefaults.exclude,
      '../shared/**',
      '../tests/**',
    ],
    setupFiles: ['tests/setup.ts', 'src/test/setup.ts'],
    passWithNoTests: true,
    globalSetup: './tests/globalSetup.ts',
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/**/*.spec.tsx', 'happy-dom'],
      ['tests/useGeolocation_hook.spec.ts', 'happy-dom'],
      ['tests/use_auto_hole_suggest.spec.ts', 'happy-dom'],
      ['src/**/__tests__/**/*.tsx', 'happy-dom'],
      ['src/**/*.test.tsx', 'happy-dom'],
    ],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
      '@': path.resolve(__dirname, './src'),
      '@web': path.resolve(__dirname, './src'),
      'hls.js': path.resolve(__dirname, 'src/test/mocks/hls.ts'),
      'expo-device': '/tests/mocks/expo-device.ts',
      'expo-file-system': '/tests/mocks/expo-file-system.ts',
      '@react-native-async-storage/async-storage': '/tests/mocks/async-storage.ts',
    },
  },
});
