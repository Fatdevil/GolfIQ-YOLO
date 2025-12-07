import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { CaddieRecommendationCard } from '@app/caddie/CaddieRecommendationCard';
import type { CaddieDecisionOutput } from '@app/caddie/CaddieDecisionEngine';
import type { CaddieSettings } from '@app/caddie/caddieSettingsStorage';

describe('CaddieRecommendationCard', () => {
  const decision: CaddieDecisionOutput = {
    club: '7i',
    intent: 'fade',
    effectiveCarryM: 155,
    playsLikeDistanceM: 150,
    playsLikeBreakdown: { slopeAdjustM: -2, windAdjustM: 4 },
    source: 'auto',
    samples: 3,
    distanceSource: 'auto_calibrated',
    sampleCount: 3,
    minSamples: 5,
    risk: {
      coreZone: { carryMinM: 148, carryMaxM: 158, sideMinM: -6, sideMaxM: 4 },
      fullZone: { carryMinM: 140, carryMaxM: 165, sideMinM: -10, sideMaxM: 8 },
      tailLeftProb: 0.06,
      tailRightProb: 0.02,
    },
  };
  const settings: CaddieSettings = {
    stockShape: 'fade',
    riskProfile: 'safe',
  };

  it('renders club, intent, plays-like, and risks', () => {
    render(<CaddieRecommendationCard decision={decision} settings={settings} />);

    expect(screen.getByTestId('caddie-recommendation-card')).toBeInTheDocument();
    expect(screen.getByText(/7i/)).toBeInTheDocument();
    expect(screen.getByText(/Plays-like/)).toBeInTheDocument();
    expect(screen.getByText(/Core window/)).toBeInTheDocument();
    expect(screen.getByTestId('caddie-tail-left')).toHaveTextContent('6%');
    expect(screen.getByTestId('caddie-tail-right')).toBeInTheDocument();
    expect(screen.getByText(/Profile:/)).toBeInTheDocument();
    expect(screen.getByTestId('caddie-calibration-label')).toHaveTextContent('Auto-calibrated');
  });

  it('shows low sample hint when samples are small', () => {
    render(
      <CaddieRecommendationCard
        decision={{ ...decision, samples: 2, sampleCount: 2, minSamples: 5 }}
        settings={settings}
      />,
    );

    expect(screen.getByText(/Low on-course sample size/)).toBeInTheDocument();
  });
});
