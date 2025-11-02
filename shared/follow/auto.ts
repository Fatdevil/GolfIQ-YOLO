import { bearing, haversine, shortArcDiff } from './geo';

export type AutoInput = {
  pos: {
    lat: number;
    lon: number;
    ts: number;
    speed_mps: number;
    headingDeg?: number;
  };
  hole: {
    id: number;
    par: number;
    green: {
      mid: { lat: number; lon: number };
      radius_m: number;
    };
    tee?: { lat: number; lon: number };
  };
  next?: {
    id: number;
    tee?: { lat: number; lon: number };
    green?: { mid: { lat: number; lon: number }; radius_m?: number };
  };
  prev?: {
    id: number;
    tee?: { lat: number; lon: number };
    green?: { mid: { lat: number; lon: number }; radius_m?: number };
  };
};

export type AutoState = {
  reachedGreenAt?: number;
  leftGreenAt?: number;
  atTeeBox?: { holeId: number; ts: number } | null;
  stableHoleId: number;
};

export type StepAutoOptions = {
  greenEnter_r?: number;
  greenLeave_r?: number;
  tee_r?: number;
  minLeave_s?: number;
  minEnter_s?: number;
  headingAgreeDeg?: number;
};

const DEFAULTS: Required<StepAutoOptions> = {
  greenEnter_r: 25,
  greenLeave_r: 40,
  tee_r: 20,
  minLeave_s: 12,
  minEnter_s: 3,
  headingAgreeDeg: 35,
};

const MIN_LEAVE_SPEED = 0.7;
const TEE_RELEASE_MULTIPLIER = 1.6;

function clampPositive(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function normalizeHeading(value: number | undefined): number | null {
  if (!Number.isFinite(value ?? NaN)) {
    return null;
  }
  const normalized = Number(value) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function msFromSeconds(seconds: number): number {
  return Math.max(0, Math.floor(seconds * 1000));
}

type TeeCandidate = {
  holeId: number;
  tee: { lat: number; lon: number };
  greenMid?: { lat: number; lon: number };
  radius?: number;
  kind: 'next' | 'prev';
};

function resolveBearing(
  candidate: TeeCandidate,
  fallbackGreen: { lat: number; lon: number } | null,
): number | null {
  const greenMid = candidate.greenMid ?? fallbackGreen;
  if (!greenMid) {
    return null;
  }
  return bearing(candidate.tee, greenMid);
}

function distanceTo(point: { lat: number; lon: number }, target: { lat: number; lon: number }): number {
  return haversine(point, target);
}

export function stepAutoV2(state: AutoState, input: AutoInput, opts?: StepAutoOptions): AutoState {
  const config: Required<StepAutoOptions> = {
    greenEnter_r: clampPositive(opts?.greenEnter_r ?? DEFAULTS.greenEnter_r, DEFAULTS.greenEnter_r),
    greenLeave_r: clampPositive(opts?.greenLeave_r ?? DEFAULTS.greenLeave_r, DEFAULTS.greenLeave_r),
    tee_r: clampPositive(opts?.tee_r ?? DEFAULTS.tee_r, DEFAULTS.tee_r),
    minLeave_s: clampPositive(opts?.minLeave_s ?? DEFAULTS.minLeave_s, DEFAULTS.minLeave_s),
    minEnter_s: clampPositive(opts?.minEnter_s ?? DEFAULTS.minEnter_s, DEFAULTS.minEnter_s),
    headingAgreeDeg: clampPositive(opts?.headingAgreeDeg ?? DEFAULTS.headingAgreeDeg, DEFAULTS.headingAgreeDeg),
  };

  const now = Number.isFinite(input.pos.ts ?? NaN) ? Number(input.pos.ts) : Date.now();
  const speed = Number.isFinite(input.pos.speed_mps ?? NaN) ? Math.max(0, Number(input.pos.speed_mps)) : 0;
  const heading = normalizeHeading(input.pos.headingDeg);
  const currentHoleId = Number(input.hole.id);
  const currentGreenMid = input.hole.green.mid;
  const position = { lat: Number(input.pos.lat), lon: Number(input.pos.lon) };

  const nextState: AutoState = {
    reachedGreenAt: state.reachedGreenAt,
    leftGreenAt: state.leftGreenAt,
    atTeeBox: state.atTeeBox ?? null,
    stableHoleId: Number.isFinite(state.stableHoleId) ? Number(state.stableHoleId) : currentHoleId,
  };

  const distanceToGreen = distanceTo(position, currentGreenMid);
  const minEnterMs = msFromSeconds(config.minEnter_s);
  const minLeaveMs = msFromSeconds(config.minLeave_s);

  const insideGreen = distanceToGreen <= config.greenEnter_r;
  if (insideGreen) {
    if (!nextState.reachedGreenAt || now < nextState.reachedGreenAt) {
      nextState.reachedGreenAt = now;
    }
    nextState.leftGreenAt = undefined;
  } else if (nextState.reachedGreenAt && now - nextState.reachedGreenAt < minEnterMs) {
    nextState.reachedGreenAt = undefined;
  }

  const enteredGreen = Boolean(nextState.reachedGreenAt && now - nextState.reachedGreenAt >= minEnterMs);

  const leavingCandidate = enteredGreen && speed >= MIN_LEAVE_SPEED && distanceToGreen >= config.greenLeave_r;
  if (leavingCandidate) {
    if (!nextState.leftGreenAt || now < nextState.leftGreenAt) {
      nextState.leftGreenAt = now;
    }
  } else if (!enteredGreen || distanceToGreen <= config.greenLeave_r * 0.8) {
    nextState.leftGreenAt = undefined;
  }

  const leftGreenConfirmed = Boolean(
    enteredGreen && nextState.leftGreenAt && now - nextState.leftGreenAt >= minLeaveMs,
  );

  const teeCandidates: TeeCandidate[] = [];
  if (input.next?.tee) {
    teeCandidates.push({
      holeId: Number(input.next.id),
      tee: input.next.tee,
      greenMid: input.next.green?.mid,
      radius: input.next.green?.radius_m,
      kind: 'next',
    });
  }
  if (input.prev?.tee) {
    teeCandidates.push({
      holeId: Number(input.prev.id),
      tee: input.prev.tee,
      greenMid: input.prev.green?.mid,
      radius: input.prev.green?.radius_m,
      kind: 'prev',
    });
  }

  let teeLock: TeeCandidate | null = null;
  for (const candidate of teeCandidates) {
    const distance = distanceTo(position, candidate.tee);
    if (distance > config.tee_r) {
      continue;
    }
    const teeBearing = resolveBearing(
      candidate,
      candidate.kind === 'next'
        ? input.next?.green?.mid ?? null
        : input.prev?.green?.mid ?? null,
    );
    if (heading === null || teeBearing === null) {
      continue;
    }
    const delta = Math.abs(shortArcDiff(heading, teeBearing));
    if (delta <= config.headingAgreeDeg) {
      teeLock = candidate;
      break;
    }
  }

  const releaseRadius = config.tee_r * TEE_RELEASE_MULTIPLIER;
  if (teeLock) {
    nextState.stableHoleId = teeLock.holeId;
    nextState.atTeeBox = { holeId: teeLock.holeId, ts: now };
  } else if (nextState.atTeeBox) {
    const lockedCandidate = teeCandidates.find((candidate) => candidate.holeId === nextState.atTeeBox?.holeId);
    if (lockedCandidate) {
      const distance = distanceTo(position, lockedCandidate.tee);
      if (distance > releaseRadius) {
        nextState.atTeeBox = null;
      } else {
        nextState.stableHoleId = lockedCandidate.holeId;
      }
    } else {
      nextState.atTeeBox = null;
    }
  }

  const previousStable = Number.isFinite(state.stableHoleId) ? Number(state.stableHoleId) : currentHoleId;
  const nextHoleId = input.next ? Number(input.next.id) : null;
  const prevHoleId = input.prev ? Number(input.prev.id) : null;
  const validHoleIds = [currentHoleId, nextHoleId, prevHoleId].filter((value): value is number => Number.isFinite(value ?? NaN));

  const teeLocked = Boolean(nextState.atTeeBox && nextState.atTeeBox.holeId === nextState.stableHoleId);

  if (!teeLocked) {
    if (leftGreenConfirmed && nextHoleId !== null && previousStable === currentHoleId) {
      nextState.stableHoleId = nextHoleId;
      nextState.reachedGreenAt = undefined;
      nextState.leftGreenAt = undefined;
    } else if (!validHoleIds.includes(nextState.stableHoleId)) {
      nextState.stableHoleId = currentHoleId;
    }
  }

  if (nextState.stableHoleId !== previousStable && !teeLocked) {
    nextState.atTeeBox = null;
  }

  return nextState;
}
