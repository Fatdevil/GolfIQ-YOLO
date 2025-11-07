import { tracerDragEnabled } from './rc';
import type { WorldPt } from './calibrate';

const G = 9.81;
const MIN_CARRY = 1;
const MIN_SAMPLES = 24;
const MAX_SAMPLES = 240;

export type FitBallisticInput = {
  worldPoints?: WorldPt[] | null;
  carry_m?: number | null;
  apex_m?: number | null;
  samples?: number;
};

export type FitBallisticResult = {
  points: WorldPt[];
  apexIndex: number;
  source: 'raw' | 'computed';
};

function clampSamples(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 120;
  }
  const numeric = Math.floor(value as number);
  if (numeric < MIN_SAMPLES) {
    return MIN_SAMPLES;
  }
  if (numeric > MAX_SAMPLES) {
    return MAX_SAMPLES;
  }
  return numeric;
}

function sanitizeWorldPoints(points: WorldPt[] | null | undefined): WorldPt[] {
  if (!Array.isArray(points)) {
    return [];
  }
  const sanitized: WorldPt[] = [];
  for (const point of points) {
    if (!point) {
      continue;
    }
    const x = Number(point.x_m);
    const y = Number(point.y_m);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    sanitized.push({ x_m: x, y_m: y });
  }
  return sanitized;
}

function resolveApex(carry: number, apex: number | null | undefined): number {
  if (Number.isFinite(apex) && (apex as number) > 0) {
    return apex as number;
  }
  const fallback = carry * 0.28;
  const minApex = Math.max(carry * 0.08, 1);
  const maxApex = carry * 0.6;
  return Math.min(Math.max(fallback, minApex), maxApex);
}

function findApexIndex(points: WorldPt[]): number {
  let apexIndex = 0;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const y = points[i]!.y_m;
    if (y > maxY) {
      maxY = y;
      apexIndex = i;
    }
  }
  return apexIndex;
}

function integrateTrajectory({
  carry,
  apex,
  samples,
  drag,
}: {
  carry: number;
  apex: number | null | undefined;
  samples: number;
  drag: boolean;
}): WorldPt[] {
  if (!Number.isFinite(carry) || carry <= 0) {
    return [];
  }
  const sanitizedCarry = Math.max(carry, MIN_CARRY);
  const resolvedApex = resolveApex(sanitizedCarry, apex);
  const tanTheta = Math.min(Math.max((4 * resolvedApex) / Math.max(sanitizedCarry, 1e-3), Math.tan((4 * Math.PI) / 180)), Math.tan((45 * Math.PI) / 180));
  const theta = Math.atan(tanTheta);
  const sinTwoTheta = Math.sin(2 * theta) || 1e-4;
  const velocitySq = (G * sanitizedCarry) / sinTwoTheta;
  const velocity = Math.sqrt(Math.max(velocitySq, 1e-4));
  const vx0 = velocity * Math.cos(theta);
  const vy0 = velocity * Math.sin(theta);
  const duration = sanitizedCarry / Math.max(vx0, 1e-3);
  const dt = duration / Math.max(samples - 1, 1);
  const out: WorldPt[] = [];
  let x = 0;
  let y = 0;
  let vx = vx0;
  let vy = vy0;
  for (let i = 0; i < samples; i += 1) {
    if (i === 0) {
      out.push({ x_m: 0, y_m: 0 });
      continue;
    }
    const dragAccel = drag ? 0.07 : 0;
    const speed = Math.hypot(vx, vy) || 1e-6;
    const dragFactor = drag ? dragAccel * speed : 0;
    const ax = drag ? -(vx / speed) * dragFactor : 0;
    const ay = drag ? -(vy / speed) * dragFactor - G : -G;
    x += vx * dt;
    y += vy * dt;
    vx += ax * dt;
    vy += ay * dt;
    if (y < 0 && vy < 0) {
      y = 0;
      vy = 0;
    }
    out.push({ x_m: x, y_m: Math.max(0, y) });
  }
  if (!out.length) {
    return out;
  }
  const last = out[out.length - 1]!;
  if (last.x_m !== sanitizedCarry && last.x_m > 0) {
    const scale = sanitizedCarry / last.x_m;
    for (let i = 0; i < out.length; i += 1) {
      out[i] = { x_m: out[i]!.x_m * scale, y_m: out[i]!.y_m };
    }
  }
  out[out.length - 1] = { x_m: sanitizedCarry, y_m: 0 };
  out[0] = { x_m: 0, y_m: 0 };
  return out;
}

export function fitBallistic(input: FitBallisticInput): FitBallisticResult | null {
  const rawWorld = sanitizeWorldPoints(input.worldPoints ?? null);
  if (rawWorld.length >= 2) {
    return {
      points: rawWorld,
      apexIndex: findApexIndex(rawWorld),
      source: 'raw',
    };
  }
  const carryRaw = Number(input.carry_m);
  const carry = Number.isFinite(carryRaw) && carryRaw > 0 ? carryRaw : MIN_CARRY;
  const samples = clampSamples(input.samples);
  const path = integrateTrajectory({
    carry,
    apex: Number.isFinite(input.apex_m) ? (input.apex_m as number) : null,
    samples,
    drag: tracerDragEnabled(),
  });
  if (!path.length) {
    return null;
  }
  return {
    points: path,
    apexIndex: findApexIndex(path),
    source: 'computed',
  };
}
