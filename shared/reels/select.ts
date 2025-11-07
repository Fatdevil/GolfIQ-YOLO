import type { Shot } from '../round/round_types';
import type { DrawCmd, ReelShotRef, ReelTimeline } from './types';
import { buildShotTracerDraw } from '../tracer/draw';

function safeNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

export function scoreShot(s: ReelShotRef): number {
  const carry = Number.isFinite(s.carry_m as number) ? Math.max(0, s.carry_m!) : 0;
  const apex = Number.isFinite(s.apex_m as number) ? Math.max(0, s.apex_m!) : 0;
  const ballSpeed = Number.isFinite(s.ballSpeed_mps as number)
    ? Math.max(0, s.ballSpeed_mps!)
    : 0;

  const carryScore = Math.min(carry, 320) * 0.65;
  const apexScore = Math.min(apex, 80) * 0.25;

  const validCarry = carry > 0.1;
  const flushRaw = validCarry && ballSpeed > 0 ? ballSpeed / carry : 0;
  const flushScore = Math.min(flushRaw * 40, 120);

  return carryScore + apexScore + flushScore;
}

export function pickTopShots(pool: ReelShotRef[], max = 2): ReelShotRef[] {
  const filtered = pool.filter(
    (shot) => (shot.carry_m ?? 0) > 0 || (shot.tracer?.points?.length ?? 0) > 3,
  );
  const ranked = filtered.slice().sort((a, b) => scoreShot(b) - scoreShot(a));
  const out: ReelShotRef[] = [];
  for (const shot of ranked) {
    if (!out.length) {
      out.push(shot);
      if (out.length >= max) {
        break;
      }
      continue;
    }
    const prev = out[out.length - 1];
    const farApart = Math.abs(shot.ts - prev.ts) > 5_000;
    const differentClub = shot.club && prev.club ? shot.club !== prev.club : true;
    if (farApart || differentClub) {
      out.push(shot);
    }
    if (out.length >= max) {
      break;
    }
  }
  return out;
}

export function makeTimeline(shots: ReelShotRef[], fps = 30): ReelTimeline {
  const durationPer = Math.max(1, Math.floor(fps * 2));
  const frames = shots.length * durationPer;
  return {
    width: 1080,
    height: 1920,
    frames,
    fps,
    shots: shots.map((ref, index) => ({
      ref,
      startFrame: index * durationPer,
      duration: durationPer,
    })),
  };
}

function formatStatSegments(ref: ReelShotRef): string {
  const segments: string[] = [];
  if (ref.club) {
    segments.push(ref.club);
  }
  if (ref.carry_m != null) {
    segments.push(`Carry ${Math.round(ref.carry_m)}m`);
  }
  if (ref.total_m != null) {
    segments.push(`Total ${Math.round(ref.total_m)}m`);
  }
  if (ref.ballSpeed_mps != null) {
    segments.push(`${Math.round(ref.ballSpeed_mps * 3.6)} km/h`);
  }
  if (ref.playsLikePct != null) {
    segments.push(`PL ${ref.playsLikePct.toFixed(1)}%`);
  }
  return segments.join('  •  ');
}

export function planFrame(tl: ReelTimeline, frame: number): DrawCmd[] {
  const shot = tl.shots.find(
    (entry) => frame >= entry.startFrame && frame < entry.startFrame + entry.duration,
  );
  const commands: DrawCmd[] = [{ t: 'bg', color: '#0b0f14' }];
  if (!shot) {
    return commands;
  }
  const { ref } = shot;
  const tracer = buildShotTracerDraw(ref, { width: tl.width, height: tl.height });
  if (tracer) {
    commands.push(...tracer.commands);
  }
  const carryLabel = Math.round(ref.carry_m ?? ref.total_m ?? 0);
  const clubLabel = ref.club ? `${ref.club}` : '';
  commands.push({
    t: 'text',
    x: tl.width / 2,
    y: 120,
    text: `${clubLabel}${clubLabel ? '  •  ' : ''}${carryLabel}m carry`,
    size: 60,
    color: '#e6f1ff',
    align: 'center',
    bold: true,
  });
  commands.push({
    t: 'text',
    x: tl.width - 24,
    y: tl.height - 24,
    text: 'GolfIQ-YOLO',
    size: 28,
    color: '#9ab0c6',
    align: 'right',
  });
  commands.push({
    t: 'compass',
    cx: 160,
    cy: 260,
    deg: ref.startDeg ?? 0,
    radius: 80,
    color: '#60a5fa',
  });
  commands.push({
    t: 'bar',
    x: 0,
    y: tl.height - 180,
    w: tl.width,
    h: 180,
    color: '#0f172acc',
  });
  const stat = formatStatSegments(ref);
  if (stat) {
    commands.push({
      t: 'text',
      x: tl.width / 2,
      y: tl.height - 100,
      text: stat,
      size: 40,
      color: '#e6f1ff',
      align: 'center',
    });
  }
  return commands;
}

export function mapRoundShotToReelRef(
  shot: Shot,
  options: { roundId: string; holeNo: number; index: number },
): ReelShotRef {
  const measuredCarry = safeNumber(shot.carry_m);
  const fallbackCarry = measuredCarry == null ? safeNumber(shot.base_m) : undefined;
  const carry = measuredCarry ?? fallbackCarry;
  const carryEstimated = measuredCarry == null && fallbackCarry != null;
  const total = safeNumber(shot.carry_m) ?? safeNumber(shot.base_m);
  const playsLike = safeNumber(shot.playsLike_m);
  const base = safeNumber(shot.base_m);
  let playsLikePct: number | undefined;
  if (playsLike != null && base != null && base !== 0) {
    playsLikePct = ((playsLike - base) / Math.abs(base)) * 100;
  }
  const startDeg = safeNumber(shot.heading_deg);
  return {
    ts: shot.tStart ?? Date.now(),
    id: `${options.roundId}:${options.holeNo}:${options.index}`,
    club: shot.club,
    carry_m: carry,
    carryEstimated,
    total_m: total,
    startDeg: startDeg,
    playsLikePct,
    telemetryFlags: carryEstimated ? ['reel:carry.estimated'] : undefined,
  };
}
