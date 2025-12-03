import { describe, expect, it } from 'vitest';

import { computeTempoTargetFromHistory, type TempoTrainerConfig } from '@app/range/tempoTrainerEngine';
import type { RangeSessionSummary } from '@app/range/rangeSession';

const baseConfig: TempoTrainerConfig = {
  defaultRatio: 3.0,
  defaultTolerance: 0.3,
  defaultBackswingMs: 900,
  defaultDownswingMs: 300,
  minSamplesForPersonal: 3,
};

describe('computeTempoTargetFromHistory', () => {
  it('returns defaults when no history is present', () => {
    const target = computeTempoTargetFromHistory([], baseConfig);

    expect(target).toEqual({
      targetRatio: 3.0,
      tolerance: 0.3,
      targetBackswingMs: 900,
      targetDownswingMs: 300,
    });
  });

  it('uses personalized ratio and timings when enough samples are present', () => {
    const summaries: RangeSessionSummary[] = [
      {
        id: 's1',
        startedAt: '2024-01-01',
        finishedAt: '2024-01-01',
        club: '7i',
        shotCount: 10,
        avgTempoRatio: 3.2,
        avgTempoBackswingMs: 960,
        avgTempoDownswingMs: 300,
        tempoSampleCount: 10,
      },
      {
        id: 's2',
        startedAt: '2024-01-02',
        finishedAt: '2024-01-02',
        club: '8i',
        shotCount: 8,
        avgTempoRatio: 3.0,
        avgTempoBackswingMs: 900,
        avgTempoDownswingMs: 310,
        tempoSampleCount: 8,
      },
    ];

    const target = computeTempoTargetFromHistory(summaries, baseConfig);

    expect(target.targetRatio).toBeCloseTo(3.1, 1);
    expect(target.tolerance).toBe(0.3);
    expect(target.targetBackswingMs).toBeGreaterThan(900);
    expect(target.targetDownswingMs).toBeGreaterThan(280);
  });
});

