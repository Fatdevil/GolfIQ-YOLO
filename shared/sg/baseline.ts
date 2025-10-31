export type SGBaseline = (dist_m: number) => number;

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

const DEFAULT_PUTTING_BASELINE: SGBaseline = (distance) => {
  if (!Number.isFinite(distance)) {
    return evaluateMonotoneBaseline(DEFAULT_PUTTING_PREPARED, PUTTING_BASELINE_MIN_DISTANCE);
  }
  return evaluateMonotoneBaseline(DEFAULT_PUTTING_PREPARED, Number(distance));
};

export function loadDefaultPuttingBaseline(): SGBaseline {
  return DEFAULT_PUTTING_BASELINE;
}

const clampDistance = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const numeric = Number(value);
  return numeric >= 0 ? numeric : 0;
};

type DistanceBucket = {
  max: number;
  value: number;
};

const pickFromBuckets = (buckets: readonly DistanceBucket[], distance: number): number => {
  const dist = clampDistance(distance);
  for (const bucket of buckets) {
    if (dist <= bucket.max) {
      return bucket.value;
    }
  }
  const last = buckets[buckets.length - 1];
  return last ? last.value : 0;
};

const TEE_BUCKETS: readonly DistanceBucket[] = [
  { max: 250, value: 3.9 },
  { max: 275, value: 4.0 },
  { max: 300, value: 4.1 },
  { max: 325, value: 4.2 },
  { max: 350, value: 4.3 },
  { max: 375, value: 4.4 },
  { max: 400, value: 4.5 },
  { max: 425, value: 4.6 },
  { max: 450, value: 4.7 },
  { max: 475, value: 4.85 },
  { max: 500, value: 5.0 },
  { max: 525, value: 5.1 },
  { max: 550, value: 5.2 },
  { max: 575, value: 5.3 },
  { max: Number.POSITIVE_INFINITY, value: 5.45 },
];

const APPROACH_BUCKETS: readonly DistanceBucket[] = [
  { max: 25, value: 2.6 },
  { max: 50, value: 2.75 },
  { max: 75, value: 2.85 },
  { max: 100, value: 2.95 },
  { max: 125, value: 3.05 },
  { max: 150, value: 3.2 },
  { max: 175, value: 3.35 },
  { max: 200, value: 3.5 },
  { max: 225, value: 3.7 },
  { max: Number.POSITIVE_INFINITY, value: 3.9 },
];

const SHORT_BUCKETS: readonly DistanceBucket[] = [
  { max: 5, value: 2.2 },
  { max: 10, value: 2.35 },
  { max: 15, value: 2.45 },
  { max: 20, value: 2.55 },
  { max: 25, value: 2.65 },
  { max: 30, value: 2.75 },
  { max: Number.POSITIVE_INFINITY, value: 2.85 },
];

const defaultPuttingBaseline = loadDefaultPuttingBaseline();

export const expStrokes_Tee = (distanceM: number): number =>
  pickFromBuckets(TEE_BUCKETS, distanceM);

export const expStrokes_Approach = (distanceM: number): number =>
  pickFromBuckets(APPROACH_BUCKETS, distanceM);

export const expStrokes_Short = (distanceM: number): number =>
  pickFromBuckets(SHORT_BUCKETS, distanceM);

export const expStrokes_Putt = (distanceM: number): number =>
  defaultPuttingBaseline(distanceM);

export const expStrokesFromDistance = (distanceM: number): number => {
  const dist = clampDistance(distanceM);
  if (dist <= PUTTING_BASELINE_MAX_DISTANCE) {
    return expStrokes_Putt(dist);
  }
  if (dist <= 30) {
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
