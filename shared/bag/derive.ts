import type { RoundState, ShotEvent } from '../round/types';
import type { BagDerivation, BagStats, ClubId, ClubSamples, ClubStats } from './types';

const VALID_KINDS: ShotEvent['kind'][] = ['Full', 'Chip', 'Pitch'];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function quantile(values: number[], percentile: number): number | null {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  if (!Number.isFinite(percentile)) {
    percentile = 50;
  }
  const clamped = clamp(percentile, 0, 100);
  if (clamped === 0) {
    return sorted[0];
  }
  if (clamped === 100) {
    return sorted[sorted.length - 1];
  }
  const rank = Math.ceil((clamped / 100) * sorted.length);
  const index = clamp(rank - 1, 0, sorted.length - 1);
  return sorted[index];
}

export function median(values: number[]): number | null {
  return quantile(values, 50);
}

export function interquartileRange(values: number[]): { q1: number; q3: number; iqr: number } | null {
  if (values.length < 2) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 25);
  const q3 = quantile(sorted, 75);
  if (!isFiniteNumber(q1) || !isFiniteNumber(q3)) {
    return null;
  }
  return { q1, q3, iqr: Math.max(0, q3 - q1) };
}

export function medianAbsoluteDeviation(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  const med = median(values);
  if (!isFiniteNumber(med)) {
    return null;
  }
  const deviations = values.map((value) => Math.abs(value - med));
  const mad = median(deviations);
  if (!isFiniteNumber(mad)) {
    return null;
  }
  return mad;
}

export function standardDeviation(values: number[]): number | null {
  if (values.length < 2) {
    return values.length === 1 ? 0 : null;
  }
  const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
  const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function normalizeCarry(carry: number, playsLikePct?: number): number {
  if (!isFiniteNumber(carry) || carry <= 0) {
    return 0;
  }
  if (!isFiniteNumber(playsLikePct)) {
    return carry;
  }
  const capped = clamp(playsLikePct, -8, 8);
  const factor = 1 + capped / 100;
  if (factor <= 0) {
    return carry;
  }
  return carry / factor;
}

type ShotSample = {
  carry: number;
  sg?: number;
  originalCarry: number;
};

type ClubAccumulator = {
  samples: ShotSample[];
  usage: { tee: number; approach: number; other: number };
};

function ensureClubId(value: unknown): ClubId | null {
  if (typeof value === 'string' && value.trim().length) {
    return value.trim() as ClubId;
  }
  return null;
}

function gatherSamples(rounds: RoundState[]): Map<ClubId, ClubAccumulator> {
  const byClub = new Map<ClubId, ClubAccumulator>();
  for (const round of rounds) {
    if (!round || typeof round !== 'object' || !round.holes) {
      continue;
    }
    for (const hole of Object.values(round.holes)) {
      if (!hole?.shots?.length) {
        continue;
      }
      for (const shot of hole.shots) {
        if (!shot || !VALID_KINDS.includes(shot.kind)) {
          continue;
        }
        if (!isFiniteNumber(shot.carry_m) || (shot.carry_m ?? 0) <= 0) {
          continue;
        }
        const clubId = ensureClubId(shot.club);
        if (!clubId) {
          continue;
        }
        const playsLikePct = isFiniteNumber((shot as ShotEvent & { playsLikePct?: number }).playsLikePct)
          ? (shot as ShotEvent & { playsLikePct?: number }).playsLikePct
          : undefined;
        const normalized = normalizeCarry(shot.carry_m!, playsLikePct);
        if (normalized <= 0) {
          continue;
        }
        const entry = byClub.get(clubId) ?? {
          samples: [],
          usage: { tee: 0, approach: 0, other: 0 },
        };
        if (!byClub.has(clubId)) {
          byClub.set(clubId, entry);
        }
        if (shot.startLie === 'Tee') {
          entry.usage.tee += 1;
        } else if (shot.startLie === 'Fairway' || shot.startLie === 'Rough' || shot.startLie === 'Sand') {
          entry.usage.approach += 1;
        } else {
          entry.usage.other += 1;
        }
        entry.samples.push({
          carry: normalized,
          originalCarry: shot.carry_m!,
          sg: isFiniteNumber(shot.sg) ? shot.sg : undefined,
        });
      }
    }
  }
  return byClub;
}

function trimSamples(samples: ShotSample[]): { kept: ShotSample[]; outlierCount: number } {
  if (samples.length === 0) {
    return { kept: [], outlierCount: 0 };
  }
  const carries = samples.map((sample) => sample.carry);
  if (samples.length >= 5) {
    const range = interquartileRange(carries);
    if (!range || range.iqr === 0) {
      return { kept: [...samples], outlierCount: 0 };
    }
    const lower = range.q1 - 1.5 * range.iqr;
    const upper = range.q3 + 1.5 * range.iqr;
    const kept = samples.filter((sample) => sample.carry >= lower && sample.carry <= upper);
    return { kept, outlierCount: samples.length - kept.length };
  }
  if (samples.length >= 3) {
    const mad = medianAbsoluteDeviation(carries);
    const med = median(carries);
    if (isFiniteNumber(mad) && isFiniteNumber(med) && mad > 0) {
      const threshold = 3 * mad;
      const kept = samples.filter((sample) => Math.abs(sample.carry - med) <= threshold);
      return { kept, outlierCount: samples.length - kept.length };
    }
  }
  return { kept: [...samples], outlierCount: 0 };
}

function summarizeClub(club: ClubId, samples: ShotSample[], usage: ClubAccumulator['usage']): ClubSamples {
  const carries = samples.map((sample) => sample.carry);
  const trimmed = trimSamples(samples);
  const trimmedCarries = trimmed.kept.map((sample) => sample.carry);
  const sgValues = trimmed.kept.map((sample) => sample.sg).filter(isFiniteNumber) as number[];
  return {
    club,
    carries,
    trimmedCarries,
    sgValues,
    usage: { ...usage, outliers: trimmed.outlierCount },
  };
}

function buildClubStats(sample: ClubSamples): ClubStats {
  const { club, trimmedCarries, sgValues } = sample;
  const stats: ClubStats = {
    club,
    samples: trimmedCarries.length,
    meanCarry_m: null,
    p25_m: null,
    p50_m: null,
    p75_m: null,
    std_m: null,
    sgPerShot: null,
  };
  if (!trimmedCarries.length) {
    return stats;
  }
  const sum = trimmedCarries.reduce((acc, value) => acc + value, 0);
  stats.meanCarry_m = sum / trimmedCarries.length;
  stats.p25_m = quantile(trimmedCarries, 25);
  stats.p50_m = quantile(trimmedCarries, 50);
  stats.p75_m = quantile(trimmedCarries, 75);
  stats.std_m = standardDeviation(trimmedCarries);
  if (sgValues.length) {
    stats.sgPerShot = sgValues.reduce((acc, value) => acc + value, 0) / sgValues.length;
  }
  return stats;
}

export interface BuildBagStatsOptions {
  updatedAt?: number;
}

export function deriveBag(rounds: RoundState[], opts: BuildBagStatsOptions = {}): BagDerivation {
  const samplesByClub = gatherSamples(rounds);
  const clubSamples: Record<ClubId, ClubSamples> = {} as Record<ClubId, ClubSamples>;
  const clubStats: Record<ClubId, ClubStats> = {} as Record<ClubId, ClubStats>;
  for (const [club, accumulator] of samplesByClub.entries()) {
    if (!accumulator.samples.length) {
      continue;
    }
    const sample = summarizeClub(club, accumulator.samples, accumulator.usage);
    clubSamples[club] = sample;
    clubStats[club] = buildClubStats(sample);
  }
  const updatedAt = isFiniteNumber(opts.updatedAt) ? Number(opts.updatedAt) : Date.now();
  return {
    stats: { updatedAt, clubs: clubStats },
    samples: clubSamples,
  };
}

export function buildBagStats(rounds: RoundState[], opts?: BuildBagStatsOptions): BagStats {
  return deriveBag(rounds, opts).stats;
}

export function getClubSamples(rounds: RoundState[]): Record<ClubId, ClubSamples> {
  return deriveBag(rounds).samples;
}
