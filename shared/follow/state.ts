import { getItem, setItem } from '../core/pstore';
import { haversine } from './geo';
import type { FollowPhase, FollowState, GeoPoint, HoleRef } from './types';

const STORAGE_PREFIX = '@follow/round:';
const ENTER_GREEN_THRESHOLD_M = 25;
const LEAVE_GREEN_THRESHOLD_M = 40;
const LEAVE_DELAY_MS = 15_000;
const LEAVE_MIN_SPEED_MPS = 0.7;
const LOCATE_TOLERANCE_M = 120;

type Clock = () => number;

type MachineOptions = {
  roundId: string;
  holes: readonly HoleRef[];
  autoAdvanceEnabled?: boolean;
  clock?: Clock;
  locateToleranceM?: number;
};

type TickInput = {
  position: GeoPoint | null;
  headingDeg?: number | null;
  speedMps?: number | null;
  now?: number;
};

type TickResult = {
  state: FollowState;
  autoAdvanced: boolean;
};

async function resolvePersistedHoleIndex(roundId: string, holes: readonly HoleRef[]): Promise<number> {
  if (!roundId) {
    return -1;
  }
  try {
    const stored = await getItem(`${STORAGE_PREFIX}${roundId}`);
    if (!stored) {
      return -1;
    }
    const parsed = JSON.parse(stored) as { id?: string } | string;
    const holeId = typeof parsed === 'string' ? parsed : parsed?.id;
    if (!holeId) {
      return -1;
    }
    const index = holes.findIndex((hole) => hole.id === holeId);
    return index >= 0 ? index : -1;
  } catch {
    return -1;
  }
}

async function persistHole(roundId: string, hole: HoleRef | null): Promise<void> {
  if (!roundId || !hole) {
    return;
  }
  try {
    await setItem(`${STORAGE_PREFIX}${roundId}`, JSON.stringify({ id: hole.id }));
  } catch {
    // ignore persistence failures
  }
}

function baseState(roundId: string): FollowState {
  return {
    phase: 'locate',
    hole: null,
    roundId,
    holeIndex: -1,
    autoAdvanceEnabled: true,
    enterGreenAt: null,
    leaveCandidateAt: null,
    overrideTs: null,
    lastUpdateTs: 0,
    lastHeadingDeg: null,
    lastSnapshotTs: null,
  } satisfies FollowState;
}

function clampIndex(index: number, holes: readonly HoleRef[]): number {
  if (!Number.isFinite(index)) {
    return -1;
  }
  if (holes.length === 0) {
    return -1;
  }
  return Math.min(holes.length - 1, Math.max(0, Math.floor(index)));
}

function selectNearestHole(
  position: GeoPoint,
  holes: readonly HoleRef[],
  toleranceM: number,
  currentIndex: number,
): number {
  if (!Number.isFinite(toleranceM) || toleranceM <= 0) {
    toleranceM = LOCATE_TOLERANCE_M;
  }
  let bestIndex = currentIndex >= 0 ? currentIndex : -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  holes.forEach((hole, index) => {
    const distance = haversine(position, hole.middle);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  if (bestDistance <= toleranceM) {
    return bestIndex;
  }
  return currentIndex;
}

export class FollowStateMachine {
  private readonly holes: readonly HoleRef[];

  private readonly clock: Clock;

  private readonly toleranceM: number;

  private state: FollowState;

  private constructor(options: MachineOptions, initialIndex: number) {
    this.holes = options.holes.slice();
    this.clock = options.clock ?? Date.now;
    this.toleranceM = options.locateToleranceM ?? LOCATE_TOLERANCE_M;
    this.state = baseState(options.roundId);
    this.state.autoAdvanceEnabled = options.autoAdvanceEnabled !== false;
    if (initialIndex >= 0 && initialIndex < this.holes.length) {
      this.state.holeIndex = initialIndex;
      this.state.hole = this.holes[initialIndex] ?? null;
      this.state.phase = 'follow';
    }
  }

  static async create(options: MachineOptions): Promise<FollowStateMachine> {
    const initialIndex = await resolvePersistedHoleIndex(options.roundId, options.holes);
    return new FollowStateMachine(options, initialIndex);
  }

  get snapshot(): FollowState {
    return { ...this.state, hole: this.state.hole };
  }

  async tick(input: TickInput): Promise<TickResult> {
    const now = Number.isFinite(input.now ?? NaN) ? Number(input.now) : this.clock();
    const speed = Number.isFinite(input.speedMps ?? NaN) ? Number(input.speedMps) : 0;
    if (Number.isFinite(input.headingDeg ?? NaN)) {
      this.state.lastHeadingDeg = Number(input.headingDeg);
    }
    this.state.lastUpdateTs = now;
    let autoAdvanced = false;
    if (input.position) {
      if (this.state.phase === 'locate' || this.state.holeIndex < 0) {
        const nextIndex = selectNearestHole(input.position, this.holes, this.toleranceM, this.state.holeIndex);
        if (nextIndex >= 0 && nextIndex !== this.state.holeIndex) {
          this.applyHoleIndex(nextIndex, 'follow', now, false);
          await persistHole(this.state.roundId ?? '', this.state.hole);
        } else if (nextIndex >= 0) {
          this.state.phase = 'follow';
          this.state.holeIndex = nextIndex;
          this.state.hole = this.holes[nextIndex] ?? null;
        }
      }
      if (this.state.hole) {
        const middleDist = haversine(input.position, this.state.hole.middle);
        if (middleDist <= ENTER_GREEN_THRESHOLD_M) {
          if (!this.state.enterGreenAt) {
            this.state.enterGreenAt = now;
          }
          this.state.leaveCandidateAt = null;
          if (this.state.phase === 'advance') {
            this.state.phase = 'follow';
          }
        } else if (middleDist >= LEAVE_GREEN_THRESHOLD_M && speed >= LEAVE_MIN_SPEED_MPS) {
          if (!this.state.leaveCandidateAt) {
            this.state.leaveCandidateAt = now;
          }
          if (
            this.state.enterGreenAt &&
            this.state.leaveCandidateAt &&
            now - this.state.leaveCandidateAt >= LEAVE_DELAY_MS &&
            now >= this.state.enterGreenAt
          ) {
            this.state.phase = 'advance';
          }
        } else {
          this.state.leaveCandidateAt = null;
          if (this.state.phase === 'advance') {
            this.state.phase = 'follow';
          }
        }
      }
    }

    if (this.state.phase === 'advance' && this.state.autoAdvanceEnabled) {
      autoAdvanced = await this.advance(now);
    }

    return { state: this.snapshot, autoAdvanced };
  }

  async manualNext(now?: number): Promise<FollowState> {
    if (this.holes.length === 0) {
      return this.snapshot;
    }
    const target = clampIndex(this.state.holeIndex + 1, this.holes);
    return this.applyManual(target, now);
  }

  async manualPrev(now?: number): Promise<FollowState> {
    if (this.holes.length === 0) {
      return this.snapshot;
    }
    const target = clampIndex(this.state.holeIndex - 1, this.holes);
    return this.applyManual(target, now);
  }

  async setAutoAdvance(enabled: boolean): Promise<FollowState> {
    this.state.autoAdvanceEnabled = enabled === true;
    return this.snapshot;
  }

  private async applyManual(targetIndex: number, now?: number): Promise<FollowState> {
    if (targetIndex < 0 || targetIndex >= this.holes.length) {
      return this.snapshot;
    }
    const ts = Number.isFinite(now ?? NaN) ? Number(now) : this.clock();
    this.applyHoleIndex(targetIndex, 'follow', ts, true);
    await persistHole(this.state.roundId ?? '', this.state.hole);
    return this.snapshot;
  }

  private async advance(now?: number): Promise<boolean> {
    const targetIndex = this.state.holeIndex + 1;
    if (targetIndex >= this.holes.length) {
      return false;
    }
    const ts = Number.isFinite(now ?? NaN) ? Number(now) : this.clock();
    this.applyHoleIndex(targetIndex, 'follow', ts, false);
    await persistHole(this.state.roundId ?? '', this.state.hole);
    return true;
  }

  private applyHoleIndex(index: number, phase: FollowPhase, now: number, override: boolean): void {
    const clamped = clampIndex(index, this.holes);
    this.state.holeIndex = clamped;
    this.state.hole = clamped >= 0 ? this.holes[clamped] ?? null : null;
    this.state.phase = this.state.hole ? phase : 'locate';
    this.state.enterGreenAt = null;
    this.state.leaveCandidateAt = null;
    this.state.lastUpdateTs = now;
    if (override) {
      this.state.overrideTs = now;
    } else {
      this.state.overrideTs = null;
    }
  }
}

export type { TickInput, TickResult };
