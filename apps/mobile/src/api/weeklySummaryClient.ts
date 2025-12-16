import { listRoundSummaries, listRounds, type RoundInfo, type RoundSummary } from './roundClient';

export type WeeklyFocusCategory = 'driving' | 'approach' | 'short_game' | 'putting' | 'overall';

export type WeeklySummary = {
  startDate: string; // ISO
  endDate: string; // ISO
  roundsPlayed: number;
  holesPlayed: number;
  highlight?: {
    label: string;
    value: string;
    roundId?: string;
  };
  focusCategory?: WeeklyFocusCategory;
  focusHints: string[];
};

const MS_IN_DAY = 1000 * 60 * 60 * 24;

function formatToPar(value?: number | null): string | null {
  if (value == null) return null;
  if (value === 0) return 'E';
  return value > 0 ? `+${value}` : `${value}`;
}

function isWithinRange(date: string | undefined | null, start: Date, end: Date): boolean {
  if (!date) return false;
  const ts = new Date(date).getTime();
  if (Number.isNaN(ts)) return false;
  return ts >= start.getTime() && ts <= end.getTime();
}

export function aggregateWeeklySummary(
  rounds: RoundInfo[],
  summaries: RoundSummary[],
  days = 7,
  now: Date = new Date(),
): WeeklySummary {
  const endDate = now;
  const startDate = new Date(endDate.getTime() - (days - 1) * MS_IN_DAY);
  const summariesById = new Map(summaries.map((s) => [s.roundId, s] as const));

  const recentRounds = rounds.filter((round) =>
    isWithinRange(round.endedAt ?? round.startedAt, startDate, endDate),
  );

  const weeklyDetails = recentRounds.map((round) => ({
    round,
    summary: summariesById.get(round.id),
  }));

  let holesPlayed = 0;
  let focusCategory: WeeklyFocusCategory | undefined;
  const focusHints: string[] = [];

  const drivingStats = { hit: 0, total: 0 };
  const girStats = { gir: 0, holes: 0 };
  let totalPutts = 0;

  weeklyDetails.forEach(({ summary, round }) => {
    if (summary?.holesPlayed != null) {
      holesPlayed += summary.holesPlayed;
    } else {
      holesPlayed += round.holes ?? 0;
    }
    if (summary?.fairwaysHit != null && summary.fairwaysTotal != null) {
      drivingStats.hit += summary.fairwaysHit;
      drivingStats.total += summary.fairwaysTotal;
    }
    if (summary?.girCount != null && round.holes) {
      girStats.gir += summary.girCount;
      girStats.holes += round.holes;
    }
    if (summary?.totalPutts != null) {
      totalPutts += summary.totalPutts;
    }
  });

  const highlightCandidate = weeklyDetails
    .filter(({ summary }) => summary?.totalStrokes != null || summary?.totalToPar != null)
    .sort((a, b) => {
      const aToPar = a.summary?.totalToPar;
      const bToPar = b.summary?.totalToPar;
      if (aToPar != null && bToPar != null) return aToPar - bToPar;
      if (aToPar != null) return -1;
      if (bToPar != null) return 1;
      const aStrokes = a.summary?.totalStrokes ?? Infinity;
      const bStrokes = b.summary?.totalStrokes ?? Infinity;
      return aStrokes - bStrokes;
    })[0];

  let highlight: WeeklySummary['highlight'];
  if (highlightCandidate?.summary) {
    const best = highlightCandidate.summary;
    const toParLabel = formatToPar(best.totalToPar);
    const strokesLabel =
      best.totalStrokes != null ? `${best.totalStrokes}${toParLabel ? ` (${toParLabel})` : ''}` : undefined;
    highlight = {
      label: 'Best round',
      value: strokesLabel ?? toParLabel ?? '',
      roundId: highlightCandidate.round.id,
    };
  }

  const roundsPlayed = weeklyDetails.length;

  if (roundsPlayed > 0) {
    if (drivingStats.total >= 6 && drivingStats.hit / Math.max(drivingStats.total, 1) < 0.5) {
      focusCategory = 'driving';
      focusHints.push('Aim for more fairways: choose a confident club off the tee and favor the wide side.');
    }
    if (girStats.holes >= 6 && girStats.gir / Math.max(girStats.holes, 1) < 0.35) {
      focusCategory = focusCategory ?? 'approach';
      focusHints.push('Give yourself birdie looks: pace stock irons and favor center targets.');
    }
    const avgPutts = holesPlayed > 0 ? totalPutts / holesPlayed : null;
    if (avgPutts && avgPutts > 1.9) {
      focusCategory = focusCategory ?? 'putting';
      focusHints.push('Speed control first: rehearse 30–40 ft pace and clean up your 3-footers.');
    }
    if (focusHints.length === 0) {
      focusCategory = focusCategory ?? 'overall';
      focusHints.push('Solid week—keep building reps with another round or focused range session.');
    }
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    roundsPlayed,
    holesPlayed,
    highlight,
    focusCategory,
    focusHints: focusHints.slice(0, 3),
  };
}

export async function fetchWeeklySummary(days = 7): Promise<WeeklySummary> {
  const [rounds, summaries] = await Promise.all([listRounds(50), listRoundSummaries(50)]);
  return aggregateWeeklySummary(rounds, summaries, days);
}
