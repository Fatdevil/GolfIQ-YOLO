import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: { name: 'shared' },
  },
  {
    extends: './apps/mobile/vitest.config.ts',
    test: { name: 'mobile' },
  },
]);
