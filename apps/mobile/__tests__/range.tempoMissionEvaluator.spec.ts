import { describe, expect, it } from 'vitest';

import { evaluateTempoMissionProgress } from '@app/range/tempoMissionEvaluator';
import type { RangeMission } from '@app/range/rangeMissions';
import type { RangeSessionSummary } from '@app/range/rangeSession';

const baseSummary: RangeSessionSummary = {
  id: 'session-1',
  startedAt: '2024-04-01T00:00:00.000Z',
  finishedAt: '2024-04-01T01:00:00.000Z',
  club: '7i',
  shotCount: 20,
  avgCarryM: 150,
  tendency: 'straight',
  avgTempoRatio: 3.0,
  tempoSampleCount: 20,
};

const tempoMission: RangeMission = {
  id: 'tempo_mission',
  titleKey: 'tempo.title',
  descriptionKey: 'tempo.body',
  kind: 'tempo',
  tempoTargetRatio: 3.0,
  tempoTolerance: 0.2,
  tempoRequiredSamples: 10,
};

describe('evaluateTempoMissionProgress', () => {
  it('returns non-tempo missions as ineligible', () => {
    const mission: RangeMission = { id: 'generic', titleKey: 'title', descriptionKey: 'desc', kind: 'generic' };

    const progress = evaluateTempoMissionProgress(mission, baseSummary);

    expect(progress.isTempoMission).toBe(false);
    expect(progress.completed).toBe(false);
    expect(progress.eligible).toBe(false);
  });

  it('marks tempo missions as ineligible when there are not enough samples', () => {
    const progress = evaluateTempoMissionProgress(tempoMission, { ...baseSummary, tempoSampleCount: 4 });

    expect(progress.isTempoMission).toBe(true);
    expect(progress.eligible).toBe(false);
    expect(progress.completed).toBe(false);
  });

  it('completes the mission when average tempo is inside the band', () => {
    const progress = evaluateTempoMissionProgress(tempoMission, baseSummary);

    expect(progress.isTempoMission).toBe(true);
    expect(progress.eligible).toBe(true);
    expect(progress.completed).toBe(true);
    expect(progress.swingsWithinBand).toBe(baseSummary.tempoSampleCount);
  });

  it('does not complete the mission when average tempo is outside the band', () => {
    const progress = evaluateTempoMissionProgress(tempoMission, { ...baseSummary, avgTempoRatio: 2.5 });

    expect(progress.isTempoMission).toBe(true);
    expect(progress.eligible).toBe(true);
    expect(progress.completed).toBe(false);
  });
});
