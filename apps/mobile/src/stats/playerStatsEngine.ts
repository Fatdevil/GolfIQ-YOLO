import type { RoundSummary } from '../api/roundClient';

export interface PlayerStats {
  roundsPlayed: number;
  avgScore?: number | null;
  avgToPar?: number | null;
  avgPutts?: number | null;
  firPct?: number | null;
  girPct?: number | null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((acc, val) => acc + val, 0);
  return total / values.length;
}

export function computePlayerStats(summaries: RoundSummary[]): PlayerStats {
  const valid = summaries.filter((summary) => summary && summary.holesPlayed > 0);
  const roundsPlayed = valid.length;

  const scoreRounds = valid.filter((summary) => summary.totalStrokes != null);
  const avgScore = mean(scoreRounds.map((summary) => summary.totalStrokes as number));

  const toParRounds = valid.filter(
    (summary) => summary.totalToPar != null && summary.totalPar != null && summary.totalStrokes != null,
  );
  const avgToPar = mean(toParRounds.map((summary) => summary.totalToPar as number));

  const puttRounds = valid.filter((summary) => summary.totalPutts != null);
  const avgPutts = mean(puttRounds.map((summary) => summary.totalPutts as number));

  let firPct: number | null = null;
  const fairwaySamples = valid.filter(
    (summary) => summary.fairwaysHit != null && summary.fairwaysTotal != null,
  );
  const totalFairways = fairwaySamples.reduce(
    (acc, summary) => acc + (summary.fairwaysTotal as number),
    0,
  );
  if (totalFairways > 0) {
    const fairwaysHit = fairwaySamples.reduce(
      (acc, summary) => acc + (summary.fairwaysHit as number),
      0,
    );
    firPct = (fairwaysHit / totalFairways) * 100;
  }

  let girPct: number | null = null;
  const girSamples = valid.filter((summary) => summary.girCount != null);
  const girHoles = girSamples.reduce((acc, summary) => acc + summary.holesPlayed, 0);
  if (girHoles > 0) {
    const girCount = girSamples.reduce((acc, summary) => acc + (summary.girCount as number), 0);
    girPct = (girCount / girHoles) * 100;
  }

  return {
    roundsPlayed,
    avgScore,
    avgToPar,
    avgPutts,
    firPct,
    girPct,
  };
}
