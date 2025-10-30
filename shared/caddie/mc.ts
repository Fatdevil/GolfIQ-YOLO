import { lateralWindOffset } from './risk';

export type McPolygon = {
  id?: string | null;
  rings: { x: number; y: number }[][];
  penalty?: number;
  label?: string | null;
};

export type McTarget = McPolygon & {
  section?: string | null;
  priority?: number | null;
};

export type McWind = {
  cross?: number | null;
  head?: number | null;
};

export type McArgs = {
  samples?: number;
  seed?: number;
  range_m: number;
  aimOffset_m: number;
  sigmaLong_m: number;
  sigmaLat_m: number;
  wind?: McWind | null;
  hazards?: McPolygon[] | null;
  greenTargets?: McTarget[] | null;
  pin?: { x: number; y: number } | null;
  hazardPenalty?: number;
  successWeight?: number;
  distWeight?: number;
};

export type McReasonKind = 'hazard' | 'wind' | 'dispersion' | 'target';

export type McReason = {
  kind: McReasonKind;
  label: string;
  value: number;
  meta?: Record<string, unknown>;
};

export type McResult = {
  samples: number;
  hazardRate: number;
  successRate: number;
  expectedDistanceToPin: number;
  expectedLat_m: number;
  expectedLong_m: number;
  expectedLatMiss_m: number;
  expectedLongMiss_m: number;
  penaltyMean: number;
  ev: number;
  driftLat_m: number;
  driftLong_m: number;
  reasons: McReason[];
  hazardBreakdown: Record<string, number>;
  targetBreakdown: Record<string, number>;
};

const MIN_SAMPLES = 64;
const MAX_SAMPLES = 20_000;
const DEFAULT_SAMPLES = 2_000;
const EPSILON = 1e-9;
const HEADWIND_GAIN = 0.08;
const DEFAULT_HAZARD_PENALTY = 1;
const DEFAULT_SUCCESS_WEIGHT = 0.85;
const DEFAULT_DIST_WEIGHT = 0.0125;
const MIN_REASON_RATE = 0.001;

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
};

const estimateFlightTime = (distance: number): number => {
  if (!Number.isFinite(distance) || distance <= 0) {
    return 0;
  }
  const clipped = Math.max(40, Math.min(320, distance));
  return Math.max(1.8, Math.min(4.8, clipped / 65));
};

const deriveSeed = (args: McArgs): number => {
  let seed = 0x6d2b79f5 >>> 0;
  const mix = (value: number) => {
    const scaled = Math.round(value * 1000);
    seed ^= scaled >>> 0;
    seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
    seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
    seed ^= seed >>> 16;
    seed >>>= 0;
  };
  mix(args.range_m);
  mix(args.aimOffset_m);
  mix(args.sigmaLong_m);
  mix(args.sigmaLat_m);
  if (args.wind?.cross) {
    mix(args.wind.cross);
  }
  if (args.wind?.head) {
    mix(args.wind.head);
  }
  return seed || 0x6d2b79f5;
};

const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const gaussianGenerator = (rng: () => number): (() => number) => {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u = 0;
    let v = 0;
    while (u <= EPSILON) {
      u = rng();
    }
    v = rng();
    const mag = Math.sqrt(-2 * Math.log(u));
    const angle = 2 * Math.PI * v;
    spare = mag * Math.sin(angle);
    return mag * Math.cos(angle);
  };
};

const ringContains = (point: { x: number; y: number }, ring: { x: number; y: number }[]): boolean => {
  if (!Array.isArray(ring) || ring.length < 3) {
    return false;
  }
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i]?.x ?? 0;
    const yi = ring[i]?.y ?? 0;
    const xj = ring[j]?.x ?? 0;
    const yj = ring[j]?.y ?? 0;
    const intersects = yi > point.y !== yj > point.y;
    if (intersects) {
      const slope = ((xj - xi) * (point.y - yi)) / ((yj - yi) || EPSILON) + xi;
      if (slope > point.x) {
        inside = !inside;
      }
    }
  }
  return inside;
};

const polygonContains = (
  point: { x: number; y: number },
  rings: { x: number; y: number }[][],
): boolean => {
  if (!Array.isArray(rings) || rings.length === 0) {
    return false;
  }
  let inside = false;
  for (const ring of rings) {
    if (!ring || ring.length < 3) {
      continue;
    }
    if (ringContains(point, ring)) {
      inside = !inside;
    }
  }
  return inside;
};

const centroidX = (rings: { x: number; y: number }[][]): number => {
  let sum = 0;
  let count = 0;
  for (const ring of rings) {
    if (!Array.isArray(ring)) {
      continue;
    }
    for (const point of ring) {
      if (!point) {
        continue;
      }
      const { x } = point;
      if (!Number.isFinite(x)) {
        continue;
      }
      sum += x;
      count += 1;
    }
  }
  if (!count) {
    return 0;
  }
  return sum / count;
};

const normalizeSamples = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_SAMPLES;
  }
  const rounded = Math.round(numeric);
  if (!Number.isFinite(rounded)) {
    return DEFAULT_SAMPLES;
  }
  return Math.max(MIN_SAMPLES, Math.min(MAX_SAMPLES, rounded));
};

const sortTargets = (targets: McTarget[]): McTarget[] => {
  return [...targets].sort((a, b) => {
    const pa = Number.isFinite(a.priority ?? NaN) ? Number(a.priority) : Number.POSITIVE_INFINITY;
    const pb = Number.isFinite(b.priority ?? NaN) ? Number(b.priority) : Number.POSITIVE_INFINITY;
    if (pa !== pb) {
      return pa - pb;
    }
    const sa = (a.section ?? '').toString();
    const sb = (b.section ?? '').toString();
    if (sa && sb && sa !== sb) {
      return sa < sb ? -1 : 1;
    }
    return (a.id ?? '') < (b.id ?? '') ? -1 : 1;
  });
};

export function runMonteCarloV1_5(args: McArgs): McResult {
  const samples = normalizeSamples(args.samples ?? DEFAULT_SAMPLES);
  const seed = (args.seed ?? deriveSeed(args)) >>> 0;
  const rng = mulberry32(seed || 1);
  const gaussian = gaussianGenerator(rng);

  const range = Number.isFinite(args.range_m) ? Number(args.range_m) : 0;
  const aimOffset = Number.isFinite(args.aimOffset_m) ? Number(args.aimOffset_m) : 0;
  const sigmaLong = Math.max(0, Number(args.sigmaLong_m) || 0);
  const sigmaLat = Math.max(0, Number(args.sigmaLat_m) || 0);
  const pin = args.pin ?? { x: 0, y: range };
  const hazardPenaltyBase = Number.isFinite(args.hazardPenalty ?? NaN)
    ? Number(args.hazardPenalty)
    : DEFAULT_HAZARD_PENALTY;
  const successWeight = Number.isFinite(args.successWeight ?? NaN)
    ? Number(args.successWeight)
    : DEFAULT_SUCCESS_WEIGHT;
  const distWeight = Number.isFinite(args.distWeight ?? NaN)
    ? Number(args.distWeight)
    : DEFAULT_DIST_WEIGHT;

  const windCross = Number.isFinite(args.wind?.cross ?? NaN) ? Number(args.wind?.cross) : 0;
  const windHead = Number.isFinite(args.wind?.head ?? NaN) ? Number(args.wind?.head) : 0;

  const flightTime = estimateFlightTime(range || Math.max(1, sigmaLong * 6));
  const crossDrift = lateralWindOffset(windCross, flightTime);
  const headDrift = windHead * flightTime * HEADWIND_GAIN;

  const hazards = Array.isArray(args.hazards) ? args.hazards.filter(Boolean) : [];
  const targets = Array.isArray(args.greenTargets) ? sortTargets(args.greenTargets.filter(Boolean)) : [];

  let hazardHits = 0;
  let successHits = 0;
  let penaltySum = 0;
  let latSum = 0;
  let longSum = 0;
  let latMissSum = 0;
  let longMissSum = 0;
  let distanceSum = 0;

  const hazardBreakdown: Record<string, number> = {};
  const targetBreakdown: Record<string, number> = {};

  for (let i = 0; i < samples; i += 1) {
    const longNoise = gaussian() * sigmaLong;
    const latNoise = gaussian() * sigmaLat;

    const y = range + longNoise - headDrift;
    const x = aimOffset + crossDrift + latNoise;

    const point = { x, y };

    let samplePenalty = 0;
    let hazardHit = false;
    for (const hazard of hazards) {
      if (!hazard?.rings || hazard.rings.length === 0) {
        continue;
      }
      if (polygonContains(point, hazard.rings)) {
        hazardHit = true;
        const penalty = Number.isFinite(hazard.penalty ?? NaN)
          ? Number(hazard.penalty)
          : hazardPenaltyBase;
        samplePenalty += penalty;
        const hazardId = hazard.id ?? hazard.label ?? 'hazard';
        hazardBreakdown[hazardId] = (hazardBreakdown[hazardId] ?? 0) + 1;
      }
    }
    if (hazardHit) {
      hazardHits += 1;
    }
    penaltySum += samplePenalty;

    let targetHit = false;
    for (const target of targets) {
      if (!target?.rings || target.rings.length === 0) {
        continue;
      }
      if (polygonContains(point, target.rings)) {
        successHits += 1;
        targetHit = true;
        const id = target.id ?? target.section ?? target.label ?? 'target';
        targetBreakdown[id] = (targetBreakdown[id] ?? 0) + 1;
        break;
      }
    }
    if (!targetHit && targets.length === 0) {
      // Treat center-line target when none provided.
      const withinDefault = Math.abs(x - pin.x) <= Math.max(4, sigmaLat) && y >= range - sigmaLong;
      if (withinDefault) {
        successHits += 1;
        targetBreakdown.default = (targetBreakdown.default ?? 0) + 1;
      }
    }

    latSum += x;
    longSum += y;
    latMissSum += x - pin.x;
    longMissSum += y - pin.y;
    distanceSum += Math.hypot(x - pin.x, y - pin.y);
  }

  const hazardRate = clamp01(hazardHits / samples);
  const successRate = clamp01(successHits / samples);
  const penaltyMean = samples > 0 ? penaltySum / samples : 0;
  const expectedLat = samples > 0 ? latSum / samples : 0;
  const expectedLong = samples > 0 ? longSum / samples : 0;
  const expectedLatMiss = samples > 0 ? latMissSum / samples : 0;
  const expectedLongMiss = samples > 0 ? longMissSum / samples : 0;
  const expectedDistanceToPin = samples > 0 ? distanceSum / samples : 0;

  const ev = -penaltyMean + successWeight * successRate - distWeight * expectedDistanceToPin;

  const reasons: McReason[] = [];
  const deterministicLat = aimOffset + crossDrift;
  const deterministicLong = range - headDrift;

  for (const hazard of hazards) {
    const hazardId = hazard?.id ?? hazard?.label ?? 'hazard';
    const hits = hazardBreakdown[hazardId];
    if (!hits) {
      continue;
    }
    const rate = hits / samples;
    if (rate < MIN_REASON_RATE) {
      continue;
    }
    const cx = hazard?.rings ? centroidX(hazard.rings) : 0;
    const direction = cx > 1 ? 'right' : cx < -1 ? 'left' : 'center';
    const label = `Hazard ${direction} ${(rate * 100).toFixed(0)}%`;
    reasons.push({
      kind: 'hazard',
      label,
      value: rate,
      meta: { id: hazardId, rate, direction },
    });
  }

  if (Math.abs(windCross) >= 1) {
    reasons.push({
      kind: 'wind',
      label: `Crosswind ${windCross.toFixed(1)} m/s`,
      value: clamp01(Math.min(Math.abs(windCross) / 12, 1)),
      meta: { cross: windCross },
    });
  }

  if (Math.abs(deterministicLat) > Math.max(6, sigmaLat * 0.9)) {
    reasons.push({
      kind: 'target',
      label: `Aim drift ${(deterministicLat).toFixed(1)} m`,
      value: clamp01(Math.abs(deterministicLat) / 25),
      meta: { drift: deterministicLat },
    });
  }

  if (sigmaLat >= 6) {
    reasons.push({
      kind: 'dispersion',
      label: `σ_lat ${sigmaLat.toFixed(1)} m`,
      value: clamp01(Math.min((sigmaLat - 5) / 6, 1)),
      meta: { sigmaLat },
    });
  }

  reasons.sort((a, b) => b.value - a.value);

  return {
    samples,
    hazardRate,
    successRate,
    expectedDistanceToPin,
    expectedLat_m: expectedLat,
    expectedLong_m: expectedLong,
    expectedLatMiss_m: expectedLatMiss,
    expectedLongMiss_m: expectedLongMiss,
    penaltyMean,
    ev,
    driftLat_m: deterministicLat,
    driftLong_m: deterministicLong,
    reasons,
    hazardBreakdown,
    targetBreakdown,
  };
}

