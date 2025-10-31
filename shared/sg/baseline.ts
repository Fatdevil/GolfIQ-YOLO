export type SGBaselineFn = (dist_m: number) => number;
export type SGBaseline = SGBaselineFn;

export type Lie = 'tee' | 'fairway' | 'rough' | 'sand' | 'recovery' | 'green';

export type PuttingBaselinePoint = {
  distance_m: number;
  expectedStrokes: number;
};

export const PUTTING_BASELINE_MIN_DISTANCE = 0;
export const PUTTING_BASELINE_MAX_DISTANCE = 20;
const PUTTING_DISTANCE_TOLERANCE = 1e-6;

export const DEFAULT_PUTTING_BASELINE_POINTS: readonly PuttingBaselinePoint[] = [
  { distance_m: 0, expectedStrokes: 0 },
  { distance_m: 0.3, expectedStrokes: 1.0 },
  { distance_m: 0.6, expectedStrokes: 1.05 },
  { distance_m: 0.9, expectedStrokes: 1.1 },
  { distance_m: 1.2, expectedStrokes: 1.17 },
  { distance_m: 1.5, expectedStrokes: 1.24 },
  { distance_m: 1.8, expectedStrokes: 1.34 },
  { distance_m: 2.4, expectedStrokes: 1.5 },
  { distance_m: 3.0, expectedStrokes: 1.68 },
  { distance_m: 3.6, expectedStrokes: 1.86 },
  { distance_m: 4.5, expectedStrokes: 2.05 },
  { distance_m: 6.0, expectedStrokes: 2.28 },
  { distance_m: 7.5, expectedStrokes: 2.48 },
  { distance_m: 9.0, expectedStrokes: 2.64 },
  { distance_m: 12.0, expectedStrokes: 2.92 },
  { distance_m: 15.0, expectedStrokes: 3.18 },
  { distance_m: 20.0, expectedStrokes: 3.55 },
] as const;

type PreparedMonotoneBaseline = {
  points: PuttingBaselinePoint[];
  tangents: number[];
};

const clampPuttingDistance = (value: number): number => {
  if (!Number.isFinite(value)) {
    return PUTTING_BASELINE_MIN_DISTANCE;
  }
  const numeric = Number(value);
  if (numeric <= PUTTING_BASELINE_MIN_DISTANCE) {
    return PUTTING_BASELINE_MIN_DISTANCE;
  }
  if (numeric >= PUTTING_BASELINE_MAX_DISTANCE) {
    return PUTTING_BASELINE_MAX_DISTANCE;
  }
  return numeric;
};

const sanitizePuttingPoints = (
  points: readonly PuttingBaselinePoint[],
): PuttingBaselinePoint[] => {
  if (!Array.isArray(points) || !points.length) {
    return [
      { distance_m: PUTTING_BASELINE_MIN_DISTANCE, expectedStrokes: 0 },
      { distance_m: PUTTING_BASELINE_MAX_DISTANCE, expectedStrokes: 0 },
    ];
  }
  const sorted = points
    .map((point) => ({
      distance_m: Number(point.distance_m),
      expectedStrokes: Number(point.expectedStrokes),
    }))
    .filter(
      (point) => Number.isFinite(point.distance_m) && Number.isFinite(point.expectedStrokes),
    )
    .sort((a, b) => a.distance_m - b.distance_m);

  const deduped: PuttingBaselinePoint[] = [];
  for (const point of sorted) {
    const distance = Math.max(PUTTING_BASELINE_MIN_DISTANCE, Math.min(point.distance_m, PUTTING_BASELINE_MAX_DISTANCE));
    const expected = Math.max(0, point.expectedStrokes);
    if (!deduped.length) {
      deduped.push({ distance_m: distance, expectedStrokes: expected });
      continue;
    }
    const last = deduped[deduped.length - 1];
    if (distance <= last.distance_m + PUTTING_DISTANCE_TOLERANCE) {
      last.distance_m = distance;
      last.expectedStrokes = Math.max(last.expectedStrokes, expected);
    } else {
      deduped.push({ distance_m: distance, expectedStrokes: Math.max(expected, last.expectedStrokes) });
    }
  }

  if (deduped.length === 1) {
    deduped.push({
      distance_m: Math.min(deduped[0].distance_m + 1, PUTTING_BASELINE_MAX_DISTANCE),
      expectedStrokes: deduped[0].expectedStrokes,
    });
  }

  for (let idx = 1; idx < deduped.length; idx += 1) {
    if (deduped[idx].expectedStrokes < deduped[idx - 1].expectedStrokes) {
      deduped[idx].expectedStrokes = deduped[idx - 1].expectedStrokes;
    }
  }

  const first = deduped[0];
  if (first.distance_m > PUTTING_BASELINE_MIN_DISTANCE) {
    deduped.unshift({
      distance_m: PUTTING_BASELINE_MIN_DISTANCE,
      expectedStrokes: first.expectedStrokes,
    });
  }
  const last = deduped[deduped.length - 1];
  if (last.distance_m < PUTTING_BASELINE_MAX_DISTANCE) {
    deduped.push({
      distance_m: PUTTING_BASELINE_MAX_DISTANCE,
      expectedStrokes: last.expectedStrokes,
    });
  }

  return deduped;
};

const prepareMonotoneBaseline = (points: readonly PuttingBaselinePoint[]): PreparedMonotoneBaseline => {
  const sanitized = sanitizePuttingPoints(points);
  const tangents = new Array<number>(sanitized.length).fill(0);
  const slopes = new Array<number>(Math.max(sanitized.length - 1, 0)).fill(0);

  for (let idx = 0; idx < slopes.length; idx += 1) {
    const left = sanitized[idx];
    const right = sanitized[idx + 1];
    const deltaX = right.distance_m - left.distance_m;
    if (deltaX <= PUTTING_DISTANCE_TOLERANCE) {
      slopes[idx] = 0;
    } else {
      slopes[idx] = (right.expectedStrokes - left.expectedStrokes) / deltaX;
    }
  }

  if (sanitized.length > 1) {
    tangents[0] = slopes[0] ?? 0;
    tangents[tangents.length - 1] = slopes[slopes.length - 1] ?? 0;
  }
  for (let idx = 1; idx < tangents.length - 1; idx += 1) {
    tangents[idx] = (slopes[idx - 1] + slopes[idx]) / 2;
  }

  for (let idx = 0; idx < slopes.length; idx += 1) {
    const slope = slopes[idx];
    if (Math.abs(slope) <= PUTTING_DISTANCE_TOLERANCE) {
      tangents[idx] = 0;
      tangents[idx + 1] = 0;
      continue;
    }
    const a = tangents[idx] / slope;
    const b = tangents[idx + 1] / slope;
    const magnitude = Math.sqrt(a * a + b * b);
    if (magnitude > 3) {
      const scale = 3 / magnitude;
      tangents[idx] = scale * a * slope;
      tangents[idx + 1] = scale * b * slope;
    }
  }

  return { points: sanitized, tangents };
};

const evaluateMonotoneBaseline = (
  prepared: PreparedMonotoneBaseline,
  distance: number,
): number => {
  const { points, tangents } = prepared;
  if (!points.length) {
    return 0;
  }
  const clamped = clampPuttingDistance(distance);
  const first = points[0];
  const last = points[points.length - 1];
  if (clamped <= first.distance_m) {
    return first.expectedStrokes;
  }
  if (clamped >= last.distance_m) {
    return last.expectedStrokes;
  }

  let idx = points.length - 2;
  for (let i = 0; i < points.length - 1; i += 1) {
    if (clamped <= points[i + 1].distance_m) {
      idx = i;
      break;
    }
  }

  const left = points[idx];
  const right = points[idx + 1];
  const span = Math.max(right.distance_m - left.distance_m, PUTTING_DISTANCE_TOLERANCE);
  const t = (clamped - left.distance_m) / span;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  const value =
    h00 * left.expectedStrokes +
    h10 * span * tangents[idx] +
    h01 * right.expectedStrokes +
    h11 * span * tangents[idx + 1];
  if (!Number.isFinite(value)) {
    return left.expectedStrokes;
  }
  return value;
};

const DEFAULT_PUTTING_PREPARED = prepareMonotoneBaseline(DEFAULT_PUTTING_BASELINE_POINTS);

const DEFAULT_PUTTING_BASELINE: SGBaselineFn = (distance) => {
  if (!Number.isFinite(distance)) {
    return evaluateMonotoneBaseline(DEFAULT_PUTTING_PREPARED, PUTTING_BASELINE_MIN_DISTANCE);
  }
  return evaluateMonotoneBaseline(DEFAULT_PUTTING_PREPARED, Number(distance));
};

export function loadDefaultPuttingBaseline(): SGBaseline {
  return DEFAULT_PUTTING_BASELINE;
}

export type BaselinePoint = {
  distance_m: number;
  strokes: number;
};

const clampDistance = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const numeric = Number(value);
  return numeric >= 0 ? numeric : 0;
};

const sanitizeBaselinePoints = (points: readonly BaselinePoint[]): BaselinePoint[] => {
  const sorted = points
    .map((point) => ({
      distance_m: clampDistance(point.distance_m),
      strokes: Number.isFinite(point.strokes) ? Math.max(0, Number(point.strokes)) : 0,
    }))
    .filter((point) => Number.isFinite(point.distance_m) && Number.isFinite(point.strokes))
    .sort((a, b) => a.distance_m - b.distance_m);

  if (!sorted.length) {
    return [
      { distance_m: 0, strokes: 0 },
      { distance_m: 1, strokes: 0 },
    ];
  }

  const deduped: BaselinePoint[] = [];
  for (const point of sorted) {
    const distance = clampDistance(point.distance_m);
    const strokes = Math.max(0, point.strokes);
    if (!deduped.length) {
      deduped.push({ distance_m: distance, strokes });
      continue;
    }
    const last = deduped[deduped.length - 1];
    if (distance <= last.distance_m + PUTTING_DISTANCE_TOLERANCE) {
      last.distance_m = Math.min(distance, last.distance_m);
      last.strokes = Math.max(last.strokes, strokes);
      continue;
    }
    deduped.push({ distance_m: distance, strokes: Math.max(strokes, last.strokes) });
  }

  const first = deduped[0];
  if (first.distance_m > 0) {
    deduped.unshift({ distance_m: 0, strokes: first.strokes });
  }

  let runningMax = deduped[0].strokes;
  for (const point of deduped) {
    if (point.strokes < runningMax) {
      point.strokes = runningMax;
    } else {
      runningMax = point.strokes;
    }
  }

  return deduped;
};

const createPiecewiseBaseline = (points: readonly BaselinePoint[]): SGBaselineFn => {
  const sanitized = sanitizeBaselinePoints(points);
  if (!sanitized.length) {
    return () => 0;
  }
  const last = sanitized[sanitized.length - 1];
  return (distance: number): number => {
    if (!sanitized.length) {
      return 0;
    }
    const clamped = clampDistance(distance);
    if (clamped <= sanitized[0].distance_m) {
      return sanitized[0].strokes;
    }
    if (clamped >= last.distance_m) {
      return last.strokes;
    }
    let idx = 0;
    for (let i = 0; i < sanitized.length - 1; i += 1) {
      if (clamped <= sanitized[i + 1].distance_m) {
        idx = i;
        break;
      }
    }
    const left = sanitized[idx];
    const right = sanitized[idx + 1];
    const span = Math.max(right.distance_m - left.distance_m, PUTTING_DISTANCE_TOLERANCE);
    const t = (clamped - left.distance_m) / span;
    const value = left.strokes + t * (right.strokes - left.strokes);
    if (!Number.isFinite(value)) {
      return left.strokes;
    }
    return value;
  };
};

type LieBaselineRow = {
  distance_m: number;
  tee: number;
  fairway: number;
  rough: number;
  sand: number;
  recovery: number;
};

const MULTI_LIE_BASELINES: readonly LieBaselineRow[] = [
  { distance_m: 0, tee: 0, fairway: 0, rough: 0, sand: 0, recovery: 0 },
  { distance_m: 5, tee: 2.0, fairway: 2.05, rough: 2.15, sand: 2.25, recovery: 2.45 },
  { distance_m: 10, tee: 2.1, fairway: 2.2, rough: 2.35, sand: 2.45, recovery: 2.65 },
  { distance_m: 20, tee: 2.3, fairway: 2.4, rough: 2.55, sand: 2.7, recovery: 2.9 },
  { distance_m: 35, tee: 2.55, fairway: 2.6, rough: 2.8, sand: 2.95, recovery: 3.2 },
  { distance_m: 50, tee: 2.7, fairway: 2.75, rough: 2.95, sand: 3.1, recovery: 3.35 },
  { distance_m: 75, tee: 2.85, fairway: 2.9, rough: 3.1, sand: 3.25, recovery: 3.55 },
  { distance_m: 100, tee: 3.0, fairway: 3.05, rough: 3.25, sand: 3.4, recovery: 3.75 },
  { distance_m: 125, tee: 3.15, fairway: 3.2, rough: 3.4, sand: 3.55, recovery: 3.95 },
  { distance_m: 150, tee: 3.3, fairway: 3.35, rough: 3.55, sand: 3.7, recovery: 4.15 },
  { distance_m: 175, tee: 3.45, fairway: 3.5, rough: 3.7, sand: 3.85, recovery: 4.35 },
  { distance_m: 200, tee: 3.6, fairway: 3.65, rough: 3.85, sand: 4.0, recovery: 4.55 },
  { distance_m: 225, tee: 3.75, fairway: 3.8, rough: 4.05, sand: 4.2, recovery: 4.75 },
  { distance_m: 250, tee: 3.9, fairway: 3.95, rough: 4.2, sand: 4.35, recovery: 4.95 },
  { distance_m: 275, tee: 4.05, fairway: 4.1, rough: 4.35, sand: 4.5, recovery: 5.15 },
  { distance_m: 300, tee: 4.2, fairway: 4.25, rough: 4.5, sand: 4.65, recovery: 5.35 },
  { distance_m: 325, tee: 4.35, fairway: 4.4, rough: 4.65, sand: 4.8, recovery: 5.55 },
  { distance_m: 350, tee: 4.5, fairway: 4.55, rough: 4.8, sand: 4.95, recovery: 5.75 },
  { distance_m: 375, tee: 4.65, fairway: 4.7, rough: 4.95, sand: 5.1, recovery: 5.95 },
  { distance_m: 400, tee: 4.8, fairway: 4.85, rough: 5.1, sand: 5.25, recovery: 6.15 },
  { distance_m: 450, tee: 5.05, fairway: 5.1, rough: 5.35, sand: 5.5, recovery: 6.45 },
  { distance_m: 500, tee: 5.25, fairway: 5.3, rough: 5.55, sand: 5.7, recovery: 6.7 },
  { distance_m: 550, tee: 5.45, fairway: 5.5, rough: 5.75, sand: 5.9, recovery: 6.95 },
  { distance_m: 600, tee: 5.65, fairway: 5.7, rough: 5.95, sand: 6.1, recovery: 7.2 },
];

const buildLieBaseline = (key: keyof Omit<LieBaselineRow, 'distance_m'>): SGBaselineFn =>
  createPiecewiseBaseline(
    MULTI_LIE_BASELINES.map((row) => ({ distance_m: row.distance_m, strokes: row[key] })),
  );

const DEFAULT_GREEN_BASELINE = loadDefaultPuttingBaseline();

const SHORT_GAME_BASELINE_POINTS: readonly BaselinePoint[] = [
  // Dedicated short-game expectations for off-green chips and pitches.
  // Slightly higher than fairway values at the same distance to reflect the
  // additional difficulty of lies inside 35 m that are not on the putting
  // surface while remaining smooth and monotone.
  { distance_m: 0, strokes: 0 },
  { distance_m: 1, strokes: 1.4 },
  { distance_m: 2, strokes: 2.2 },
  { distance_m: 5, strokes: 2.9 },
  { distance_m: 10, strokes: 3.35 },
  { distance_m: 15, strokes: 3.55 },
  { distance_m: 20, strokes: 3.6 },
  { distance_m: 25, strokes: 3.7 },
  { distance_m: 30, strokes: 3.8 },
  { distance_m: 35, strokes: 3.9 },
];

const DEFAULT_SHORT_BASELINE = createPiecewiseBaseline(SHORT_GAME_BASELINE_POINTS);

export type BaselineSet = {
  tee: SGBaselineFn;
  fairway: SGBaselineFn;
  rough: SGBaselineFn;
  sand: SGBaselineFn;
  recovery: SGBaselineFn;
  short: SGBaselineFn;
  green: SGBaselineFn;
};

let cachedBaselines: BaselineSet | null = null;

const ensureBaselines = (): BaselineSet => {
  if (cachedBaselines) {
    return cachedBaselines;
  }
  cachedBaselines = {
    tee: buildLieBaseline('tee'),
    fairway: buildLieBaseline('fairway'),
    rough: buildLieBaseline('rough'),
    sand: buildLieBaseline('sand'),
    recovery: buildLieBaseline('recovery'),
    short: DEFAULT_SHORT_BASELINE,
    green: DEFAULT_GREEN_BASELINE,
  };
  return cachedBaselines;
};

export function loadDefaultBaselines(): BaselineSet {
  return ensureBaselines();
}

export const expStrokes_Tee = (distanceM: number): number => ensureBaselines().tee(distanceM);

export const expStrokes_Approach = (distanceM: number): number =>
  ensureBaselines().fairway(distanceM);

export const expStrokes_Short = (distanceM: number): number => ensureBaselines().short(distanceM);

export const expStrokes_Putt = (distanceM: number): number => ensureBaselines().green(distanceM);

export const SHORT_GAME_MAX_DISTANCE = 35;

export const expStrokesFromDistance = (distanceM: number): number => {
  const dist = clampDistance(distanceM);
  if (dist <= PUTTING_BASELINE_MAX_DISTANCE) {
    return expStrokes_Putt(dist);
  }
  if (dist <= SHORT_GAME_MAX_DISTANCE) {
    return expStrokes_Short(dist);
  }
  return expStrokes_Approach(dist);
};

export type ExpectedStrokesTable = {
  tee: typeof expStrokes_Tee;
  approach: typeof expStrokes_Approach;
  short: typeof expStrokes_Short;
  putt: typeof expStrokes_Putt;
  any: typeof expStrokesFromDistance;
};

export const expectedStrokes: ExpectedStrokesTable = {
  tee: expStrokes_Tee,
  approach: expStrokes_Approach,
  short: expStrokes_Short,
  putt: expStrokes_Putt,
  any: expStrokesFromDistance,
};
