import type { RangeSessionSummary } from '@app/range/rangeSession';

export interface TempoTarget {
  targetRatio: number;
  tolerance: number;
  targetBackswingMs: number;
  targetDownswingMs: number;
}

export interface TempoTrainerConfig {
  defaultRatio: number;
  defaultTolerance: number;
  defaultBackswingMs: number;
  defaultDownswingMs: number;
  minSamplesForPersonal: number;
}

function average(values: number[]): number | null {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return null;
  const total = finite.reduce((sum, value) => sum + value, 0);
  return total / finite.length;
}

export function computeTempoTargetFromHistory(
  summaries: RangeSessionSummary[],
  config: TempoTrainerConfig,
): TempoTarget {
  const ratioSamples: number[] = [];
  const backswingSamples: number[] = [];
  const downswingSamples: number[] = [];

  summaries.forEach((summary) => {
    if (typeof summary.avgTempoRatio === 'number') {
      ratioSamples.push(summary.avgTempoRatio);
    }
    if (typeof summary.avgTempoBackswingMs === 'number') {
      backswingSamples.push(summary.avgTempoBackswingMs);
    }
    if (typeof summary.avgTempoDownswingMs === 'number') {
      downswingSamples.push(summary.avgTempoDownswingMs);
    }
  });

  const totalSamples = summaries.reduce((acc, summary) => acc + (summary.tempoSampleCount ?? 0), 0);
  const hasPersonalData = totalSamples >= config.minSamplesForPersonal && ratioSamples.length > 0;

  const targetRatio = hasPersonalData ? average(ratioSamples) ?? config.defaultRatio : config.defaultRatio;

  const preferredBackswing = average(backswingSamples);
  const preferredDownswing = average(downswingSamples);
  const defaultTotal = config.defaultBackswingMs + config.defaultDownswingMs;
  const personalTotal =
    preferredBackswing != null && preferredDownswing != null
      ? preferredBackswing + preferredDownswing
      : preferredBackswing ?? preferredDownswing ?? null;

  const totalDuration = hasPersonalData && personalTotal ? personalTotal : defaultTotal;
  const targetDownswingMs = Math.round(totalDuration / (targetRatio + 1));
  const targetBackswingMs = Math.round(targetDownswingMs * targetRatio);

  return {
    targetRatio,
    tolerance: config.defaultTolerance,
    targetBackswingMs,
    targetDownswingMs,
  };
}

