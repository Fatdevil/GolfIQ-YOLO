import path from 'node:path';

export default {
  test: {
    include: [
      'tests/**/*.spec.ts',
      'tests/**/*.spec.tsx',
      'shared/**/*.spec.ts',
      'shared/**/*.spec.tsx',
    ],
    environment: 'node',
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
};

