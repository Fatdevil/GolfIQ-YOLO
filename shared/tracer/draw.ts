import type { DrawCmd } from '../reels/types';
import { fitBallistic } from './fit';
import type { Homography, Pt, WorldPt } from './calibrate';
import { toPixels, toWorld } from './calibrate';
import type { TracerSource, TracerTooltip } from './types';
import { recordTracerTelemetry } from '../reels/telemetry';
import { tracerRequireCalibration } from './rc';
import { emitTracerRender } from '../telemetry/tracer';

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
  H?: Homography | null;
};

export type TracerDrawResult = {
  commands: DrawCmd[];
  estimated: boolean;
  sampleCount: number;
  flags: string[];
  source: TracerSource;
  estimateLabel?: string;
  tooltip?: TracerTooltip;
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

function sanitizeRawPoints(points: [number, number][] | null | undefined): Pt[] {
  if (!Array.isArray(points)) {
    return [];
  }
  const sanitized: Pt[] = [];
  for (const entry of points) {
    if (!Array.isArray(entry) || entry.length < 2) {
      continue;
    }
    const x = Number(entry[0]);
    const y = Number(entry[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    sanitized.push({ x, y });
  }
  return sanitized;
}

function projectWorldPoints(world: WorldPt[], context: TracerContext): [number, number][] {
  if (!world.length) {
    return [];
  }
  if (context.H) {
    return world.map((pt) => {
      const px = toPixels(pt, context.H!);
      return [px.x, px.y] as [number, number];
    });
  }
  const { width, height } = context;
  if (width <= 0 || height <= 0) {
    return [];
  }
  const maxX = Math.max(...world.map((pt) => pt.x_m));
  const maxY = Math.max(...world.map((pt) => pt.y_m));
  const scaleX = maxX > 0 ? width / maxX : width;
  const scaleY = maxY > 0 ? height / maxY : height;
  return world.map((pt) => {
    const px = pt.x_m * scaleX;
    const py = height - pt.y_m * scaleY;
    return [px, py] as [number, number];
  });
}

function toWorldPoints(raw: Pt[], homography: Homography | null | undefined): WorldPt[] {
  if (!Array.isArray(raw) || !raw.length) {
    return [];
  }
  if (!homography) {
    return raw.map((pt) => ({ x_m: pt.x, y_m: pt.y }));
  }
  return raw.map((pt) => toWorld(pt, homography));
}

function makeTooltip(shot: ShotForTracer, source: TracerSource): TracerTooltip {
  const apex = Number.isFinite(shot.apex_m as number) ? (shot.apex_m as number) : null;
  const carry = Number.isFinite(shot.carry_m as number) ? (shot.carry_m as number) : null;
  return {
    apex_m: apex,
    carry_m: carry,
    estimated: source !== 'raw',
  };
}

/**
 * Any non-raw path is visually dashed to indicate estimated trajectory.
 */
export function buildShotTracerDraw(shot: ShotForTracer, context: TracerContext): TracerDrawResult | null {
  const rawPoints = sanitizeRawPoints(shot.tracer?.points ?? null);
  const requireCalib = tracerRequireCalibration();
  const canUseRaw = rawPoints.length >= 2 && (!requireCalib || Boolean(context.H));
  const worldPoints = canUseRaw ? toWorldPoints(rawPoints, context.H) : [];
  const fit = fitBallistic({
    worldPoints,
    carry_m: shot.carry_m ?? null,
    apex_m: shot.apex_m ?? null,
  });
  if (!fit) {
    return null;
  }
  const pts = projectWorldPoints(fit.points, context);
  if (!pts.length) {
    return null;
  }
  const dashed = fit.source !== 'raw' || Boolean(shot.carryEstimated);
  const tooltip = makeTooltip(shot, fit.source);
  const tracerCmd: DrawCmd = {
    t: 'tracer',
    pts,
    color: TRACER_COLOR,
    width: TRACER_WIDTH,
    dash: dashed ? DASH_PATTERN.slice() : undefined,
    tooltip,
  };
  const commands: DrawCmd[] = [tracerCmd];
  const apexIndex = clamp(fit.apexIndex, 0, pts.length - 1);
  const apexPoint = pts[apexIndex];
  if (apexPoint) {
    const apexValue = Number.isFinite(shot.apex_m) ? Math.round(shot.apex_m as number) : null;
    commands.push({ t: 'dot', x: apexPoint[0], y: apexPoint[1], r: 12, color: dashed ? '#94a3b8' : '#ffe600' });
    if (apexValue != null) {
      commands.push({
        t: 'text',
        x: apexPoint[0],
        y: apexPoint[1] - 28,
        text: `Apex ${apexValue} m`,
        size: 36,
        color: dashed ? '#cbd5f5' : '#ffe600',
        align: 'center',
        bold: true,
      });
    } else if (dashed) {
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
  const estimated = dashed;
  const flags = [dashed ? 'tracer:dash' : 'tracer:solid'];
  mergeFlags(shot, flags);
  if (shot && shot.id) {
    recordTracerTelemetry(shot, {
      estimated,
      source: fit.source,
      sampleCount: fit.points.length,
      flags,
    });
  }
  emitTracerRender({
    source: fit.source,
    carry_m: shot.carry_m ?? null,
    apex_m: shot.apex_m ?? null,
  });
  return {
    commands,
    estimated,
    sampleCount: fit.points.length,
    flags,
    source: fit.source,
    estimateLabel: dashed ? 'est.' : undefined,
    tooltip,
  };
}
