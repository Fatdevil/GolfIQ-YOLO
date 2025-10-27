import {
  expStrokesFromDistance,
  expStrokes_Approach,
  expStrokes_Putt,
  expStrokes_Short,
  expStrokes_Tee,
} from './baseline';

export type ShotPhase = 'tee' | 'approach' | 'short' | 'putt';

export type ShotCtx = {
  phase: ShotPhase;
  startDist_m: number;
  endDist_m: number;
  penalty?: boolean;
  holed?: boolean;
};

export type ShotSgResult = {
  sgTee: number;
  sgApp: number;
  sgShort: number;
  sgPutt: number;
  total: number;
  expStart: number;
  expEnd: number;
  strokesTaken: number;
};

const clamp = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value >= 0 ? value : 0;
};

const EXP_BY_PHASE: Record<ShotPhase, (distanceM: number) => number> = {
  tee: expStrokes_Tee,
  approach: expStrokes_Approach,
  short: expStrokes_Short,
  putt: expStrokes_Putt,
};

const inferNextPhase = (distanceM: number): ShotPhase => {
  const dist = clamp(distanceM);
  if (dist <= 12) {
    return 'putt';
  }
  if (dist <= 30) {
    return 'short';
  }
  return 'approach';
};

export const computeSG = (ctx: ShotCtx): ShotSgResult => {
  const phase = ctx.phase;
  const startDist = clamp(ctx.startDist_m);
  const endDist = ctx.holed ? 0 : clamp(ctx.endDist_m);
  const penalty = Boolean(ctx.penalty);

  const expStart = EXP_BY_PHASE[phase](startDist);
  const nextPhase = inferNextPhase(endDist);
  const expEnd = ctx.holed
    ? 0
    : nextPhase === 'putt'
      ? expStrokes_Putt(endDist)
      : nextPhase === 'short'
        ? expStrokes_Short(endDist)
        : expStrokes_Approach(endDist);

  const strokesTaken = 1 + (penalty ? 1 : 0);
  const total = expStart - (strokesTaken + expEnd);

  const sgTee = phase === 'tee' ? total : 0;
  const sgApp = phase === 'approach' ? total : 0;
  const sgShort = phase === 'short' ? total : 0;
  const sgPutt = phase === 'putt' ? total : 0;

  return { sgTee, sgApp, sgShort, sgPutt, total, expStart, expEnd, strokesTaken };
};

export const classifyPhase = (distanceM: number): ShotPhase => {
  const dist = clamp(distanceM);
  if (dist >= 220) {
    return 'tee';
  }
  if (dist > 30) {
    return 'approach';
  }
  if (dist > 12) {
    return 'short';
  }
  return 'putt';
};

export const expectedStrokesAfterShot = (ctx: ShotCtx): number => {
  const result = computeSG(ctx);
  return result.strokesTaken + result.expEnd;
};

export const expectedStrokesForDistance = (distanceM: number): number =>
  expStrokesFromDistance(distanceM);
