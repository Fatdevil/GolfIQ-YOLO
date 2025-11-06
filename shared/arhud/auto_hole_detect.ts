import { bearingDeg } from './geo';
import { distanceMeters } from './location';

export type HoleRef = {
  hole: number;
  tee?: { lat: number; lon: number };
  green?: { mid: { lat: number; lon: number } };
};

export type CourseRef = { id: string; holes: HoleRef[] };

export type AutoHoleState = {
  courseId: string;
  hole: number;
  confidence: number;
  sinceTs: number;
  previousHole?: number | null;
  candidateHole?: number | null;
  candidateVotes?: number;
  streak?: number;
  totalHoles?: number;
  onGreen?: boolean;
  reasons?: string[];
  nextTeeVotes?: number;
  nextTeeIsClosest?: boolean;
};

export type AutoInput = {
  course: CourseRef;
  fix: { lat: number; lon: number; acc_m?: number; heading_deg?: number };
};

type HoleEval = {
  hole: number;
  score: number;
  distGreen: number;
  distTee: number;
  phase: Phase;
  reasons: string[];
};

type Phase = 'green' | 'approach' | 'tee' | 'fairway';

const GREEN_RADIUS_M = 35;
const APPROACH_RADIUS_M = 80;
const FAR_GREEN_M = 120;
const TEE_RADIUS_M = 60;
const HEADING_GATE_DEG = 35;
const SWITCH_VOTES_REQUIRED = 2;
const STREAK_MAX = 5;
const NEXT_TEE_REQUIRED = 3;

function clampHoleNumber(value: number, total: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  const clamped = Math.floor(value);
  if (clamped < 1) {
    return 1;
  }
  if (clamped > total) {
    return total;
  }
  return clamped;
}

function normalizeCourse(course: CourseRef): CourseRef {
  if (!course || typeof course !== 'object') {
    return { id: '', holes: [] };
  }
  const id = typeof course.id === 'string' ? course.id : '';
  const holes = Array.isArray(course.holes) ? course.holes.filter(Boolean) : [];
  return { id, holes };
}

function smallestAngleDiff(a: number, b: number): number {
  const diff = ((a - b + 540) % 360) - 180;
  return Number.isFinite(diff) ? diff : 0;
}

function evaluateHole(
  hole: HoleRef,
  fix: { lat: number; lon: number; heading_deg?: number },
): HoleEval | null {
  const number = Number(hole?.hole);
  if (!Number.isFinite(number)) {
    return null;
  }
  const greenMid = hole?.green?.mid;
  if (!greenMid) {
    return null;
  }
  const distGreen = distanceMeters(fix, greenMid);
  const tee = hole?.tee;
  const distTee = tee ? distanceMeters(fix, tee) : Number.POSITIVE_INFINITY;

  let phase: Phase = 'fairway';
  const reasons: string[] = [];
  if (distGreen < GREEN_RADIUS_M) {
    phase = 'green';
    reasons.push('green');
  } else if (distGreen < APPROACH_RADIUS_M) {
    phase = 'approach';
    reasons.push('approach');
  }
  const nearTee = Number.isFinite(distTee) && distTee < TEE_RADIUS_M;
  if (distGreen > FAR_GREEN_M && nearTee) {
    phase = 'tee';
  }
  if (nearTee && !reasons.includes('tee')) {
    reasons.push('tee');
  }

  let headingPenalty = 0;
  const heading = Number.isFinite(fix.heading_deg ?? Number.NaN) ? Number(fix.heading_deg) : null;
  if (heading !== null && distGreen > APPROACH_RADIUS_M) {
    const bearing = bearingDeg(fix, greenMid);
    const diff = Math.abs(smallestAngleDiff(heading, bearing));
    if (diff <= HEADING_GATE_DEG) {
      headingPenalty += 200;
      reasons.push('heading');
    } else if (diff > HEADING_GATE_DEG * 1.5) {
      headingPenalty -= 400;
    }
  }

  let baseScore = 200;
  if (phase === 'green') {
    baseScore = 1200;
  } else if (phase === 'approach') {
    baseScore = 900;
  } else if (phase === 'tee') {
    baseScore = 700;
  }
  if (nearTee) {
    baseScore = Math.max(baseScore, 780);
  }

  const distancePenalty = Number.isFinite(distGreen) ? distGreen : 0;
  let teeBonus = 0;
  if (Number.isFinite(distTee) && distTee >= 0) {
    if (nearTee) {
      const closeness = Math.max(0, TEE_RADIUS_M - distTee);
      teeBonus = Math.pow(closeness, 1.5);
    } else {
      teeBonus = Math.max(0, 120 - distTee);
    }
  }
  const score = baseScore - distancePenalty + teeBonus + headingPenalty;

  return {
    hole: number,
    score,
    distGreen,
    distTee,
    phase,
    reasons,
  };
}

function resolveEvaluations(course: CourseRef, fix: { lat: number; lon: number; heading_deg?: number }): HoleEval[] {
  const evaluations: HoleEval[] = [];
  for (const hole of course.holes) {
    const evaluation = evaluateHole(hole, fix);
    if (evaluation) {
      evaluations.push(evaluation);
    }
  }
  evaluations.sort((a, b) => b.score - a.score || a.distGreen - b.distGreen);
  return evaluations;
}

function findEvaluation(evaluations: HoleEval[], holeNumber: number): HoleEval | null {
  for (const evaluation of evaluations) {
    if (evaluation.hole === holeNumber) {
      return evaluation;
    }
  }
  return null;
}

function resolveClosestTee(evaluations: HoleEval[]): HoleEval | null {
  let best: HoleEval | null = null;
  for (const evaluation of evaluations) {
    if (!Number.isFinite(evaluation.distTee)) {
      continue;
    }
    if (!best || evaluation.distTee < best.distTee) {
      best = evaluation;
    }
  }
  return best;
}

export function createAutoHole(courseInput: CourseRef, initialHole?: number): AutoHoleState {
  const course = normalizeCourse(courseInput);
  const total = Math.max(1, course.holes.length || 18);
  const hole = clampHoleNumber(initialHole ?? 1, total);
  const now = Date.now();
  return {
    courseId: course.id,
    hole,
    confidence: 0,
    sinceTs: now,
    previousHole: null,
    candidateHole: null,
    candidateVotes: 0,
    streak: 0,
    totalHoles: total,
    onGreen: false,
    reasons: [],
    nextTeeVotes: 0,
    nextTeeIsClosest: false,
  };
}

export function updateAutoHole(state: AutoHoleState, input: AutoInput, now = Date.now()): AutoHoleState {
  const course = normalizeCourse(input?.course ?? { id: '', holes: [] });
  const fix = input?.fix ?? { lat: 0, lon: 0 };
  const evaluations = resolveEvaluations(course, fix);
  if (!evaluations.length) {
    return {
      ...state,
      totalHoles: Math.max(1, course.holes.length || state.totalHoles || 18),
    };
  }

  const best = evaluations[0]!;
  const totalHoles = Math.max(1, course.holes.length || state.totalHoles || 18);

  const previousHole = state.previousHole ?? null;
  let hole = clampHoleNumber(state.hole ?? 1, totalHoles);
  let candidateHole = state.candidateHole ?? hole;
  let candidateVotes = state.candidateVotes ?? 0;
  let streak = state.streak ?? 0;

  if (best.hole === hole) {
    streak = Math.min(streak + 1, STREAK_MAX);
    candidateHole = best.hole;
    candidateVotes = Math.min(candidateVotes + 1, STREAK_MAX);
  } else {
    if (candidateHole === best.hole) {
      candidateVotes += 1;
    } else {
      candidateHole = best.hole;
      candidateVotes = 1;
    }
    streak = Math.max(streak - 1, 0);
    if (candidateVotes >= SWITCH_VOTES_REQUIRED) {
      hole = best.hole;
      streak = Math.min(candidateVotes, STREAK_MAX);
      candidateHole = best.hole;
      candidateVotes = 1;
    }
  }

  const evaluationForHole = findEvaluation(evaluations, hole);
  const onGreen = evaluationForHole ? evaluationForHole.phase === 'green' : false;

  const closestTee = resolveClosestTee(evaluations);
  const nextHoleNumber = hole < totalHoles ? hole + 1 : totalHoles;
  const nextTeeIsClosest = closestTee ? closestTee.hole === nextHoleNumber : false;
  let nextTeeVotes = state.nextTeeVotes ?? 0;
  if (onGreen && nextTeeIsClosest) {
    nextTeeVotes = Math.min(nextTeeVotes + 1, NEXT_TEE_REQUIRED + 1);
  } else if (onGreen) {
    nextTeeVotes = Math.max(nextTeeVotes - 1, 0);
  } else {
    nextTeeVotes = 0;
  }

  const confidence = Math.max(0, Math.min(1, streak / STREAK_MAX));

  return {
    ...state,
    courseId: course.id || state.courseId,
    hole,
    sinceTs: hole === state.hole ? state.sinceTs ?? now : now,
    previousHole: hole === state.hole ? previousHole : state.hole,
    confidence,
    candidateHole,
    candidateVotes,
    streak,
    totalHoles,
    onGreen,
    reasons: evaluationForHole?.reasons ?? [],
    nextTeeVotes,
    nextTeeIsClosest,
  };
}

export function maybeAdvanceOnGreen(state: AutoHoleState, onGreen: boolean, now = Date.now()): AutoHoleState {
  const nextTeeVotes = state.nextTeeVotes ?? 0;
  const totalHoles = state.totalHoles ?? 18;
  const readyByVotes = nextTeeVotes >= NEXT_TEE_REQUIRED;
  const alreadyOnGreen = state.onGreen ?? false;
  const nextTeeIsClosest = state.nextTeeIsClosest ?? false;

  if (!onGreen) {
    if (!alreadyOnGreen && nextTeeVotes === 0) {
      return state;
    }
    return {
      ...state,
      onGreen: false,
      nextTeeVotes: 0,
    };
  }

  const eventAdvance = alreadyOnGreen && nextTeeIsClosest;
  const shouldAdvance = readyByVotes || eventAdvance;

  if (!shouldAdvance) {
    return {
      ...state,
      onGreen: true,
    };
  }

  const nextHole = state.hole + 1;
  if (nextHole > totalHoles) {
    return {
      ...state,
      onGreen: true,
      nextTeeVotes: 0,
    };
  }

  return {
    ...state,
    hole: nextHole,
    previousHole: state.hole,
    confidence: Math.min(state.confidence, 0.6),
    sinceTs: now,
    onGreen: false,
    candidateHole: null,
    candidateVotes: 0,
    streak: 0,
    nextTeeVotes: 0,
    nextTeeIsClosest: false,
    reasons: ['advance'],
  };
}
