import '@testing-library/jest-dom/vitest';
import type { MockInstance } from '@vitest/spy';

declare module 'vitest' {
  export type SpyInstance<TArgs extends any[] = any[], TReturn = any> = MockInstance<TArgs, TReturn>;
}
