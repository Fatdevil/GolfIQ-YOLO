export type RiskFeature = {
  kind: 'polygon' | 'polyline';
  penalty?: number;
  rings?: { x: number; y: number }[][];
  line?: { x: number; y: number }[];
  width_m?: number;
  id?: string;
};

type EllipseArgs = {
  center: { x: number; y: number };
  longRadius_m: number;
  latRadius_m: number;
  features: RiskFeature[];
};

const SAMPLE_STEPS = 36;
const DEFAULT_WIDTH = 4;
const EPSILON = 1e-6;
const CROSSWIND_GAIN = 0.12; // mirrors shared/arhud/ballistics CROSSWIND_GAIN

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

const sampleEllipsePoints = (
  center: { x: number; y: number },
  longRadius: number,
  latRadius: number,
): { x: number; y: number }[] => {
  const samples: { x: number; y: number }[] = [];
  const steps = Math.max(8, SAMPLE_STEPS);
  for (let i = 0; i < steps; i += 1) {
    const theta = (2 * Math.PI * i) / steps;
    const x = center.x + latRadius * Math.cos(theta);
    const y = center.y + longRadius * Math.sin(theta);
    samples.push({ x, y });
  }
  return samples;
};

const ringContains = (point: { x: number; y: number }, ring: { x: number; y: number }[]): boolean => {
  if (!Array.isArray(ring) || ring.length < 3) {
    return false;
  }
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    const intersect = yi > point.y !== yj > point.y;
    if (intersect) {
      const slope = ((xj - xi) * (point.y - yi)) / ((yj - yi) || EPSILON) + xi;
      if (slope > point.x) {
        inside = !inside;
      }
    }
  }
  return inside;
};

const polygonContains = (point: { x: number; y: number }, rings: { x: number; y: number }[][]): boolean => {
  if (!Array.isArray(rings) || rings.length === 0) {
    return false;
  }
  let inside = false;
  for (let i = 0; i < rings.length; i += 1) {
    const ring = rings[i];
    if (!ring || ring.length < 3) {
      continue;
    }
    if (ringContains(point, ring)) {
      inside = !inside;
    }
  }
  return inside;
};

const distanceToSegment = (
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= EPSILON) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq;
  const clamped = Math.max(0, Math.min(1, t));
  const projX = a.x + clamped * dx;
  const projY = a.y + clamped * dy;
  return Math.hypot(point.x - projX, point.y - projY);
};

const polylineDistance = (point: { x: number; y: number }, line: { x: number; y: number }[]): number => {
  if (!Array.isArray(line) || line.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  if (line.length === 1) {
    return Math.hypot(point.x - line[0].x, point.y - line[0].y);
  }
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < line.length - 1; i += 1) {
    const start = line[i];
    const end = line[i + 1];
    if (!start || !end) {
      continue;
    }
    const dist = distanceToSegment(point, start, end);
    if (dist < min) {
      min = dist;
    }
  }
  return min;
};

export function ellipseOverlapRisk(args: EllipseArgs): number {
  const longRadius = Math.max(1, args.longRadius_m);
  const latRadius = Math.max(1, args.latRadius_m);
  const features = Array.isArray(args.features) ? args.features : [];
  if (features.length === 0) {
    return 0;
  }
  const samples = sampleEllipsePoints(args.center, longRadius, latRadius);
  let total = 0;
  for (const sample of samples) {
    let sampleRisk = 0;
    for (const feature of features) {
      if (!feature) {
        continue;
      }
      const penalty = clamp01(feature.penalty ?? 1);
      if (penalty === 0) {
        continue;
      }
      if (feature.kind === 'polygon' && feature.rings && feature.rings.length) {
        if (polygonContains(sample, feature.rings)) {
          sampleRisk = Math.max(sampleRisk, penalty);
        }
      } else if (feature.kind === 'polyline' && feature.line && feature.line.length) {
        const width = Math.max(DEFAULT_WIDTH, feature.width_m ?? DEFAULT_WIDTH);
        const distance = polylineDistance(sample, feature.line);
        if (distance <= width) {
          sampleRisk = Math.max(sampleRisk, penalty * clamp01(1 - distance / width));
        }
      }
    }
    total += sampleRisk;
  }
  return clamp01(total / samples.length);
}

export function lateralWindOffset(windCross_mps: number, flightTime_s: number): number {
  if (!Number.isFinite(windCross_mps) || !Number.isFinite(flightTime_s)) {
    return 0;
  }
  if (flightTime_s <= 0) {
    return 0;
  }
  return windCross_mps * flightTime_s * CROSSWIND_GAIN;
}

export { sampleEllipsePoints };
