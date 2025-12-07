import { describe, expect, it } from 'vitest';

import {
  buildCaddieDecisionFromContext,
  chooseClubForTargetDistance,
  getEffectiveCarryM,
  getMaxCarryFromBag,
  mapDistanceStatsToCandidate,
  pickClubForDistance,
  riskProfileToBufferM,
  type CaddieClubCandidate,
} from '@app/caddie/CaddieDecisionEngine';
import type { PlayerBag } from '@app/api/bagClient';
import type { BagClubStatsMap } from '@shared/caddie/bagStats';
import { DEFAULT_SETTINGS } from '@app/caddie/caddieSettingsStorage';
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

describe('riskProfileToBufferM', () => {
  it('returns larger buffers for safer profiles', () => {
    expect(riskProfileToBufferM('safe')).toBeGreaterThan(riskProfileToBufferM('normal'));
    expect(riskProfileToBufferM('normal')).toBeGreaterThan(riskProfileToBufferM('aggressive'));
  });
});

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

describe('chooseClubForTargetDistance', () => {
  it('selects the smallest club covering plays-like distance', () => {
    const club = chooseClubForTargetDistance(150, 0, [
      { club: '9i', baselineCarryM: 138, samples: 10, source: 'auto' },
      { club: '8i', baselineCarryM: 152, samples: 8, source: 'auto' },
      { club: '7i', baselineCarryM: 160, samples: 6, source: 'auto' },
    ]);

    expect(club?.club).toBe('8i');
  });

  it('breaks ties by samples then club name', () => {
    const club = chooseClubForTargetDistance(150, 0, [
      { club: '8i', baselineCarryM: 155, samples: 3, source: 'auto' },
      { club: '7i', baselineCarryM: 155, samples: 6, source: 'auto' },
      { club: '6i', baselineCarryM: 170, samples: 2, source: 'auto' },
    ]);

    expect(club?.club).toBe('7i');
  });

  it('falls back to longest club when none cover plays-like distance', () => {
    const club = chooseClubForTargetDistance(200, 0, [
      { club: '9i', baselineCarryM: 138, samples: 10, source: 'auto' },
      { club: '8i', baselineCarryM: 148, samples: 8, source: 'auto' },
    ]);

    expect(club?.club).toBe('8i');
  });
});

describe('buildCaddieDecisionFromContext', () => {
  it('assembles decision with plays-like distance and risk', () => {
    const result = buildCaddieDecisionFromContext({
      conditions: baseConditions,
      explicitIntent: 'straight',
      settings: DEFAULT_SETTINGS,
      clubs: [
        { club: '8i', baselineCarryM: 148, samples: 8, source: 'auto' },
        { club: '7i', baselineCarryM: 160, samples: 10, source: 'auto' },
      ],
      shotShapeProfile: sampleProfile,
    });

    expect(result?.club).toBe('7i');
    expect(result?.playsLikeDistanceM).toBeCloseTo(computePlaysLikeDistance(baseConditions));
    expect(result?.risk.coreZone.carryMaxM).toBeGreaterThan(result!.risk.coreZone.carryMinM);
  });

  it('uses stock shape when explicit intent is missing', () => {
    const result = buildCaddieDecisionFromContext({
      conditions: baseConditions,
      settings: { stockShape: 'draw', riskProfile: 'normal' },
      clubs: [
        { club: '8i', baselineCarryM: 148, samples: 8, source: 'auto' },
        { club: '7i', baselineCarryM: 160, samples: 10, source: 'auto' },
      ],
      shotShapeProfile: { ...sampleProfile, intent: 'draw' },
    });

    expect(result?.intent).toBe('draw');
  });

  it('applies risk profile buffers when choosing clubs', () => {
    const clubs = [
      { club: '9i', baselineCarryM: 155, samples: 5, source: 'auto' as const },
      { club: '8i', baselineCarryM: 165, samples: 5, source: 'auto' as const },
    ];

    const aggressive = buildCaddieDecisionFromContext({
      conditions: baseConditions,
      explicitIntent: 'straight',
      settings: { stockShape: 'straight', riskProfile: 'aggressive' },
      clubs,
      shotShapeProfile: sampleProfile,
    });

    const safe = buildCaddieDecisionFromContext({
      conditions: baseConditions,
      explicitIntent: 'straight',
      settings: { stockShape: 'straight', riskProfile: 'safe' },
      clubs,
      shotShapeProfile: sampleProfile,
    });

    expect(aggressive?.club).toBe('9i');
    expect(safe?.club).toBe('8i');
  });

  it('falls back gracefully when wind data is missing', () => {
    const result = buildCaddieDecisionFromContext({
      conditions: { ...baseConditions, windSpeedMps: Number.NaN, windDirectionDeg: Number.NaN },
      explicitIntent: 'straight',
      settings: DEFAULT_SETTINGS,
      clubs: [
        { club: '9i', baselineCarryM: 150, samples: 5, source: 'auto' as const },
        { club: '8i', baselineCarryM: 160, samples: 5, source: 'auto' as const },
      ],
      shotShapeProfile: sampleProfile,
    });

    expect(result?.playsLikeDistanceM).toBeCloseTo(baseConditions.targetDistanceM);
    expect(result?.club).toBe('8i');
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

describe('bag stats integration', () => {
  const baseBag: PlayerBag = {
    clubs: [
      {
        clubId: '8i',
        label: '8i',
        avgCarryM: 145,
        sampleCount: 0,
        active: true,
      },
      {
        clubId: '7i',
        label: '7i',
        avgCarryM: 155,
        sampleCount: 0,
        active: true,
      },
    ],
  };

  const stats: BagClubStatsMap = {
    '7i': { clubId: '7i', sampleCount: 8, meanDistanceM: 168, p20DistanceM: 160, p80DistanceM: 175 },
  };

  it('prefers calibrated bag stats over stored averages', () => {
    const club = pickClubForDistance(baseBag, 165, stats);
    expect(club).toBe('7i');
    expect(getMaxCarryFromBag(baseBag, stats)).toBeCloseTo(168);
  });

  it('still honors manual overrides even when stats exist', () => {
    const bagWithManual: PlayerBag = {
      clubs: [
        {
          clubId: '7i',
          label: '7i',
          avgCarryM: 150,
          manualAvgCarryM: 140,
          sampleCount: 0,
          active: true,
        },
      ],
    };

    const club = pickClubForDistance(bagWithManual, 145, stats);
    expect(club).toBe('7i');
    expect(getMaxCarryFromBag(bagWithManual, stats)).toBe(140);
  });
});
