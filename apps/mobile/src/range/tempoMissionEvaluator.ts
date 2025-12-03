import type { RangeMission } from '@app/range/rangeMissions';
import type { RangeSessionSummary } from '@app/range/rangeSession';

export interface TempoMissionProgress {
  isTempoMission: boolean;
  completed: boolean;
  eligible: boolean;
  swingsWithinBand?: number;
  totalTempoSamples?: number;
  lowerBound?: number;
  upperBound?: number;
}

function isTempoMission(mission: RangeMission): boolean {
  return mission.kind === 'tempo';
}

function roundTempo(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  return Math.round(value * 10) / 10;
}

export function evaluateTempoMissionProgress(
  mission: RangeMission,
  summary: RangeSessionSummary,
): TempoMissionProgress {
  if (!isTempoMission(mission)) {
    return { isTempoMission: false, completed: false, eligible: false };
  }

  const tempoSamples = summary.tempoSampleCount ?? 0;
  const required = mission.tempoRequiredSamples ?? 0;
  const avgTempoRatio = summary.avgTempoRatio;

  if (tempoSamples < required || avgTempoRatio == null) {
    return {
      isTempoMission: true,
      completed: false,
      eligible: false,
      totalTempoSamples: tempoSamples,
      lowerBound: mission.tempoTargetRatio && mission.tempoTolerance
        ? roundTempo(mission.tempoTargetRatio - mission.tempoTolerance)
        : undefined,
      upperBound: mission.tempoTargetRatio && mission.tempoTolerance
        ? roundTempo(mission.tempoTargetRatio + mission.tempoTolerance)
        : undefined,
    };
  }

  const target = mission.tempoTargetRatio ?? avgTempoRatio;
  const tolerance = mission.tempoTolerance ?? 0.3;
  const lower = target - tolerance;
  const upper = target + tolerance;
  const completed = avgTempoRatio >= lower && avgTempoRatio <= upper;

  return {
    isTempoMission: true,
    completed,
    eligible: true,
    swingsWithinBand: completed ? tempoSamples : undefined,
    totalTempoSamples: tempoSamples,
    lowerBound: roundTempo(lower),
    upperBound: roundTempo(upper),
  };
}
