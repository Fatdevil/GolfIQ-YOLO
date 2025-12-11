import { describe, expect, it } from 'vitest';

import {
  computePlaysLikeDistance,
  computeRiskZonesFromProfile,
  suggestClubForTarget,
} from '@app/caddie/caddieDistanceEngine';

describe('computePlaysLikeDistance', () => {
  it('adjusts distance for headwind and elevation', () => {
    const result = computePlaysLikeDistance({
      targetDistanceM: 150,
      windSpeedMps: 4,
      windDirectionDeg: 0,
      elevationDeltaM: 5,
    });

    expect(result).toBeCloseTo(167, 1);
  });

  it('reduces distance for tailwind and downhill', () => {
    const result = computePlaysLikeDistance({
      targetDistanceM: 150,
      windSpeedMps: 4,
      windDirectionDeg: 180,
      elevationDeltaM: -5,
    });

    expect(result).toBeLessThan(150);
  });
});

describe('suggestClubForTarget', () => {
  it('chooses the smallest club that covers plays-like distance', () => {
    const club = suggestClubForTarget(
      [
        { club: '8i', baselineCarryM: 145, samples: 5, source: 'auto' },
        { club: '7i', baselineCarryM: 158, samples: 4, source: 'auto' },
        { club: '6i', baselineCarryM: 170, samples: 2, source: 'auto' },
      ],
      { targetDistanceM: 150, windSpeedMps: 0, windDirectionDeg: 0, elevationDeltaM: 0 },
    );

    expect(club?.club).toBe('7i');
  });

  it('falls back to best available club when samples are sparse', () => {
    const club = suggestClubForTarget(
      [
        { club: 'PW', baselineCarryM: 110, samples: 1, source: 'auto' },
        { club: '9i', baselineCarryM: 125, samples: 2, source: 'auto' },
      ],
      { targetDistanceM: 120, windSpeedMps: 0, windDirectionDeg: 0, elevationDeltaM: 0 },
    );

    expect(club?.club).toBe('9i');
  });

  it('prefers manual carry when source is manual', () => {
    const club = suggestClubForTarget(
      [
        { club: '8i', baselineCarryM: 150, manualCarryM: 140, samples: 5, source: 'manual' },
        { club: '9i', baselineCarryM: 135, samples: 5, source: 'auto' },
      ],
      { targetDistanceM: 138, windSpeedMps: 0, windDirectionDeg: 0, elevationDeltaM: 0 },
    );

    expect(club?.club).toBe('8i');
  });

  it('ignores manual carry when source is auto', () => {
    const club = suggestClubForTarget(
      [
        { club: '8i', baselineCarryM: 150, manualCarryM: 170, samples: 5, source: 'auto' },
        { club: '9i', baselineCarryM: 135, samples: 5, source: 'auto' },
      ],
      { targetDistanceM: 140, windSpeedMps: 0, windDirectionDeg: 0, elevationDeltaM: 0 },
    );

    expect(club?.club).toBe('8i');
  });

  it('uses practice profile when confident and emits telemetry', () => {
    const telemetry: any[] = [];

    const club = suggestClubForTarget(
      [
        { club: '8i', baselineCarryM: 145, samples: 5, source: 'auto' },
        { club: '7i', baselineCarryM: 158, samples: 4, source: 'auto' },
      ],
      { targetDistanceM: 150, windSpeedMps: 0, windDirectionDeg: 0, elevationDeltaM: 0 },
      {
        practiceProfile: {
          '8i': { avgCarryM: 155, sampleCount: 12, confidence: 'high' },
        },
        onPracticeDistanceUsed: (payload) => telemetry.push(payload),
      },
    );

    expect(club?.club).toBe('8i');
    expect(telemetry).toEqual([
      {
        clubId: '8i',
        practiceAvgCarryM: 155,
        baselineCarryM: 145,
        source: 'practice_profile',
      },
    ]);
  });

  it('falls back to baseline when practice profile is low confidence', () => {
    const telemetry: any[] = [];

    const club = suggestClubForTarget(
      [
        { club: '8i', baselineCarryM: 145, samples: 5, source: 'auto' },
        { club: '7i', baselineCarryM: 158, samples: 4, source: 'auto' },
      ],
      { targetDistanceM: 150, windSpeedMps: 0, windDirectionDeg: 0, elevationDeltaM: 0 },
      {
        practiceProfile: {
          '8i': { avgCarryM: 160, sampleCount: 2, confidence: 'low' },
        },
        onPracticeDistanceUsed: (payload) => telemetry.push(payload),
      },
    );

    expect(club?.club).toBe('7i');
    expect(telemetry).toEqual([]);
  });
});

describe('computeRiskZonesFromProfile', () => {
  it('computes symmetric bounds for core and full zones', () => {
    const summary = computeRiskZonesFromProfile({
      club: '7i',
      intent: 'straight',
      coreCarryMeanM: 150,
      coreCarryStdM: 5,
      coreSideMeanM: -3,
      coreSideStdM: 4,
      tailLeftProb: 0.05,
      tailRightProb: 0.02,
    });

    expect(summary.coreZone.carryMinM).toBeCloseTo(150 - 1.28 * 5, 5);
    expect(summary.coreZone.sideMaxM).toBeCloseTo(-3 + 1.28 * 4, 5);
    expect(summary.fullZone.carryMaxM).toBeCloseTo(150 + 1.96 * 5, 5);
    expect(summary.tailLeftProb).toBe(0.05);
  });

  it('handles zero dispersion defensively', () => {
    const summary = computeRiskZonesFromProfile({
      club: 'PW',
      intent: 'fade',
      coreCarryMeanM: 100,
      coreCarryStdM: 0,
      coreSideMeanM: 0,
      coreSideStdM: 0,
      tailLeftProb: 0,
      tailRightProb: 0,
    });

    expect(summary.coreZone).toEqual({
      carryMinM: 100,
      carryMaxM: 100,
      sideMinM: 0,
      sideMaxM: 0,
    });
    expect(summary.tailRightProb).toBe(0);
  });
});
