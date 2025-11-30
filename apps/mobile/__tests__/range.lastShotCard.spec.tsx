import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import LastShotCard from '@app/range/LastShotCard';
import type { RangeShot } from '@app/range/rangeSession';

describe('LastShotCard', () => {
  it('renders placeholder when no shot', () => {
    render(<LastShotCard shot={null} targetDistanceM={150} />);

    expect(screen.getByTestId('last-shot-placeholder')).toBeTruthy();
    expect(screen.getByText('No shots logged yet')).toBeTruthy();
  });

  it('renders metrics for a shot', () => {
    const shot: RangeShot = {
      id: 'shot-1',
      timestamp: new Date().toISOString(),
      club: '7i',
      targetDistanceM: 140,
      carryM: 95,
      sideDeg: -6,
      launchDeg: 18.2,
      ballSpeedMps: 62.5,
      clubSpeedMps: 43.2,
      qualityLevel: 'good',
    };

    render(<LastShotCard shot={shot} targetDistanceM={shot.targetDistanceM} />);

    expect(screen.getByTestId('last-shot-card')).toBeTruthy();
    expect(screen.getByText('95 m')).toBeTruthy();
    expect(screen.getByText('Left')).toBeTruthy();
    expect(screen.getByTestId('quality-badge')).toHaveTextContent('Good strike');
  });
});
