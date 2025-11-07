import { GOLDEN6_DRILL_LIBRARY } from './library';
import type { GoldenDrillTile, GoldenMetric, GoldenMetricKey, GoldenSnapshot } from './types';

const DEFAULT_ALPHA = 0.2;
const MAX_WEIGHT = 10_000;

type EmaState = {
  ema: number | null;
  samples: number;
};

type DrillAccumulator = {
  key: GoldenMetricKey;
  label: string;
  unit?: string;
  quality: GoldenMetric['quality'];
  today: number | null;
  target: { min: number; max: number } | null;
  emaState: EmaState;
  quickDrills: string[];
};

const sanitizeNumber = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const clampWeight = (value: number | undefined): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(MAX_WEIGHT, Math.max(0, Number(value)));
};

const updateWeightedEma = (state: EmaState, value: number | null, weight: number, alpha: number): EmaState => {
  const w = clampWeight(weight);
  if (!Number.isFinite(alpha) || alpha <= 0) {
    return state;
  }
  if (value == null || !Number.isFinite(value) || w <= 0) {
    return state;
  }
  if (state.ema == null) {
    return {
      ema: value,
      samples: w,
    };
  }
  const alphaEff = 1 - Math.pow(1 - alpha, w);
  const ema = state.ema + (value - state.ema) * alphaEff;
  return {
    ema,
    samples: state.samples + w,
  };
};

const resolveClubKey = (club?: string | null): string => {
  if (!club) {
    return '';
  }
  return club.trim().toLowerCase();
};

type ClubFamily = 'wood' | 'midIron' | 'wedge';

const resolveClubFamily = (club?: string | null): ClubFamily => {
  const key = resolveClubKey(club);
  if (!key) {
    return 'midIron';
  }
  if (key.includes('driver') || key.endsWith('dr') || key.endsWith('1w') || key.includes('wood') || /^\d+w$/.test(key)) {
    return 'wood';
  }
  if (key.includes('wedge') || /[pgls]w$/.test(key)) {
    return 'wedge';
  }
  return 'midIron';
};

const resolveTarget = (key: GoldenMetricKey, club?: string | null): { min: number; max: number } | null => {
  switch (key) {
    case 'startLine':
      return { min: -1, max: 1 };
    case 'faceToPathIdx':
      return { min: -0.2, max: 0.2 };
    case 'tempo':
      return { min: 2.4, max: 3.6 };
    case 'lowPointSign':
      return { min: -1, max: 0 };
    case 'launchProxy': {
      const family = resolveClubFamily(club);
      if (family === 'wood') {
        return { min: 7, max: 12 };
      }
      if (family === 'wedge') {
        return { min: 28, max: 36 };
      }
      return { min: 18, max: 22 };
    }
    case 'dynLoftProxy':
      return { min: -2, max: 2 };
    default:
      return null;
  }
};

const toAccumulator = (
  metric: GoldenMetric,
  club: string | undefined,
): DrillAccumulator => ({
  key: metric.key,
  label: metric.label,
  unit: metric.unit,
  quality: metric.quality,
  today: sanitizeNumber(metric.value),
  target: resolveTarget(metric.key, club),
  emaState: { ema: null, samples: 0 },
  quickDrills: GOLDEN6_DRILL_LIBRARY[metric.key]?.drills.slice(0, 3) ?? [],
});

export function buildGoldenDrillTiles(
  snapshots: GoldenSnapshot[],
  options?: { alpha?: number },
): GoldenDrillTile[] {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return [];
  }
  const alpha = Number.isFinite(options?.alpha) ? Number(options?.alpha) : DEFAULT_ALPHA;
  const sorted = snapshots
    .filter((item) => item && Array.isArray(item.metrics))
    .slice()
    .sort((a, b) => a.ts - b.ts);

  const latest = sorted[sorted.length - 1];
  const latestMetrics = (latest?.metrics ?? []).filter((metric) => metric && typeof metric.key === 'string');
  if (!latestMetrics.length) {
    return [];
  }

  const accumulators = new Map<GoldenMetricKey, DrillAccumulator>();
  for (const metric of latestMetrics) {
    accumulators.set(metric.key, toAccumulator(metric, latest?.club));
  }

  for (const snapshot of sorted) {
    if (!snapshot?.metrics) {
      continue;
    }
    for (const metric of snapshot.metrics) {
      if (!accumulators.has(metric.key)) {
        continue;
      }
      const acc = accumulators.get(metric.key)!;
      const value = sanitizeNumber(metric.value);
      const samples = clampWeight(metric.sampleCount ?? 1);
      acc.emaState = updateWeightedEma(acc.emaState, value, samples, alpha);
      // Preserve most recent quality/value from latest snapshot
      if (snapshot === latest) {
        acc.today = value;
        acc.quality = metric.quality;
      }
    }
  }

  const tiles: GoldenDrillTile[] = [];
  for (const acc of accumulators.values()) {
    const ema = acc.emaState.ema;
    const today = acc.today;
    const delta = today != null && ema != null ? today - ema : null;
    tiles.push({
      key: acc.key,
      label: acc.label,
      unit: acc.unit,
      quality: acc.quality,
      today: today ?? null,
      ema: ema ?? (today ?? null),
      delta,
      target: acc.target,
      quickDrills: acc.quickDrills,
      samples: acc.emaState.samples,
    });
  }

  tiles.sort((a, b) => a.label.localeCompare(b.label));
  return tiles;
}
