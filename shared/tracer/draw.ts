import type { DrawCmd } from '../reels/types';
import { fitTracerPath } from './fit_path';
import { recordTracerTelemetry } from '../reels/telemetry';

export type ShotForTracer = {
  id?: string;
  tracer?: { points?: [number, number][] | null } | null;
  carry_m?: number | null;
  apex_m?: number | null;
  carryEstimated?: boolean;
  telemetryFlags?: string[];
};

export type TracerContext = {
  width: number;
  height: number;
};

export type TracerDrawResult = {
  commands: DrawCmd[];
  estimated: boolean;
  sampleCount: number;
  flags: string[];
};

const TRACER_COLOR = '#00e6ff';
const TRACER_WIDTH = 6;
const DASH_PATTERN: [number, number] = [18, 14];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function mergeFlags(target: ShotForTracer, flags: string[]): void {
  if (!flags.length) {
    return;
  }
  if (!Array.isArray(target.telemetryFlags)) {
    target.telemetryFlags = [...flags];
    return;
  }
  for (const flag of flags) {
    if (!target.telemetryFlags.includes(flag)) {
      target.telemetryFlags.push(flag);
    }
  }
}

function toPixels(points: [number, number][], context: TracerContext): [number, number][] {
  const { width, height } = context;
  return points.map(([x, y]) => [x * width, height - y * height]);
}

export function buildShotTracerDraw(shot: ShotForTracer, context: TracerContext): TracerDrawResult | null {
  const fit = fitTracerPath({
    raw: shot.tracer?.points ?? null,
    carry: shot.carry_m ?? null,
    apex: shot.apex_m ?? null,
  });
  if (!fit) {
    return null;
  }
  const pts = toPixels(fit.points, context);
  if (!pts.length) {
    return null;
  }
  const dashed = Boolean(shot.carryEstimated || shot.carry_m == null);
  const tracerCmd: DrawCmd = {
    t: 'tracer',
    pts,
    color: TRACER_COLOR,
    width: TRACER_WIDTH,
    dash: dashed ? DASH_PATTERN.slice() : undefined,
  };
  const commands: DrawCmd[] = [tracerCmd];
  const apexIndex = clamp(fit.apexIndex, 0, pts.length - 1);
  const apexPoint = pts[apexIndex];
  if (apexPoint) {
    if (!dashed && Number.isFinite(shot.apex_m)) {
      commands.push({ t: 'dot', x: apexPoint[0], y: apexPoint[1], r: 12, color: '#ffe600' });
      commands.push({
        t: 'text',
        x: apexPoint[0],
        y: apexPoint[1] - 28,
        text: `Apex ${Math.round(shot.apex_m as number)} m`,
        size: 36,
        color: '#ffe600',
        align: 'center',
        bold: true,
      });
    } else {
      commands.push({
        t: 'text',
        x: apexPoint[0],
        y: apexPoint[1] - 24,
        text: 'est.',
        size: 32,
        color: '#94a3b8',
        align: 'center',
        bold: true,
      });
    }
  }
  const estimated = fit.source !== 'raw';
  const flags = [...fit.flags, dashed ? 'tracer:dash' : 'tracer:solid'];
  mergeFlags(shot, flags);
  if (shot && shot.id) {
    recordTracerTelemetry(shot, { estimated, sampleCount: fit.points.length, flags });
  }
  return {
    commands,
    estimated,
    sampleCount: fit.points.length,
    flags,
  };
}
