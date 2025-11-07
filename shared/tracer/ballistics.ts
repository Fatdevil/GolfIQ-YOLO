const G = 9.80665;

export type BallisticParams = {
  carry: number;
  apex?: number | null;
  samples?: number;
};

export type BallisticPath = {
  points: [number, number][];
  apexIndex: number;
  landingIndex: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

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

function resolveApex(carry: number, apex?: number | null): number {
  if (Number.isFinite(apex) && apex != null && apex > 0) {
    return apex;
  }
  const fallback = carry * 0.28;
  return clamp(fallback, Math.max(carry * 0.08, 1), carry * 0.6);
}

function resolveSamples(samples?: number): number {
  if (!Number.isFinite(samples)) {
    return 120;
  }
  return clamp(Math.floor(samples as number), 16, 200);
}

export function makeBallisticPath(params: BallisticParams): BallisticPath | null {
  const carry = Number.isFinite(params.carry) ? Math.max(0, params.carry) : 0;
  if (carry <= 0) {
    return null;
  }
  const apex = resolveApex(carry, params.apex);
  const tanTheta = clamp(4 * apex / Math.max(carry, 1e-3), Math.tan((4 * Math.PI) / 180), Math.tan((45 * Math.PI) / 180));
  const theta = Math.atan(tanTheta);
  const sinTwoTheta = Math.sin(2 * theta) || 1e-4;
  const velocitySq = (G * carry) / sinTwoTheta;
  const cosTheta = Math.cos(theta) || 1e-4;
  const denom = 2 * velocitySq * cosTheta * cosTheta || 1e-4;
  const samples = resolveSamples(params.samples);
  const points: [number, number][] = [];
  let apexIndex = 0;
  let maxY = -Infinity;
  for (let i = 0; i < samples; i += 1) {
    const t = samples > 1 ? i / (samples - 1) : 0;
    const x = carry * t;
    const yRaw = x * tanTheta - (G * x * x) / denom;
    const y = Math.max(0, yRaw);
    const yNorm = clamp01(y / apex);
    if (yNorm > maxY) {
      maxY = yNorm;
      apexIndex = i;
    }
    points.push([clamp01(t), yNorm]);
  }
  if (points.length) {
    points[0] = [0, 0];
    points[points.length - 1] = [1, 0];
  }
  return {
    points,
    apexIndex,
    landingIndex: Math.max(0, points.length - 1),
  };
}
