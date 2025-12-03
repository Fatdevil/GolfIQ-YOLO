import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import LastShotCard from '@app/range/LastShotCard';
import type { RangeShot } from '@app/range/rangeSession';
import type { TempoTarget } from '@app/range/tempoTrainerEngine';

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

  it('shows tempo band feedback when trainer target is present', () => {
    const shot: RangeShot = {
      id: 'shot-2',
      timestamp: new Date().toISOString(),
      club: '7i',
      targetDistanceM: 150,
      carryM: 150,
      sideDeg: 0,
      tempoRatio: 3.1,
      tempoWithinBand: true,
    };
    const target: TempoTarget = {
      targetRatio: 3.0,
      tolerance: 0.2,
      targetBackswingMs: 900,
      targetDownswingMs: 300,
    };

    render(<LastShotCard shot={shot} targetDistanceM={150} tempoTarget={target} />);

    expect(screen.getByTestId('tempo-band')).toHaveTextContent('Inside band');
    expect(screen.getByTestId('tempo-band')).toHaveTextContent('Target 3.0 : 1');
  });
});
