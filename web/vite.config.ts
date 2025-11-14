import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
      '@': path.resolve(__dirname, './src'),
      '@web': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['@supabase/supabase-js'],
    exclude: ['@ffmpeg/ffmpeg'],
  },
  assetsInclude: ['**/*.wasm'],
  server: {
    fs: {
      allow: ['..'],
    },
  },
  build: {
    commonjsOptions: { transformMixedEsModules: true },
    rollupOptions: {
      external: ['@ffmpeg/ffmpeg'],
    },
  },
  test: {
    include: [
      'src/__tests__/**/*.spec.ts',
      '../shared/playslike/__tests__/**/*.spec.ts',
      '../shared/runs/__tests__/**/*.spec.ts',
    ],
  },
});
