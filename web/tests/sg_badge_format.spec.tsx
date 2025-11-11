import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { ClipCard } from '@web/features/clips/ClipCard';

describe('ClipCard SG badge', () => {
  it('renders positive SGΔ in green', () => {
    render(
      <ClipCard
        clip={{
          id: 'clip-1',
          playerName: 'Casey',
          sgDelta: 0.5,
          createdAt: '2024-01-01T00:00:00Z',
        }}
      />,
    );
    expect(screen.getByText('+0.50 SG')).toBeTruthy();
  });

  it('renders negative SGΔ in red', () => {
    render(
      <ClipCard
        clip={{
          id: 'clip-2',
          playerName: 'Maya',
          sgDelta: -0.3,
          createdAt: '2024-01-01T00:00:00Z',
        }}
      />,
    );
    expect(screen.getByText('-0.30 SG')).toBeTruthy();
  });
});
