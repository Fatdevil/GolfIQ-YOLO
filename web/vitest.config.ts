import path from 'node:path';
import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx', 'src/**/__tests__/**/*.{ts,tsx}'],
    exclude: [
      ...configDefaults.exclude,
      '../shared/**',
      '../tests/**',
    ],
    setupFiles: ['tests/setup.ts'],
    passWithNoTests: true,
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/**/*.spec.tsx', 'jsdom'],
      ['src/**/__tests__/**/*.tsx', 'jsdom'],
    ],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
      'expo-device': '/tests/mocks/expo-device.ts',
      'expo-file-system': '/tests/mocks/expo-file-system.ts',
      '@react-native-async-storage/async-storage': '/tests/mocks/async-storage.ts',
    },
  },
});
