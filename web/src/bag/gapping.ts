import type { RangeShot } from "@web/range/types";

const isFinitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export interface GappingStats {
  clubId: string;
  samples: number;
  meanCarry_m: number | null;
  p25_m: number | null;
  p50_m: number | null;
  p75_m: number | null;
  std_m: number | null;
}

export function computeGappingStats(shots: RangeShot[]): GappingStats | null {
  const carries = shots
    .map((shot) => ({
      clubId: shot.clubId ?? shot.club,
      carry: shot.metrics.carryM,
    }))
    .filter(
      (entry): entry is { clubId: string; carry: number } =>
        typeof entry.clubId === "string" && entry.clubId.length > 0 && isFinitePositive(entry.carry)
    );

  const samples = carries.length;
  if (samples === 0) {
    return null;
  }

  const clubId = carries[0].clubId;
  const values = carries.map((entry) => entry.carry).sort((a, b) => a - b);
  const sum = values.reduce((acc, value) => acc + value, 0);
  const mean = sum / samples;

  const percentile = (p: number) => {
    if (values.length === 0) return null;
    const index = (values.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) {
      return values[lower];
    }
    const weight = index - lower;
    return values[lower] * (1 - weight) + values[upper] * weight;
  };

  const meanCarry_m = mean;
  const p25_m = percentile(0.25);
  const p50_m = percentile(0.5);
  const p75_m = percentile(0.75);

  let std_m: number | null = null;
  if (samples >= 2) {
    const variance =
      values.reduce((acc, value) => acc + (value - mean) * (value - mean), 0) / (samples - 1);
    std_m = Math.sqrt(variance);
  }

  return {
    clubId,
    samples,
    meanCarry_m,
    p25_m,
    p50_m,
    p75_m,
    std_m,
  };
}

export function recommendedCarry(stats: GappingStats | null): number | null {
  return stats?.p50_m ?? stats?.meanCarry_m ?? null;
}
