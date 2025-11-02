import type { BagStats, ClubId, ClubStats } from './types';

const MIN_SAMPLES = 3;
const PUTTER_ID: ClubId = 'Putter';

type TeeSuggestionInput = {
  bag: BagStats;
  holePar: number;
  nextHoleYardage_m?: number;
};

type TeeSuggestion = { club: ClubId; p50_m: number; p75_m: number } | null;

type ApproachSuggestionInput = { bag: BagStats; distanceToPin_m: number };
type ApproachSuggestion = { club: ClubId; p50_m: number; p25_m: number } | null;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCandidate(stats: ClubStats | undefined): stats is ClubStats {
  if (!stats) {
    return false;
  }
  if (stats.club === PUTTER_ID) {
    return false;
  }
  if (!isFiniteNumber(stats.p50_m)) {
    return false;
  }
  return Number(stats.samples) >= MIN_SAMPLES;
}

function scoreDistance(target: number, stats: ClubStats): number {
  const p50 = stats.p50_m!;
  const withinQuartiles =
    isFiniteNumber(stats.p25_m) &&
    isFiniteNumber(stats.p75_m) &&
    target >= (stats.p25_m as number) &&
    target <= (stats.p75_m as number);
  const baseScore = Math.abs(target - p50);
  return withinQuartiles ? baseScore * 0.5 : baseScore;
}

function sortClubs(clubs: ClubStats[]): ClubStats[] {
  return [...clubs].sort((a, b) => {
    const p50a = isFiniteNumber(a.p50_m) ? (a.p50_m as number) : Number.POSITIVE_INFINITY;
    const p50b = isFiniteNumber(b.p50_m) ? (b.p50_m as number) : Number.POSITIVE_INFINITY;
    if (p50a === p50b) {
      return a.club.localeCompare(b.club);
    }
    return p50a - p50b;
  });
}

function findBestMatch(target: number, candidates: ClubStats[]): ClubStats | null {
  let best: { stats: ClubStats; score: number } | null = null;
  for (const stats of candidates) {
    if (!isCandidate(stats)) {
      continue;
    }
    const score = scoreDistance(target, stats);
    if (!best || score < best.score || (score === best.score && stats.p50_m! > best.stats.p50_m!)) {
      best = { stats, score };
    }
  }
  return best?.stats ?? null;
}

export function nextTeeSuggestion(input: TeeSuggestionInput): TeeSuggestion {
  const { bag, nextHoleYardage_m } = input;
  if (!bag || !bag.clubs) {
    return null;
  }
  const target = isFiniteNumber(nextHoleYardage_m) ? (nextHoleYardage_m as number) : undefined;
  const stats = Object.values(bag.clubs);
  const candidates = sortClubs(stats).filter(isCandidate);
  if (!candidates.length) {
    return null;
  }
  const desired = target ?? (input.holePar >= 4 ? candidates[0].p50_m! : candidates[0].p50_m! * 0.5);
  const match = findBestMatch(desired, candidates);
  if (!match) {
    return null;
  }
  if (!isFiniteNumber(match.p75_m)) {
    return null;
  }
  return { club: match.club, p50_m: match.p50_m!, p75_m: match.p75_m! };
}

export function approachSuggestion(input: ApproachSuggestionInput): ApproachSuggestion {
  const { bag, distanceToPin_m } = input;
  if (!bag || !bag.clubs || !isFiniteNumber(distanceToPin_m)) {
    return null;
  }
  const stats = Object.values(bag.clubs);
  const candidates = sortClubs(stats).filter(isCandidate);
  if (!candidates.length) {
    return null;
  }
  const match = findBestMatch(distanceToPin_m, candidates);
  if (!match || !isFiniteNumber(match.p25_m)) {
    return null;
  }
  return { club: match.club, p50_m: match.p50_m!, p25_m: match.p25_m! };
}

export type { TeeSuggestionInput, ApproachSuggestionInput, TeeSuggestion, ApproachSuggestion };
