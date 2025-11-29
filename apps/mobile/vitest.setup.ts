import '@testing-library/jest-dom/vitest';
import '@testing-library/react';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Ensure fetch exists in tests.
if (typeof globalThis.fetch !== 'function') {
  throw new Error('global fetch must be available for tests');
}

// React Testing Library uses act heuristics; flag for React 18.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
});
