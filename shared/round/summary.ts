import { deriveHoleState } from './derive';
import type { HoleState, RoundState, ShotEvent } from './types';
import {
  DEFAULT_STROKES_GAINED_BASELINE,
  computeStrokesGainedLight,
  type StrokesGainedLightSummary,
} from '../stats/strokesGainedLight';
import type { BaselineSet } from '../sg/baseline';

export interface PhaseSG {
  ott: number;
  app: number;
  arg: number;
  putt: number;
  total: number;
}

export interface ClubRow {
  club: string;
  shots: number;
  avgCarry_m: number | null;
  sgPerShot: number | null;
}

export interface HoleRow {
  hole: number;
  par: number;
  strokes: number;
  putts: number;
  gir: boolean | null;
  fir: boolean | null;
  sg: number;
}

export interface RoundSummary {
  strokes: number;
  toPar: number | null;
  putts: number;
  penalties: number;
  firPct: number | null;
  girPct: number | null;
  phases: PhaseSG;
  clubs: ClubRow[];
  holes: HoleRow[];
  strokesGainedLight?: StrokesGainedLightSummary;
}

type PhaseKey = keyof Pick<PhaseSG, 'ott' | 'app' | 'arg' | 'putt'>;

type ClubAccumulator = {
  shots: number;
  carrySum: number;
  carryCount: number;
  sgSum: number;
  sgCount: number;
};

const APPROACH_LIES = new Set<ShotEvent['startLie']>(['Fairway', 'Rough', 'Sand', 'Recovery']);

function resolvePhase(shot: ShotEvent): PhaseKey {
  if (shot.kind === 'Putt' || shot.startLie === 'Green') {
    return 'putt';
  }
  if (shot.startLie === 'Tee') {
    return 'ott';
  }
  const endedGreen = shot.endLie === 'Green';
  if (shot.kind === 'Chip' || shot.kind === 'Pitch' || endedGreen) {
    return 'arg';
  }
  if (APPROACH_LIES.has(shot.startLie) && !endedGreen) {
    return 'app';
  }
  if (APPROACH_LIES.has(shot.startLie) && endedGreen) {
    return 'arg';
  }
  return 'app';
}

function normaliseClubName(value: string | undefined | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.toLowerCase() === 'putter') {
    return null;
  }
  return trimmed;
}

function updateClub(acc: ClubAccumulator, shot: ShotEvent): void {
  acc.shots += 1;
  if (Number.isFinite(shot.carry_m ?? NaN)) {
    acc.carrySum += Number(shot.carry_m);
    acc.carryCount += 1;
  }
  if (Number.isFinite(shot.sg ?? NaN)) {
    acc.sgSum += Number(shot.sg);
    acc.sgCount += 1;
  }
}

function computeClubRows(map: Map<string, ClubAccumulator>): ClubRow[] {
  const rows: ClubRow[] = [];
  for (const [club, info] of map.entries()) {
    rows.push({
      club,
      shots: info.shots,
      avgCarry_m: info.carryCount ? info.carrySum / info.carryCount : null,
      sgPerShot: info.sgCount ? info.sgSum / info.sgCount : null,
    });
  }
  rows.sort((a, b) => {
    if (b.shots !== a.shots) {
      return b.shots - a.shots;
    }
    return a.club.localeCompare(b.club);
  });
  return rows;
}

export function buildRoundSummary(round: RoundState, baselines: BaselineSet): RoundSummary {
  const holeNumbers = Object.keys(round.holes)
    .map((key) => Number(key))
    .filter((num) => Number.isFinite(num))
    .sort((a, b) => a - b);

  const phaseTotals: PhaseSG = { ott: 0, app: 0, arg: 0, putt: 0, total: 0 };
  const clubMap = new Map<string, ClubAccumulator>();
  const holes: HoleRow[] = [];
  const allShots: ShotEvent[] = [];

  let strokesTotal = 0;
  let puttsTotal = 0;
  let penaltiesTotal = 0;
  let toParSum = 0;
  let toParKnown = true;
  let firCount = 0;
  let firEligible = 0;
  let girCount = 0;
  let girEligible = 0;

  for (const holeNo of holeNumbers) {
    const sourceHole = round.holes[holeNo];
    if (!sourceHole) {
      continue;
    }
    const shouldDerive = shouldDeriveHole(sourceHole);
    const derived = shouldDerive ? deriveHoleState({ round, hole: sourceHole, baselines }) : sourceHole;

    const strokes = Number.isFinite(derived.strokes ?? NaN)
      ? Number(derived.strokes)
      : derived.shots.length;
    const putts = Number.isFinite(derived.putts ?? NaN)
      ? Number(derived.putts)
      : derived.shots.reduce(
          (acc, shot) => acc + (shot.kind === 'Putt' || shot.startLie === 'Green' ? 1 : 0),
          0,
        );
    const penalties = Number.isFinite(derived.penalties ?? NaN)
      ? Number(derived.penalties)
      : derived.shots.reduce((acc, shot) => acc + (shot.kind === 'Penalty' ? 1 : 0), 0);

    strokesTotal += strokes;
    puttsTotal += putts;
    penaltiesTotal += penalties;

    if (!Number.isFinite(derived.par ?? NaN)) {
      toParKnown = false;
    } else {
      toParSum += strokes - Number(derived.par);
    }

    const gir = derived.metrics?.gir ?? null;
    const fir = derived.metrics?.fir ?? null;
    if (gir !== null) {
      girEligible += 1;
      if (gir) {
        girCount += 1;
      }
    }
    if (fir !== null) {
      firEligible += 1;
      if (fir) {
        firCount += 1;
      }
    }

    let holeSg = 0;
    for (const shot of derived.shots) {
      if (Number.isFinite(shot.sg ?? NaN)) {
        const sgValue = Number(shot.sg);
        holeSg += sgValue;
        phaseTotals.total += sgValue;
        const phase = resolvePhase(shot);
        phaseTotals[phase] += sgValue;
      }
      allShots.push({ ...shot, par: derived.par });
      const clubName = normaliseClubName(shot.club);
      if (clubName) {
        const entry = clubMap.get(clubName) ?? {
          shots: 0,
          carrySum: 0,
          carryCount: 0,
          sgSum: 0,
          sgCount: 0,
        };
        updateClub(entry, shot);
        clubMap.set(clubName, entry);
      }
    }

    holes.push({
      hole: holeNo,
      par: Number.isFinite(derived.par ?? NaN) ? Number(derived.par) : 0,
      strokes,
      putts,
      gir,
      fir,
      sg: holeSg,
    });
  }

  const firPct = firEligible ? firCount / firEligible : null;
  const girPct = girEligible ? girCount / girEligible : null;

  return {
    strokes: strokesTotal,
    toPar: toParKnown ? toParSum : null,
    putts: puttsTotal,
    penalties: penaltiesTotal,
    firPct,
    girPct,
    phases: phaseTotals,
    clubs: computeClubRows(clubMap),
    holes,
    strokesGainedLight: computeStrokesGainedLight(allShots, DEFAULT_STROKES_GAINED_BASELINE),
  };
}

function shouldDeriveHole(hole: HoleState): boolean {
  if (!hole.metrics) {
    return true;
  }
  for (const shot of hole.shots) {
    if (!Number.isFinite(shot.sg ?? NaN)) {
      return true;
    }
  }
  return false;
}
