import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SGDeltaBadge } from '@web/sg/SGDeltaBadge';

describe('SGDeltaBadge', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders positive deltas with emerald styling', () => {
    render(<SGDeltaBadge delta={1.234} />);
    const badge = screen.getByLabelText('Strokes Gained delta');
    expect(badge.textContent).toBe('+1.23');
    expect(badge.className).toContain('bg-emerald-950/60');
    expect(badge.className).toContain('text-emerald-300');
  });

  it('renders negative deltas with rose styling', () => {
    render(<SGDeltaBadge delta={-0.456} />);
    const badge = screen.getByLabelText('Strokes Gained delta');
    expect(badge.textContent).toBe('-0.46');
    expect(badge.className).toContain('bg-rose-950/60');
    expect(badge.className).toContain('text-rose-300');
  });

  it('renders neutral deltas with slate styling', () => {
    render(<SGDeltaBadge delta={0} />);
    const badge = screen.getByLabelText('Strokes Gained delta');
    expect(badge.textContent).toBe('+0.00');
    expect(badge.className).toContain('bg-slate-900/80');
    expect(badge.className).toContain('text-slate-200');
  });
});
