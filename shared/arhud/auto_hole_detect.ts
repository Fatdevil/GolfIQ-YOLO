import { bearingDeg } from './geo';
import { distanceMeters } from './location';
import { emitAutoHoleSwitch, type TelemetryEmitter } from '../telemetry/arhud';

export type HoleRef = {
  hole: number;
  tee?: { lat: number; lon: number };
  green?: { mid: { lat: number; lon: number } };
};

export type CourseRef = { id: string; holes: HoleRef[] };

export type AutoHoleSwitchReason = 'tee-lead' | 'putt-advance' | 'manual' | 'undo';

export type AutoHoleSwitchMeta = {
  from: number;
  to: number;
  at: number;
  reason: AutoHoleSwitchReason;
};

export type AutoHoleState = {
  courseId: string;
  hole: number;
  confidence: number;
  sinceTs: number;
  previousHole?: number | null;
  prevHole?: number | null;
  lastReasons: string[];
  pendingHole: number | null;
  pendingVotes: number;
  streak: number;
  onGreen: boolean;
  teeLeadHole?: number | null;
  teeLeadVotes?: number;
  holes: number[];
  lastSwitch?: AutoHoleSwitchMeta | null;
  lastSwitchAt?: number | null;
};

export type AutoInput = {
  course: CourseRef;
  fix: { lat: number; lon: number; acc_m?: number; heading_deg?: number };
};

const GREEN_RADIUS_M = 35;
const APPROACH_RADIUS_M = 80;
const TEE_LOCK_RADIUS_M = 60;
const GREEN_FAR_M = 120;
const HEADING_WINDOW_DEG = 35;
const SWITCH_VOTES = 3;
export const ADVANCE_VOTES = 3;
export const ADVANCE_DWELL_MS = 15_000;

type HoleEval = {
  hole: number;
  score: number;
  distGreen: number;
  distTee: number;
  onGreen: boolean;
  phase: 'green' | 'approach' | 'tee' | 'transit';
  reasons: string[];
};

function normalizeHeading(value: number | undefined): number | null {
  if (!Number.isFinite(value ?? NaN)) {
    return null;
  }
  const normalized = Number(value) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function angularDelta(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function normalizeHoleNumber(value: number | undefined): number | null {
  if (!Number.isFinite(value ?? NaN)) {
    return null;
  }
  const rounded = Math.round(Number(value));
  return rounded > 0 ? rounded : null;
}

function resolveHoleNumbers(course: CourseRef): number[] {
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const hole of course.holes ?? []) {
    const normalized = normalizeHoleNumber(hole?.hole);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      ids.push(normalized);
    }
  }
  ids.sort((a, b) => a - b);
  return ids;
}

function evalHole(input: AutoInput['fix'], hole: HoleRef, heading: number | null): HoleEval | null {
  const holeNo = normalizeHoleNumber(hole?.hole);
  if (!holeNo) {
    return null;
  }
  const greenMid = hole?.green?.mid;
  if (!greenMid || !Number.isFinite(greenMid.lat) || !Number.isFinite(greenMid.lon)) {
    return null;
  }
  const tee = hole?.tee;
  const teeValid = tee && Number.isFinite(tee.lat) && Number.isFinite(tee.lon);
  const distGreen = distanceMeters(input, greenMid);
  const distTee = teeValid ? distanceMeters(input, tee!) : Number.POSITIVE_INFINITY;
  const onGreen = Number.isFinite(distGreen) && distGreen < GREEN_RADIUS_M;
  const nearGreen = Number.isFinite(distGreen) && distGreen < APPROACH_RADIUS_M;
  const nearTee = Number.isFinite(distTee) && distTee < TEE_LOCK_RADIUS_M && distGreen > GREEN_FAR_M;
  const reasons: string[] = [];
  let score = Number.isFinite(distGreen) ? distGreen : Number.POSITIVE_INFINITY;
  let phase: HoleEval['phase'] = 'transit';
  if (onGreen) {
    phase = 'green';
    reasons.push('green');
    score -= 200;
  } else if (nearGreen) {
    phase = 'approach';
    reasons.push('approach');
    score -= 100;
  } else if (nearTee) {
    phase = 'tee';
    reasons.push('tee');
    score -= 50;
  }
  if (heading !== null && distGreen > APPROACH_RADIUS_M) {
    const bearing = bearingDeg(input, greenMid);
    const delta = angularDelta(heading, bearing);
    if (delta > HEADING_WINDOW_DEG) {
      score += 150 + delta;
    } else {
      reasons.push('heading');
      score -= 10;
    }
  }
  return {
    hole: holeNo,
    score,
    distGreen,
    distTee,
    onGreen,
    phase,
    reasons,
  };
}

function pickBest(evals: HoleEval[], currentHole: number): HoleEval | null {
  let best: HoleEval | null = null;
  for (const candidate of evals) {
    if (!best) {
      best = candidate;
      continue;
    }
    if (candidate.score < best.score - 1e-3) {
      best = candidate;
      continue;
    }
    if (Math.abs(candidate.score - best.score) <= 1e-3) {
      if (candidate.hole === currentHole && best.hole !== currentHole) {
        best = candidate;
      } else if (candidate.distGreen < best.distGreen) {
        best = candidate;
      }
    }
  }
  return best;
}

function resolveNearestTee(evals: HoleEval[]): { hole: number; dist: number } | null {
  let nearest: { hole: number; dist: number } | null = null;
  for (const evalResult of evals) {
    if (!Number.isFinite(evalResult.distTee)) {
      continue;
    }
    if (!nearest || evalResult.distTee < nearest.dist) {
      nearest = { hole: evalResult.hole, dist: evalResult.distTee };
    }
  }
  return nearest;
}

function copyState(base: AutoHoleState): AutoHoleState {
  return {
    ...base,
    lastReasons: [...base.lastReasons],
    holes: [...base.holes],
    lastSwitch: base.lastSwitch ? { ...base.lastSwitch } : base.lastSwitch ?? null,
  };
}

export function canAutoAdvance(now: number, state: AutoHoleState): boolean {
  const lastSwitchAt = typeof state.lastSwitchAt === 'number' ? state.lastSwitchAt : null;
  if (!lastSwitchAt) {
    return true;
  }
  return now - lastSwitchAt >= ADVANCE_DWELL_MS;
}

export function advanceToHole(
  state: AutoHoleState,
  hole: number,
  now: number,
  reason: AutoHoleSwitchReason,
  telemetryEmitter?: TelemetryEmitter | null,
): AutoHoleState {
  const next = copyState(state);
  const from = state.hole;
  next.previousHole = from;
  next.prevHole = from;
  next.hole = hole;
  next.sinceTs = now;
  next.pendingHole = null;
  next.pendingVotes = 0;
  next.streak = SWITCH_VOTES;
  next.confidence = 1;
  next.lastReasons = [reason];
  next.teeLeadHole = null;
  next.teeLeadVotes = 0;
  next.lastSwitch = { from, to: hole, at: now, reason };
  next.lastSwitchAt = now;
  const dwellMs = typeof state.lastSwitchAt === 'number' ? Math.max(0, now - state.lastSwitchAt) : 0;
  emitAutoHoleSwitch(telemetryEmitter, {
    courseId: state.courseId,
    from,
    to: hole,
    reason,
    confidence: state.confidence,
    dwellMs,
  });
  return next;
}

function resolveNextHole(state: AutoHoleState): number | null {
  const holes = state.holes;
  if (!holes.length) {
    return null;
  }
  const index = holes.indexOf(state.hole);
  if (index < 0) {
    return null;
  }
  if (index + 1 >= holes.length) {
    return null;
  }
  return holes[index + 1];
}

export function createAutoHole(course: CourseRef, initialHole?: number): AutoHoleState {
  const holes = resolveHoleNumbers(course);
  const now = Date.now();
  const fallbackHole = holes.length ? holes[0]! : 1;
  const normalizedInitial = normalizeHoleNumber(initialHole);
  const hole = normalizedInitial && holes.includes(normalizedInitial) ? normalizedInitial : fallbackHole;
  return {
    courseId: course.id,
    hole,
    confidence: 0,
    sinceTs: now,
    previousHole: null,
    prevHole: null,
    lastReasons: [],
    pendingHole: null,
    pendingVotes: 0,
    streak: 0,
    onGreen: false,
    teeLeadHole: null,
    teeLeadVotes: 0,
    holes,
    lastSwitch: null,
    lastSwitchAt: null,
  };
}

export function updateAutoHole(state: AutoHoleState, input: AutoInput, now = Date.now()): AutoHoleState {
  if (!input?.course || !Array.isArray(input.course.holes)) {
    return state;
  }
  if (!Number.isFinite(input?.fix?.lat ?? NaN) || !Number.isFinite(input?.fix?.lon ?? NaN)) {
    return state;
  }
  if (state.courseId !== input.course.id) {
    return createAutoHole(input.course, state.hole);
  }
  const heading = normalizeHeading(input.fix.heading_deg);
  const evals: HoleEval[] = [];
  for (const hole of input.course.holes) {
    const evaluation = evalHole(input.fix, hole, heading);
    if (evaluation) {
      evals.push(evaluation);
    }
  }
  if (!evals.length) {
    return state;
  }
  const next = copyState(state);
  next.holes = resolveHoleNumbers(input.course);
  const best = pickBest(evals, state.hole) ?? evals[0]!;
  next.onGreen = best.onGreen;
  next.lastReasons = [...best.reasons];

  if (best.hole === state.hole) {
    next.pendingHole = null;
    next.pendingVotes = 0;
    next.streak = Math.min(SWITCH_VOTES, (state.streak ?? 0) + 1);
  } else {
    if (state.pendingHole === best.hole) {
      next.pendingVotes = Math.min(SWITCH_VOTES, (state.pendingVotes ?? 0) + 1);
    } else {
      next.pendingHole = best.hole;
      next.pendingVotes = 1;
    }
    next.streak = Math.max(0, (state.streak ?? 0) - 1);
  }

  if (
    next.pendingHole === best.hole &&
    next.pendingVotes >= SWITCH_VOTES &&
    canAutoAdvance(now, state)
  ) {
    return advanceToHole(next, best.hole, now, 'tee-lead');
  }

  next.confidence = Math.min(1, next.streak / SWITCH_VOTES);

  const nearestTee = resolveNearestTee(evals);
  if (!nearestTee) {
    next.teeLeadHole = null;
    next.teeLeadVotes = 0;
  } else if (state.teeLeadHole === nearestTee.hole) {
    next.teeLeadHole = nearestTee.hole;
    next.teeLeadVotes = Math.min(ADVANCE_VOTES, (state.teeLeadVotes ?? 0) + 1);
  } else {
    next.teeLeadHole = nearestTee.hole;
    next.teeLeadVotes = 1;
  }

  const nextHole = resolveNextHole(next);
  if (
    next.onGreen &&
    nextHole !== null &&
    next.teeLeadHole === nextHole &&
    (next.teeLeadVotes ?? 0) >= ADVANCE_VOTES &&
    canAutoAdvance(now, state)
  ) {
    return advanceToHole(next, nextHole, now, 'tee-lead');
  }

  return next;
}

export function maybeAdvanceOnGreen(state: AutoHoleState, onGreen: boolean, now = Date.now()): AutoHoleState {
  const next = copyState(state);
  next.onGreen = onGreen;
  if (!onGreen) {
    return next;
  }
  const nextHole = resolveNextHole(next);
  if (nextHole === null) {
    return next;
  }
  if (
    next.teeLeadHole === nextHole &&
    (next.teeLeadVotes ?? 0) >= ADVANCE_VOTES &&
    canAutoAdvance(now, state)
  ) {
    return advanceToHole(next, nextHole, now, 'putt-advance');
  }
  return next;
}
