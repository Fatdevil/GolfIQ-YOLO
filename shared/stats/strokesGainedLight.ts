import type { ShotEvent } from '../round/types';

export type SgCategory = 'tee' | 'approach' | 'short_game' | 'putting';

export type StrokesGainedLightCategory = SgCategory;

export interface StrokesGainedLightCategoryBreakdown {
  category: SgCategory;
  shots: number;
  delta: number;
  confidence: number;
}

export interface StrokesGainedLightSummary {
  totalDelta: number;
  byCategory: StrokesGainedLightCategoryBreakdown[];
  focusCategory?: StrokesGainedLightCategory | null;
}

export interface StrokesGainedBaselineBucket {
  bucket: string;
  expectedStrokes: number;
}

export interface StrokesGainedBaseline {
  expectedStrokesByBucket: StrokesGainedBaselineBucket[];
}

export const DEFAULT_STROKES_GAINED_BASELINE: StrokesGainedBaseline = {
  expectedStrokesByBucket: [
    { bucket: 'tee_par4', expectedStrokes: 3.7 },
    { bucket: 'tee_par5', expectedStrokes: 4.6 },
    { bucket: 'tee_other', expectedStrokes: 3.2 },
    { bucket: 'penalty', expectedStrokes: 2 },
    { bucket: 'fairway_150_plus', expectedStrokes: 3.6 },
    { bucket: 'fairway_80_150', expectedStrokes: 2.8 },
    { bucket: 'fairway_30_80', expectedStrokes: 2.2 },
    { bucket: 'rough_150_plus', expectedStrokes: 4 },
    { bucket: 'rough_80_150', expectedStrokes: 3.2 },
    { bucket: 'rough_30_80', expectedStrokes: 2.6 },
    { bucket: 'sand_30_80', expectedStrokes: 2.8 },
    { bucket: 'sand_80_plus', expectedStrokes: 3.6 },
    { bucket: 'short_15_30', expectedStrokes: 1.8 },
    { bucket: 'short_5_15', expectedStrokes: 1.5 },
    { bucket: 'green_10_plus', expectedStrokes: 2.1 },
    { bucket: 'green_5_10', expectedStrokes: 1.6 },
    { bucket: 'green_inside_5', expectedStrokes: 1.2 },
    { bucket: 'holed', expectedStrokes: 0 },
  ],
};

function bucketForShot(
  shot: ShotEvent,
  holePars?: Record<number, number | undefined>,
): string | null {
  const distanceStart = shot.toPinStart_m ?? null;
  const distanceEnd = shot.toPinEnd_m ?? null;
  const par = holePars?.[shot.hole];

  if (shot.startLie === 'Tee') {
    if (par === 4) return 'tee_par4';
    if (par === 5) return 'tee_par5';
    return 'tee_other';
  }

  if (shot.startLie === 'Penalty') {
    return 'penalty';
  }

  if (shot.startLie === 'Green' || shot.kind === 'Putt') {
    if (distanceStart == null) return null;
    if (distanceStart <= 5) return 'green_inside_5';
    if (distanceStart <= 10) return 'green_5_10';
    return 'green_10_plus';
  }

  if (distanceStart == null) return null;

  if (distanceStart <= 30) {
    if (distanceStart <= 5) return 'short_5_15';
    return 'short_15_30';
  }

  const isFairway = shot.startLie === 'Fairway';
  const isSand = shot.startLie === 'Sand';
  const isRough = shot.startLie === 'Rough' || shot.startLie === 'Recovery';

  if (isFairway) {
    if (distanceStart <= 80) return 'fairway_30_80';
    if (distanceStart <= 150) return 'fairway_80_150';
    return 'fairway_150_plus';
  }

  if (isSand) {
    if (distanceStart <= 80) return 'sand_30_80';
    return 'sand_80_plus';
  }

  if (isRough) {
    if (distanceStart <= 80) return 'rough_30_80';
    if (distanceStart <= 150) return 'rough_80_150';
    return 'rough_150_plus';
  }

  if (distanceStart <= 10) return 'short_5_15';
  if (distanceStart <= 30) return 'short_15_30';

  return null;
}

function bucketForEnd(
  shot: ShotEvent,
  holePars?: Record<number, number | undefined>,
): string | null {
  if (shot.endLie === 'Green' || shot.kind === 'Putt') {
    const distanceEnd = shot.toPinEnd_m ?? null;
    if (distanceEnd == null) return 'green_10_plus';
    if (distanceEnd <= 0.5) return 'holed';
    if (distanceEnd <= 5) return 'green_inside_5';
    if (distanceEnd <= 10) return 'green_5_10';
    return 'green_10_plus';
  }

  if (shot.endLie === 'Penalty') {
    return 'penalty';
  }

  if (shot.toPinEnd_m === 0) return 'holed';
  return bucketForShot(
    { ...shot, startLie: shot.endLie ?? shot.startLie, toPinStart_m: shot.toPinEnd_m },
    holePars,
  );
}

function lookupExpected(baseline: StrokesGainedBaseline, bucket: string | null): number | null {
  if (!bucket) return null;
  const match = baseline.expectedStrokesByBucket.find((entry) => entry.bucket === bucket);
  return match?.expectedStrokes ?? null;
}

function categoryForShot(shot: ShotEvent, distanceStart: number | null): SgCategory {
  if (shot.startLie === 'Tee') return 'tee';
  if (shot.startLie === 'Green' || shot.kind === 'Putt') return 'putting';
  if (distanceStart != null && distanceStart <= 30) return 'short_game';
  return 'approach';
}

export const STROKES_GAINED_LIGHT_MIN_CONFIDENCE = 0.3;
export const STROKES_GAINED_LIGHT_MIN_ABSOLUTE_DELTA = 0.2;

export function deriveStrokesGainedLightFocusCategory(
  summary: StrokesGainedLightSummary,
): StrokesGainedLightCategory | null {
  const eligible = summary?.byCategory?.filter(
    (entry) => entry.confidence >= STROKES_GAINED_LIGHT_MIN_CONFIDENCE && Number.isFinite(entry.delta),
  );

  if (!eligible?.length) {
    return null;
  }

  const worst = eligible.reduce((acc, curr) => (curr.delta < acc.delta ? curr : acc), eligible[0]);

  if (worst.delta <= -STROKES_GAINED_LIGHT_MIN_ABSOLUTE_DELTA) {
    return worst.category;
  }

  return null;
}

export function computeStrokesGainedLight(
  shots: ShotEvent[],
  baseline: StrokesGainedBaseline,
  holePars?: Record<number, number | undefined>,
): StrokesGainedLightSummary {
  if (!baseline?.expectedStrokesByBucket?.length || !shots.length) {
    return { totalDelta: 0, byCategory: [] };
  }

  const byCategory: Record<SgCategory, StrokesGainedLightCategoryBreakdown> = {
    tee: { category: 'tee', shots: 0, delta: 0, confidence: 0 },
    approach: { category: 'approach', shots: 0, delta: 0, confidence: 0 },
    short_game: { category: 'short_game', shots: 0, delta: 0, confidence: 0 },
    putting: { category: 'putting', shots: 0, delta: 0, confidence: 0 },
  };

  for (const shot of shots) {
    const distanceStart = shot.toPinStart_m ?? null;
    const startBucket = bucketForShot(shot, holePars);
    const endBucket = bucketForEnd(shot, holePars);
    const expectedStart = lookupExpected(baseline, startBucket);
    const expectedEnd = lookupExpected(baseline, endBucket ?? 'holed');

    if (expectedStart == null || expectedEnd == null) {
      continue;
    }

    const delta = expectedStart - (1 + expectedEnd);
    const category = categoryForShot(shot, distanceStart);
    const entry = byCategory[category];
    entry.shots += 1;
    entry.delta += delta;
  }

  let totalDelta = 0;
  for (const entry of Object.values(byCategory)) {
    entry.confidence = Math.min(1, entry.shots / 10);
    totalDelta += entry.delta;
  }

  const baseSummary: StrokesGainedLightSummary = { totalDelta, byCategory: Object.values(byCategory) };
  return {
    ...baseSummary,
    focusCategory: deriveStrokesGainedLightFocusCategory(baseSummary),
  };
}

