import { makeBallisticPath, type BallisticPath } from './ballistics';

type RawPoint = [number, number];

export type FitTracerInput = {
  raw?: RawPoint[] | null;
  carry?: number | null;
  apex?: number | null;
  clamp?: number;
};

export type FitTracerResult = {
  points: RawPoint[];
  apexIndex: number;
  landingIndex: number;
  source: 'raw' | 'ballistic' | 'default';
  flags: string[];
};

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function cleanPoints(points: RawPoint[]): RawPoint[] {
  return points
    .map(([x, y]) => {
      const nx = Number(x);
      const ny = Number(y);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
        return null;
      }
      return [nx, ny] as RawPoint;
    })
    .filter((pt): pt is RawPoint => Array.isArray(pt));
}

function normalize(points: RawPoint[]): RawPoint[] {
  if (!points.length) {
    return points;
  }
  const sorted = points.slice().sort((a, b) => a[0] - b[0]);
  const minX = sorted[0]![0];
  const maxX = sorted[sorted.length - 1]![0];
  let minY = sorted[0]![1];
  let maxY = sorted[0]![1];
  for (const [, y] of sorted) {
    if (y < minY) {
      minY = y;
    }
    if (y > maxY) {
      maxY = y;
    }
  }
  const width = Math.max(maxX - minX, 1e-3);
  const height = Math.max(maxY - minY, 1e-3);
  return sorted.map(([x, y]) => [clamp01((x - minX) / width), clamp01((y - minY) / height)]);
}

function perpendicularDistance(point: RawPoint, start: RawPoint, end: RawPoint): number {
  const [x, y] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  if (x1 === x2 && y1 === y2) {
    return Math.hypot(x - x1, y - y1);
  }
  const numerator = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1);
  const denominator = Math.hypot(y2 - y1, x2 - x1) || 1e-6;
  return numerator / denominator;
}

function rdp(points: RawPoint[], epsilon: number): RawPoint[] {
  if (points.length <= 2) {
    return points.slice();
  }
  let dmax = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i += 1) {
    const d = perpendicularDistance(points[i]!, points[0]!, points[end]!);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }
  if (dmax > epsilon) {
    const rec1 = rdp(points.slice(0, index + 1), epsilon);
    const rec2 = rdp(points.slice(index), epsilon);
    return rec1.slice(0, -1).concat(rec2);
  }
  return [points[0]!, points[end]!];
}

function simplify(points: RawPoint[], clamp = 200): RawPoint[] {
  if (points.length <= clamp) {
    return points;
  }
  let tolerance = 0.0015;
  let simplified = points;
  while (simplified.length > clamp && tolerance < 0.05) {
    simplified = rdp(points, tolerance);
    tolerance *= 1.5;
  }
  if (simplified.length > clamp) {
    const step = Math.ceil(simplified.length / clamp);
    const down: RawPoint[] = [];
    for (let i = 0; i < simplified.length; i += step) {
      down.push(simplified[i]!);
    }
    const last = simplified[simplified.length - 1];
    if (last && down[down.length - 1] !== last) {
      down.push(last);
    }
    simplified = down;
  }
  if (simplified.length && simplified[0]![0] !== 0) {
    simplified[0] = [0, simplified[0]![1]];
  }
  if (simplified.length) {
    const last = simplified[simplified.length - 1]!;
    simplified[simplified.length - 1] = [1, last[1]];
  }
  return simplified;
}

function findExtrema(points: RawPoint[]): { apexIndex: number; landingIndex: number } {
  let apexIndex = 0;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 1) {
    if (points[i]![1] > maxY) {
      maxY = points[i]![1];
      apexIndex = i;
    }
  }
  return { apexIndex, landingIndex: Math.max(0, points.length - 1) };
}

function fromBallistics(input: FitTracerInput): FitTracerResult | null {
  const carry = Number.isFinite(input.carry) ? (input.carry as number) : 0;
  if (carry <= 0) {
    return null;
  }
  const ballistic: BallisticPath | null = makeBallisticPath({
    carry,
    apex: Number.isFinite(input.apex) ? (input.apex as number) : undefined,
    samples: input.clamp,
  });
  if (!ballistic) {
    return null;
  }
  const clamped = simplify(ballistic.points, input.clamp);
  const { apexIndex, landingIndex } = findExtrema(clamped);
  return {
    points: clamped,
    apexIndex,
    landingIndex,
    source: 'ballistic',
    flags: ['tracer:ballistic'],
  };
}

function defaultPath(): FitTracerResult {
  const points: RawPoint[] = [
    [0, 0],
    [0.32, 0.52],
    [0.68, 0.34],
    [1, 0],
  ];
  const { apexIndex, landingIndex } = findExtrema(points);
  return {
    points,
    apexIndex,
    landingIndex,
    source: 'default',
    flags: ['tracer:default'],
  };
}

export function fitTracerPath(input: FitTracerInput): FitTracerResult | null {
  const clamp = Number.isFinite(input.clamp) ? Math.max(12, Math.floor(input.clamp!)) : 200;
  const raw = Array.isArray(input.raw) ? cleanPoints(input.raw) : [];
  if (raw.length >= 2) {
    const normalized = normalize(raw);
    const simplified = simplify(normalized, clamp);
    const { apexIndex, landingIndex } = findExtrema(simplified);
    return {
      points: simplified,
      apexIndex,
      landingIndex,
      source: 'raw',
      flags: simplified.length < raw.length ? ['tracer:raw', 'tracer:simplified'] : ['tracer:raw'],
    };
  }
  const ballistic = fromBallistics({ ...input, clamp });
  if (ballistic) {
    return ballistic;
  }
  return defaultPath();
}
