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
import type { BagReadinessOverview } from '@shared/caddie/bagReadiness';

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
      distanceSource: 'manual',
      sampleCount: 10,
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
      distanceSource: 'default',
      sampleCount: 10,
    };

    expect(getEffectiveCarryM(candidate)).toBe(152);
  });
});

describe('chooseClubForTargetDistance', () => {
  it('selects the smallest club covering plays-like distance', () => {
    const club = chooseClubForTargetDistance(150, 0, [
      { club: '9i', baselineCarryM: 138, samples: 10, source: 'auto', distanceSource: 'default' },
      { club: '8i', baselineCarryM: 152, samples: 8, source: 'auto', distanceSource: 'default' },
      { club: '7i', baselineCarryM: 160, samples: 6, source: 'auto', distanceSource: 'default' },
    ]);

    expect(club?.club).toBe('8i');
  });

  it('breaks ties by samples then club name', () => {
    const club = chooseClubForTargetDistance(150, 0, [
      { club: '8i', baselineCarryM: 155, samples: 3, source: 'auto', distanceSource: 'default' },
      { club: '7i', baselineCarryM: 155, samples: 6, source: 'auto', distanceSource: 'default' },
      { club: '6i', baselineCarryM: 170, samples: 2, source: 'auto', distanceSource: 'default' },
    ]);

    expect(club?.club).toBe('7i');
  });

  it('falls back to longest club when none cover plays-like distance', () => {
    const club = chooseClubForTargetDistance(200, 0, [
      { club: '9i', baselineCarryM: 138, samples: 10, source: 'auto', distanceSource: 'default' },
      { club: '8i', baselineCarryM: 148, samples: 8, source: 'auto', distanceSource: 'default' },
    ]);

    expect(club?.club).toBe('8i');
  });

  it('leans toward better readiness when distance is tied', () => {
    const club = chooseClubForTargetDistance(150, 0, [
      {
        club: '7i',
        baselineCarryM: 152,
        samples: 8,
        source: 'auto',
        distanceSource: 'default',
        readiness: 'poor',
      },
      {
        club: '8i',
        baselineCarryM: 151,
        samples: 8,
        source: 'auto',
        distanceSource: 'default',
        readiness: 'excellent',
      },
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
        { club: '8i', baselineCarryM: 148, samples: 8, source: 'auto', distanceSource: 'default' },
        { club: '7i', baselineCarryM: 160, samples: 10, source: 'auto', distanceSource: 'default' },
      ],
      shotShapeProfile: sampleProfile,
    });

    expect(result?.club).toBe('7i');
    expect(result?.playsLikeDistanceM).toBeCloseTo(computePlaysLikeDistance(baseConditions));
    expect(result?.risk.coreZone.carryMaxM).toBeGreaterThan(result!.risk.coreZone.carryMinM);
  });

  it('propagates distance source metadata for auto calibrated clubs', () => {
    const result = buildCaddieDecisionFromContext({
      conditions: baseConditions,
      explicitIntent: 'straight',
      settings: DEFAULT_SETTINGS,
      clubs: [
        {
          club: '7i',
          baselineCarryM: 160,
          samples: 10,
          sampleCount: 10,
          minSamples: 5,
          source: 'auto',
          distanceSource: 'auto_calibrated',
        },
      ],
      shotShapeProfile: sampleProfile,
    });

    expect(result?.distanceSource).toBe('auto_calibrated');
    expect(result?.sampleCount).toBe(10);
    expect(result?.minSamples).toBe(5);
  });

  it('prefers more reliable clubs when readiness is stronger', () => {
    const readiness: BagReadinessOverview = {
      readiness: {
        score: 90,
        grade: 'excellent',
        totalClubs: 2,
        calibratedClubs: 2,
        needsMoreSamplesCount: 0,
        noDataCount: 0,
        largeGapCount: 0,
        overlapCount: 0,
      },
      suggestions: [],
      dataStatusByClubId: { '8i': 'auto_calibrated', '7i': 'needs_more_samples' },
    };

    const result = buildCaddieDecisionFromContext({
      conditions: { ...baseConditions, targetDistanceM: 149 },
      explicitIntent: 'straight',
      settings: DEFAULT_SETTINGS,
      clubs: [
        { club: '8i', baselineCarryM: 150, samples: 8, source: 'auto', distanceSource: 'default' },
        { club: '7i', baselineCarryM: 151, samples: 10, source: 'auto', distanceSource: 'default' },
      ],
      shotShapeProfile: { ...sampleProfile, coreCarryMeanM: 150 },
      bagReadinessOverview: readiness,
    });

    expect(result?.club).toBe('8i');
    expect(result?.clubReadiness).toBe('excellent');
  });

  it('still returns a club when readiness is weak', () => {
    const result = buildCaddieDecisionFromContext({
      conditions: baseConditions,
      explicitIntent: 'straight',
      settings: DEFAULT_SETTINGS,
      clubs: [
        { club: '8i', baselineCarryM: 148, samples: 2, source: 'auto', distanceSource: 'default' },
        { club: '7i', baselineCarryM: 160, samples: 2, source: 'auto', distanceSource: 'default' },
      ],
      shotShapeProfile: sampleProfile,
      bagReadinessOverview: {
        readiness: {
          score: 20,
          grade: 'poor',
          totalClubs: 2,
          calibratedClubs: 0,
          needsMoreSamplesCount: 2,
          noDataCount: 0,
          largeGapCount: 0,
          overlapCount: 0,
        },
        suggestions: [],
        dataStatusByClubId: { '7i': 'needs_more_samples', '8i': 'needs_more_samples' },
      },
    });

    expect(result?.club).toBe('7i');
    expect(result?.clubReadiness).toBe('ok');
  });

  it('keeps legacy ordering when readiness is excellent everywhere', () => {
    const readiness: BagReadinessOverview = {
      readiness: {
        score: 95,
        grade: 'excellent',
        totalClubs: 2,
        calibratedClubs: 2,
        needsMoreSamplesCount: 0,
        noDataCount: 0,
        largeGapCount: 0,
        overlapCount: 0,
      },
      suggestions: [],
      dataStatusByClubId: { '8i': 'auto_calibrated', '7i': 'auto_calibrated' },
    };

    const result = buildCaddieDecisionFromContext({
      conditions: baseConditions,
      explicitIntent: 'straight',
      settings: DEFAULT_SETTINGS,
      clubs: [
        { club: '8i', baselineCarryM: 148, samples: 8, source: 'auto', distanceSource: 'default' },
        { club: '7i', baselineCarryM: 160, samples: 10, source: 'auto', distanceSource: 'default' },
      ],
      shotShapeProfile: sampleProfile,
      bagReadinessOverview: readiness,
    });

    expect(result?.club).toBe('7i');
    expect(result?.clubReadiness).toBe('excellent');
  });

  it('propagates partial stat metadata when below threshold', () => {
    const result = buildCaddieDecisionFromContext({
      conditions: baseConditions,
      explicitIntent: 'straight',
      settings: DEFAULT_SETTINGS,
      clubs: [
        {
          club: '7i',
          baselineCarryM: 150,
          samples: 10,
          sampleCount: 2,
          minSamples: 5,
          source: 'auto',
          distanceSource: 'partial_stats',
        },
      ],
      shotShapeProfile: sampleProfile,
    });

    expect(result?.distanceSource).toBe('partial_stats');
    expect(result?.sampleCount).toBe(2);
    expect(result?.minSamples).toBe(5);
  });

  it('marks manual carries correctly', () => {
    const result = buildCaddieDecisionFromContext({
      conditions: baseConditions,
      explicitIntent: 'straight',
      settings: DEFAULT_SETTINGS,
      clubs: [
        {
          club: '7i',
          baselineCarryM: 150,
          manualCarryM: 148,
          samples: 0,
          source: 'manual',
          distanceSource: 'manual',
        },
      ],
      shotShapeProfile: sampleProfile,
    });

    expect(result?.distanceSource).toBe('manual');
    expect(result?.sampleCount).toBe(0);
  });

  it('falls back to defaults when no metadata exists', () => {
    const result = buildCaddieDecisionFromContext({
      conditions: baseConditions,
      explicitIntent: 'straight',
      settings: DEFAULT_SETTINGS,
      clubs: [
        {
          club: '7i',
          baselineCarryM: 150,
          samples: 0,
          source: 'auto',
          distanceSource: 'default',
        },
      ],
      shotShapeProfile: sampleProfile,
    });

    expect(result?.distanceSource).toBe('default');
    expect(result?.sampleCount).toBe(0);
  });

  it('uses stock shape when explicit intent is missing', () => {
    const result = buildCaddieDecisionFromContext({
      conditions: baseConditions,
      settings: { stockShape: 'draw', riskProfile: 'normal' },
      clubs: [
        { club: '8i', baselineCarryM: 148, samples: 8, source: 'auto', distanceSource: 'default' },
        { club: '7i', baselineCarryM: 160, samples: 10, source: 'auto', distanceSource: 'default' },
      ],
      shotShapeProfile: { ...sampleProfile, intent: 'draw' },
    });

    expect(result?.intent).toBe('draw');
  });

  it('applies risk profile buffers when choosing clubs', () => {
    const clubs = [
      { club: '9i', baselineCarryM: 155, samples: 5, source: 'auto' as const, distanceSource: 'default' },
      { club: '8i', baselineCarryM: 165, samples: 5, source: 'auto' as const, distanceSource: 'default' },
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
        { club: '9i', baselineCarryM: 150, samples: 5, source: 'auto' as const, distanceSource: 'default' },
        { club: '8i', baselineCarryM: 160, samples: 5, source: 'auto' as const, distanceSource: 'default' },
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
    expect(candidate.distanceSource).toBe('manual');
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
