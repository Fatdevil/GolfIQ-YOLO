import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TipConsole } from '@web/dev/TipConsole';

describe('TipConsole', () => {
  afterEach(() => {
    cleanup();
  });

  it('subscribes to tip events and renders incoming tips', () => {
    render(<TipConsole memberId="abc-123" />);

    const source = (globalThis as any).__es;
    expect(source?.url).toBe('/api/watch/abc-123/tips/stream');

    act(() => {
      source?.onmessage?.({ data: JSON.stringify({ title: 'Approach', body: 'Swing smooth' }) });
    });

    expect(screen.getByText('Approach — Swing smooth')).toBeTruthy();
  });
});
