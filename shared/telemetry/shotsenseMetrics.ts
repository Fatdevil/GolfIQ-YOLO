import type { ShotEvent } from '../round/types';

export type HoleAccuracyRow = {
  roundId: string;
  hole: number;
  tp: number;
  fp: number;
  fn: number;
  timestamp: number;
};

const MATCH_WINDOW_MS = 2000;

const rows: HoleAccuracyRow[] = [];

type Confusion = { tp: number; fp: number; fn: number };

function extractTimestamp(shot: ShotEvent): number | null {
  if (shot && typeof shot === 'object') {
    const startTs = (shot.start as { ts?: number } | undefined)?.ts;
    if (Number.isFinite(Number(startTs))) {
      return Number(startTs);
    }
    const fallback = (shot as { ts?: number }).ts;
    if (Number.isFinite(Number(fallback))) {
      return Number(fallback);
    }
  }
  return null;
}

export function computeConfusion(autoAccepted: ShotEvent[], confirmed: ShotEvent[]): Confusion {
  const autoShots = autoAccepted
    .map((shot) => extractTimestamp(shot))
    .filter((ts): ts is number => Number.isFinite(ts))
    .sort((a, b) => a - b);

  const confirmedShots = confirmed
    .map((shot, index) => ({
      ts: extractTimestamp(shot),
      source: typeof shot.source === 'string' ? shot.source : undefined,
      index,
    }))
    .filter((entry): entry is { ts: number; source: string | undefined; index: number } =>
      Number.isFinite(entry.ts),
    )
    .sort((a, b) => a.ts - b.ts);

  let tp = 0;
  let fp = 0;
  const matched = new Set<number>();

  for (const ts of autoShots) {
    let bestIndex = -1;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const candidate of confirmedShots) {
      if (matched.has(candidate.index)) {
        continue;
      }
      const delta = Math.abs(candidate.ts - ts);
      if (delta > MATCH_WINDOW_MS) {
        if (candidate.ts > ts && delta > bestDelta) {
          break;
        }
        continue;
      }
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = candidate.index;
      }
    }
    if (bestIndex >= 0) {
      matched.add(bestIndex);
      tp += 1;
    } else {
      fp += 1;
    }
  }

  let fn = 0;
  for (const shot of confirmedShots) {
    if (matched.has(shot.index)) {
      continue;
    }
    const source = typeof shot.source === 'string' ? shot.source.toLowerCase() : '';
    if (source === 'auto') {
      continue;
    }
    fn += 1;
  }

  return { tp, fp, fn };
}

function clampMetric(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function normalizeHole(hole: number): number {
  if (!Number.isFinite(hole)) {
    return 0;
  }
  return Math.max(0, Math.floor(hole));
}

function normalizeRoundId(roundId: string): string {
  if (typeof roundId !== 'string') {
    return '';
  }
  return roundId.trim();
}

export function appendHoleAccuracy(
  roundId: string,
  hole: number,
  metrics: { tp: number; fp: number; fn: number },
): void {
  const row: HoleAccuracyRow = {
    roundId: normalizeRoundId(roundId),
    hole: normalizeHole(hole),
    tp: clampMetric(metrics.tp),
    fp: clampMetric(metrics.fp),
    fn: clampMetric(metrics.fn),
    timestamp: Date.now(),
  };
  rows.push(row);
  try {
    if (typeof console !== 'undefined' && typeof console.log === 'function') {
      console.log('SS-ACCURACY', JSON.stringify(row));
    }
  } catch {
    // ignore logging errors
  }
}

export function exportAccuracyNdjson(): string {
  return rows.map((row) => JSON.stringify(row)).join('\n');
}

export const __TESTING__ = {
  _rows: rows,
  clear(): void {
    rows.splice(0, rows.length);
  },
};
