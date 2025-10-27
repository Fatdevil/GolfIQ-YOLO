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

const PUTT_BUCKETS: readonly DistanceBucket[] = [
  { max: 0.6, value: 1.01 },
  { max: 0.9, value: 1.04 },
  { max: 1.2, value: 1.07 },
  { max: 1.5, value: 1.12 },
  { max: 1.8, value: 1.18 },
  { max: 2.4, value: 1.25 },
  { max: 3.0, value: 1.33 },
  { max: 4.0, value: 1.42 },
  { max: 5.0, value: 1.52 },
  { max: 6.0, value: 1.62 },
  { max: 8.0, value: 1.78 },
  { max: 10.0, value: 1.92 },
  { max: 12.0, value: 2.05 },
  { max: Number.POSITIVE_INFINITY, value: 2.18 },
];

export const expStrokes_Tee = (distanceM: number): number =>
  pickFromBuckets(TEE_BUCKETS, distanceM);

export const expStrokes_Approach = (distanceM: number): number =>
  pickFromBuckets(APPROACH_BUCKETS, distanceM);

export const expStrokes_Short = (distanceM: number): number =>
  pickFromBuckets(SHORT_BUCKETS, distanceM);

export const expStrokes_Putt = (distanceM: number): number =>
  pickFromBuckets(PUTT_BUCKETS, distanceM);

export const expStrokesFromDistance = (distanceM: number): number => {
  const dist = clampDistance(distanceM);
  if (dist <= 12) {
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
