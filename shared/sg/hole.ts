import { loadDefaultBaselines, type BaselineSet, type Lie } from './baseline';

export type ShotEvent = {
  start_m: number;
  end_m: number;
  startLie: Lie;
  endLie: Lie;
  holed: boolean;
};

export type Phase = 'Tee' | 'Approach' | 'ShortGame' | 'Putting';

export type ShotSG = {
  sg: number;
  phase: Phase;
  start_m: number;
  end_m: number;
  startLie: Lie;
  endLie: Lie;
};

export type HoleSG = {
  total: number;
  byPhase: Record<Phase, number>;
  shots: ShotSG[];
};

export const HOLE_SG_INVALID = Symbol('sg.hole.invalid');

const DISTANCE_TOLERANCE = 0.75;
const START_MATCH_TOLERANCE = 1;

const clampDistance = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const numeric = Number(value);
  return numeric >= 0 ? numeric : 0;
};

const ZERO_BY_PHASE: Record<Phase, number> = {
  Tee: 0,
  Approach: 0,
  ShortGame: 0,
  Putting: 0,
};

const markInvalid = (result: HoleSG): HoleSG => {
  Object.defineProperty(result, HOLE_SG_INVALID, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return result;
};

const createZeroResult = (): HoleSG => ({
  total: 0,
  byPhase: { ...ZERO_BY_PHASE },
  shots: [],
});

const shortGameLies: ReadonlySet<Lie> = new Set(['fairway', 'rough', 'sand', 'recovery']);

export function classifyPhase(startLie: Lie, start_m: number): Phase {
  if (startLie === 'tee') {
    return 'Tee';
  }
  if (startLie === 'green') {
    return 'Putting';
  }
  const distance = clampDistance(start_m);
  if (distance <= 35 && shortGameLies.has(startLie)) {
    return 'ShortGame';
  }
  return 'Approach';
}

const getBaseline = (set: BaselineSet, lie: Lie): ((distance: number) => number) => {
  switch (lie) {
    case 'tee':
      return set.tee;
    case 'rough':
      return set.rough;
    case 'sand':
      return set.sand;
    case 'recovery':
      return set.recovery;
    case 'green':
      return set.green;
    case 'fairway':
    default:
      return set.fairway;
  }
};

const isLie = (value: unknown): value is Lie =>
  value === 'tee' ||
  value === 'fairway' ||
  value === 'rough' ||
  value === 'sand' ||
  value === 'recovery' ||
  value === 'green';

const validateSequence = (shots: ShotEvent[]): boolean => {
  if (!shots.length) {
    return false;
  }
  let previousStart = Number.POSITIVE_INFINITY;
  for (let index = 0; index < shots.length; index += 1) {
    const shot = shots[index];
    if (!isLie(shot.startLie) || !isLie(shot.endLie)) {
      return false;
    }
    const start = clampDistance(shot.start_m);
    const end = clampDistance(shot.end_m);
    if (start > previousStart + DISTANCE_TOLERANCE) {
      return false;
    }
    if (!shot.holed && end > start + DISTANCE_TOLERANCE) {
      return false;
    }
    if (index !== shots.length - 1 && shot.holed) {
      return false;
    }
    previousStart = start;
  }
  const last = shots[shots.length - 1];
  if (!last.holed || clampDistance(last.end_m) > DISTANCE_TOLERANCE) {
    return false;
  }
  for (let index = 1; index < shots.length; index += 1) {
    const prev = shots[index - 1];
    const current = shots[index];
    const expectedStart = clampDistance(prev.end_m);
    const actualStart = clampDistance(current.start_m);
    if (Math.abs(expectedStart - actualStart) > START_MATCH_TOLERANCE) {
      return false;
    }
  }
  return true;
};

export const isHoleSGInvalid = (value: HoleSG): boolean => {
  return Boolean((value as Record<symbol, unknown>)[HOLE_SG_INVALID]);
};

export function holeSG(inputShots: ShotEvent[], baselines?: BaselineSet): HoleSG {
  if (!Array.isArray(inputShots) || !inputShots.length) {
    return markInvalid(createZeroResult());
  }
  const sanitized: ShotEvent[] = inputShots.map((shot) => ({
    start_m: clampDistance(shot.start_m),
    end_m: clampDistance(shot.end_m),
    startLie: shot.startLie,
    endLie: shot.endLie,
    holed: Boolean(shot.holed),
  }));

  if (!validateSequence(sanitized)) {
    return markInvalid(createZeroResult());
  }

  const baselineSet = baselines ?? loadDefaultBaselines();
  const phases: Record<Phase, number> = { ...ZERO_BY_PHASE };
  const shotBreakdown: ShotSG[] = [];

  for (const shot of sanitized) {
    const startBaseline = getBaseline(baselineSet, shot.startLie);
    const endBaseline = getBaseline(baselineSet, shot.endLie);
    const startExpectation = startBaseline(shot.start_m);
    const endExpectation = shot.holed ? 0 : endBaseline(shot.end_m);
    let sgValue = startExpectation - 1 - endExpectation;
    if (!Number.isFinite(sgValue)) {
      sgValue = 0;
    }
    const phase = classifyPhase(shot.startLie, shot.start_m);
    phases[phase] += sgValue;
    shotBreakdown.push({
      sg: sgValue,
      phase,
      start_m: shot.start_m,
      end_m: shot.holed ? 0 : shot.end_m,
      startLie: shot.startLie,
      endLie: shot.endLie,
    });
  }

  const total = phases.Tee + phases.Approach + phases.ShortGame + phases.Putting;

  return {
    total,
    byPhase: phases,
    shots: shotBreakdown,
  };
}
