import { lateralWindOffset } from './risk';

export type SimFeatureKind = 'fairway' | 'green' | 'hazard';

export type BundleFeature =
  | {
      kind: SimFeatureKind;
      rings: { x: number; y: number }[][];
    }
  | {
      kind: 'path';
      line: { x: number; y: number }[];
    };

export interface SimOpts {
  samples?: number; // default 800
  seed?: number; // default from hole+shot id (deterministic)
  windCross_mps?: number; // affects lateral drift
  windHead_mps?: number; // affects long dispersion
  longSigma_m: number; // from player model (club)
  latSigma_m: number; // from player model (club)
  range_m: number; // planned carry (playsLike)
  aimDeg: number; // target aim
  features: BundleFeature[]; // fairways/greens/hazards polygons + paths
}

export interface SimOut {
  pFairway: number; // success to land in fairway corridor
  pHazard: number; // hazard hit prob
  pGreen?: number; // on green (approach)
  expLongMiss_m: number; // signed mean longitudinal error
  expLatMiss_m: number; // signed mean lateral error (R+ / L-)
  scoreProxy: number; // lower is better (risk + miss penalties)
}

const BASE_SEED = 0x6d2b79f5;
const MIN_SAMPLES = 32;
const MAX_SAMPLES = 5000;
const HEADWIND_GAIN = 0.08;
const EPSILON = 1e-9;

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

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

const deriveSeed = (opts: SimOpts): number => {
  let seed = BASE_SEED >>> 0;
  const mix = (value: number) => {
    const scaled = Math.round(value * 1000);
    seed ^= scaled >>> 0;
    seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
    seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
    seed ^= seed >>> 16;
    seed >>>= 0;
  };
  mix(opts.range_m);
  mix(opts.aimDeg);
  mix(opts.longSigma_m);
  mix(opts.latSigma_m);
  mix(opts.windCross_mps ?? 0);
  mix(opts.windHead_mps ?? 0);
  return seed || BASE_SEED;
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

const pointInPolygon = (
  point: { x: number; y: number },
  rings: { x: number; y: number }[][],
): boolean => {
  if (!Array.isArray(rings) || rings.length === 0) {
    return false;
  }
  let inside = false;
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 3) {
      continue;
    }
    let ringInside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const xi = ring[i]?.x ?? 0;
      const yi = ring[i]?.y ?? 0;
      const xj = ring[j]?.x ?? 0;
      const yj = ring[j]?.y ?? 0;
      const intersects = yi > point.y !== yj > point.y;
      if (intersects) {
        const slope = ((xj - xi) * (point.y - yi)) / ((yj - yi) || EPSILON) + xi;
        if (slope > point.x) {
          ringInside = !ringInside;
        }
      }
    }
    if (ringInside) {
      inside = !inside;
    }
  }
  return inside;
};

const filterPolygons = (features: BundleFeature[], kind: SimFeatureKind): { x: number; y: number }[][][] => {
  const polygons: { x: number; y: number }[][][] = [];
  for (const feature of features) {
    if (!feature || feature.kind !== kind) {
      continue;
    }
    if ('rings' in feature && Array.isArray(feature.rings) && feature.rings.length) {
      polygons.push(feature.rings);
    }
  }
  return polygons;
};

const estimateFlightTime = (distance: number): number => {
  if (!Number.isFinite(distance) || distance <= 0) {
    return 0;
  }
  const clipped = Math.max(40, Math.min(320, distance));
  return Math.max(1.8, Math.min(4.8, clipped / 65));
};

export function runSim(opts: SimOpts): SimOut {
  const samplesRaw = Math.floor(Number.isFinite(opts.samples ?? NaN) ? Number(opts.samples) : 800);
  const samples = Math.max(MIN_SAMPLES, Math.min(MAX_SAMPLES, samplesRaw || 800));
  const seed = (opts.seed ?? deriveSeed(opts)) >>> 0;
  const rng = mulberry32(seed);
  const gaussian = gaussianGenerator(rng);

  const longSigma = Math.max(0, Number(opts.longSigma_m) || 0);
  const latSigma = Math.max(0, Number(opts.latSigma_m) || 0);
  const range = Number.isFinite(opts.range_m) ? Number(opts.range_m) : 0;
  const aimDeg = Number.isFinite(opts.aimDeg) ? Number(opts.aimDeg) : 0;
  const windCross = Number.isFinite(opts.windCross_mps) ? Number(opts.windCross_mps) : 0;
  const windHead = Number.isFinite(opts.windHead_mps) ? Number(opts.windHead_mps) : 0;

  const flightTime = estimateFlightTime(range || Math.max(1, longSigma * 6));
  const crossDrift = lateralWindOffset(windCross, flightTime);
  const headDrift = windHead * flightTime * HEADWIND_GAIN;
  const aimOffset = Math.tan(toRadians(aimDeg)) * range;

  const fairways = filterPolygons(opts.features, 'fairway');
  const greens = filterPolygons(opts.features, 'green');
  const hazards = filterPolygons(opts.features, 'hazard');

  let sumLongMiss = 0;
  let sumLatMiss = 0;
  let fairwayHits = 0;
  let hazardHits = 0;
  let greenHits = 0;

  for (let i = 0; i < samples; i += 1) {
    const longError = gaussian() * longSigma - headDrift;
    const latError = gaussian() * latSigma;
    const y = range + longError;
    const x = aimOffset + crossDrift + latError;

    if (hazards.length && hazards.some((rings) => pointInPolygon({ x, y }, rings))) {
      hazardHits += 1;
    }
    if (fairways.length && fairways.some((rings) => pointInPolygon({ x, y }, rings))) {
      fairwayHits += 1;
    }
    if (greens.length && greens.some((rings) => pointInPolygon({ x, y }, rings))) {
      greenHits += 1;
    }

    sumLongMiss += y - range;
    sumLatMiss += x;
  }

  const pFairway = fairways.length ? clamp01(fairwayHits / samples) : 0;
  const pHazard = hazards.length ? clamp01(hazardHits / samples) : 0;
  const pGreen = greens.length ? clamp01(greenHits / samples) : undefined;
  const expLongMiss = samples > 0 ? sumLongMiss / samples : 0;
  const expLatMiss = samples > 0 ? sumLatMiss / samples : 0;
  const denom = Math.max(1, Math.abs(range));
  const scoreProxy = clamp01(
    2 * pHazard +
      0.6 * (1 - pFairway) +
      0.2 * (Math.abs(expLongMiss) / denom) +
      0.2 * (Math.abs(expLatMiss) / denom),
  );

  return {
    pFairway,
    pHazard,
    pGreen,
    expLongMiss_m: expLongMiss,
    expLatMiss_m: expLatMiss,
    scoreProxy,
  };
}
