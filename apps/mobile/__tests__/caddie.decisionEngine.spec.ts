import { describe, expect, it } from 'vitest';

import {
  buildCaddieDecision,
  chooseClubForConditions,
  getEffectiveCarryM,
  mapDistanceStatsToCandidate,
  type CaddieClubCandidate,
} from '@app/caddie/CaddieDecisionEngine';
import { computePlaysLikeDistance } from '@app/caddie/caddieDistanceEngine';

const sampleProfile = {
  club: '7i',
  intent: 'straight' as const,
  coreCarryMeanM: 150,
  coreCarryStdM: 5,
  coreSideMeanM: 0,
  coreSideStdM: 4,
  tailLeftProb: 0.04,
  tailRightProb: 0.02,
};

const baseConditions = {
  targetDistanceM: 150,
  windSpeedMps: 0,
  windDirectionDeg: 0,
  elevationDeltaM: 0,
};

describe('getEffectiveCarryM', () => {
  it('prefers manual carry when source is manual', () => {
    const candidate: CaddieClubCandidate = {
      club: '8i',
      baselineCarryM: 150,
      manualCarryM: 140,
      source: 'manual',
      samples: 10,
    };

    expect(getEffectiveCarryM(candidate)).toBe(140);
  });

  it('falls back to baseline for auto source', () => {
    const candidate: CaddieClubCandidate = {
      club: '8i',
      baselineCarryM: 152,
      manualCarryM: 160,
      source: 'auto',
      samples: 10,
    };

    expect(getEffectiveCarryM(candidate)).toBe(152);
  });
});

describe('chooseClubForConditions', () => {
  it('selects the smallest club covering plays-like distance', () => {
    const club = chooseClubForConditions(baseConditions, [
      { club: '9i', baselineCarryM: 138, samples: 10, source: 'auto' },
      { club: '8i', baselineCarryM: 152, samples: 8, source: 'auto' },
      { club: '7i', baselineCarryM: 160, samples: 6, source: 'auto' },
    ]);

    expect(club?.club).toBe('8i');
  });

  it('breaks ties by samples then club name', () => {
    const club = chooseClubForConditions(baseConditions, [
      { club: '8i', baselineCarryM: 155, samples: 3, source: 'auto' },
      { club: '7i', baselineCarryM: 155, samples: 6, source: 'auto' },
      { club: '6i', baselineCarryM: 170, samples: 2, source: 'auto' },
    ]);

    expect(club?.club).toBe('7i');
  });

  it('falls back to longest club when none cover plays-like distance', () => {
    const club = chooseClubForConditions(
      { ...baseConditions, targetDistanceM: 200 },
      [
        { club: '9i', baselineCarryM: 138, samples: 10, source: 'auto' },
        { club: '8i', baselineCarryM: 148, samples: 8, source: 'auto' },
      ],
    );

    expect(club?.club).toBe('8i');
  });
});

describe('buildCaddieDecision', () => {
  it('assembles decision with plays-like distance and risk', () => {
    const result = buildCaddieDecision(
      baseConditions,
      'straight',
      [
        { club: '8i', baselineCarryM: 148, samples: 8, source: 'auto' },
        { club: '7i', baselineCarryM: 160, samples: 10, source: 'auto' },
      ],
      sampleProfile,
    );

    expect(result?.club).toBe('7i');
    expect(result?.playsLikeDistanceM).toBeCloseTo(computePlaysLikeDistance(baseConditions));
    expect(result?.risk.coreZone.carryMaxM).toBeGreaterThan(result!.risk.coreZone.carryMinM);
  });
});

describe('mapDistanceStatsToCandidate', () => {
  it('converts API distance stats into candidate shape', () => {
    const candidate = mapDistanceStatsToCandidate({
      club: '7i',
      baselineCarryM: 160,
      manualCarryM: 150,
      samples: 12,
      source: 'manual',
      carryStdM: 6,
      lastUpdated: '2024-01-01T00:00:00Z',
    });

    expect(candidate.manualCarryM).toBe(150);
    expect(candidate.samples).toBe(12);
  });
});
