import {
  expStrokesFromDistance,
  expStrokes_Approach,
  expStrokes_Putt,
  expStrokes_Short,
  expStrokes_Tee,
} from './baseline';
import type { TrainingFocus } from '../training/types';

export type ShotPhase = 'tee' | 'approach' | 'short' | 'putt';

export type ShotCtx = {
  phase?: ShotPhase;
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
  focus: TrainingFocus;
  byFocus: Partial<Record<TrainingFocus, number>>;
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

const PUTT_MAX = 12;
const SHORT_MAX = 30;
const APPROACH_MAX = 220;
const LONG_DRIVE_MIN = 240;
const WEDGE_MAX = 120;

export const classifyPhase = (distanceM: number): ShotPhase => {
  const dist = clamp(distanceM);
  if (dist <= PUTT_MAX) {
    return 'putt';
  }
  if (dist <= SHORT_MAX) {
    return 'short';
  }
  if (dist <= APPROACH_MAX) {
    return 'approach';
  }
  return 'tee';
};

export const resolveFocusSegment = (phase: ShotPhase, startDist: number, penalty: boolean): TrainingFocus => {
  if (penalty) {
    return 'recovery';
  }
  if (phase === 'tee') {
    return startDist >= LONG_DRIVE_MIN ? 'long-drive' : 'tee';
  }
  if (phase === 'approach') {
    return startDist <= WEDGE_MAX ? 'wedge' : 'approach';
  }
  if (phase === 'short') {
    return 'short';
  }
  return 'putt';
};

export const computeSG = (ctx: ShotCtx): ShotSgResult => {
  const startDist = clamp(ctx.startDist_m);
  const phase = ctx.phase ?? classifyPhase(startDist);
  const endDist = ctx.holed ? 0 : clamp(ctx.endDist_m);
  const penalty = Boolean(ctx.penalty);

  const expStart = EXP_BY_PHASE[phase](startDist);
  const nextPhase = classifyPhase(endDist);
  const expEnd = ctx.holed ? 0 : EXP_BY_PHASE[nextPhase](endDist);

  const strokesTaken = 1 + (penalty ? 1 : 0);
  const total = expStart - (strokesTaken + expEnd);

  const sgTee = phase === 'tee' ? total : 0;
  const sgApp = phase === 'approach' ? total : 0;
  const sgShort = phase === 'short' ? total : 0;
  const sgPutt = phase === 'putt' ? total : 0;

  const focus = resolveFocusSegment(phase, startDist, penalty);
  const byFocus: Partial<Record<TrainingFocus, number>> = { [focus]: total };

  return { sgTee, sgApp, sgShort, sgPutt, total, expStart, expEnd, strokesTaken, focus, byFocus };
};

export const expectedStrokesAfterShot = (ctx: ShotCtx): number => {
  const result = computeSG(ctx);
  return result.strokesTaken + result.expEnd;
};

export const expectedStrokesForDistance = (distanceM: number): number =>
  expStrokesFromDistance(distanceM);
