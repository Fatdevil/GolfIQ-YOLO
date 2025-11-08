import { computeNetSimple } from './scoring';
import type { MemberRole } from './types';
import { courseHandicap, playingHandicap } from '../whs/calc';
import type { TeeRating } from '../whs/types';

export type SlopeCR = Pick<TeeRating, 'slope' | 'rating' | 'par' | 'strokeIndex'> & {
  allowancePct?: number;
};

export type HoleScoreLike = {
  hole: number;
  gross: number;
  net?: number | null;
  toPar?: number | null;
  par?: number | null;
  updatedAt?: string | number | null;
};

export type RoundLike = {
  id: string;
  memberId: string;
  memberName: string;
  role?: MemberRole;
  handicapIndex?: number | null;
  playingHandicap?: number | null;
  allowancePct?: number | null;
  startedAt?: string | number | null;
  finishedAt?: string | number | null;
  status?: 'pending' | 'in_progress' | 'finished';
  holes: HoleScoreLike[];
};

export type BoardPlayer = {
  id: string;
  name: string;
  gross: number;
  net: number;
  toPar: number;
  thru: number;
  hole: number | null;
  status: 'pending' | 'in_progress' | 'finished';
  updatedAt?: string;
};

export type Board = {
  players: BoardPlayer[];
  updatedAt: string;
};

type InternalScore = {
  gross: number;
  net: number;
  toPar: number;
  thru: number;
  lastHole: number;
  lastUnderParHole: number;
  updatedAt: number | null;
  finishTs: number | null;
};

function toEpoch(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.floor(value) : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function resolvePlayingHandicap(round: RoundLike, slope?: SlopeCR): number | null {
  if (Number.isFinite(round.playingHandicap ?? NaN)) {
    return Math.round(Number(round.playingHandicap));
  }
  if (!Number.isFinite(round.handicapIndex ?? NaN) || !slope) {
    return null;
  }
  const ch = courseHandicap(Number(round.handicapIndex), {
    id: 'tee',
    name: 'tee',
    slope: slope.slope,
    rating: slope.rating,
    par: slope.par,
    strokeIndex: slope.strokeIndex,
  });
  const allowance = Number.isFinite(round.allowancePct ?? NaN)
    ? Number(round.allowancePct)
    : Number.isFinite(slope.allowancePct ?? NaN)
      ? Number(slope.allowancePct)
      : 95;
  return playingHandicap(ch, allowance);
}

function aggregateRound(round: RoundLike, slope?: SlopeCR): InternalScore {
  let gross = 0;
  let net = 0;
  let toPar = 0;
  let thru = 0;
  let lastHole = 0;
  let lastUnderParHole = -1;
  let updatedAt: number | null = null;

  const sorted = [...round.holes].sort((a, b) => a.hole - b.hole);

  for (const hole of sorted) {
    if (!Number.isFinite(hole.gross ?? NaN)) {
      continue;
    }
    const grossValue = Math.max(1, Math.round(Number(hole.gross)));
    const netValue = Number.isFinite(hole.net ?? NaN)
      ? Math.max(1, Math.round(Number(hole.net)))
      : grossValue;
    const parValue = Number.isFinite(hole.par ?? NaN)
      ? Math.max(3, Math.round(Number(hole.par)))
      : null;

    gross += grossValue;
    net += netValue;
    thru += 1;
    lastHole = hole.hole;
    if (Number.isFinite(hole.toPar ?? NaN)) {
      toPar += Math.round(Number(hole.toPar));
      if (Number(hole.toPar) < 0) {
        lastUnderParHole = Math.max(lastUnderParHole, hole.hole);
      }
    } else if (parValue !== null) {
      const holeToPar = grossValue - parValue;
      toPar += holeToPar;
      if (holeToPar < 0) {
        lastUnderParHole = Math.max(lastUnderParHole, hole.hole);
      }
    }
    const holeTs = toEpoch(hole.updatedAt ?? null);
    if (holeTs !== null) {
      updatedAt = Math.max(updatedAt ?? holeTs, holeTs);
    }
  }

  const playing = resolvePlayingHandicap(round, slope);
  if (thru > 0 && net === gross) {
    const fallback = playing ?? 0;
    net = computeNetSimple(gross, fallback, thru);
  }

  const finishTs = toEpoch(round.finishedAt ?? null);
  if (finishTs !== null) {
    updatedAt = Math.max(updatedAt ?? finishTs, finishTs);
  }

  return {
    gross,
    net,
    toPar,
    thru,
    lastHole,
    lastUnderParHole,
    updatedAt,
    finishTs,
  };
}

function classifyStatus(round: RoundLike, score: InternalScore): 'pending' | 'in_progress' | 'finished' {
  if (round.status === 'finished' || Number.isFinite(score.finishTs ?? NaN)) {
    return 'finished';
  }
  if (round.status === 'in_progress' || score.thru > 0) {
    return 'in_progress';
  }
  return 'pending';
}

function nextHole(score: InternalScore, status: BoardPlayer['status']): number | null {
  if (status === 'finished') {
    return null;
  }
  return score.lastHole > 0 ? score.lastHole + 1 : 1;
}

function sortPlayers(a: BoardPlayer & { tie: InternalScore }, b: BoardPlayer & { tie: InternalScore }): number {
  if (a.net !== b.net) {
    return a.net - b.net;
  }
  if (a.tie.lastUnderParHole !== b.tie.lastUnderParHole) {
    return b.tie.lastUnderParHole - a.tie.lastUnderParHole;
  }
  const aFinish = a.tie.finishTs ?? Number.POSITIVE_INFINITY;
  const bFinish = b.tie.finishTs ?? Number.POSITIVE_INFINITY;
  if (aFinish !== bFinish) {
    return aFinish - bFinish;
  }
  return a.name.localeCompare(b.name);
}

export function buildBoard(rounds: RoundLike[], slope?: SlopeCR): Board {
  const players: Array<BoardPlayer & { tie: InternalScore }> = [];
  let latestUpdate: number | null = null;

  for (const round of rounds) {
    const score = aggregateRound(round, slope);
    const status = classifyStatus(round, score);
    const updatedAt = score.updatedAt ?? toEpoch(round.startedAt ?? null);
    if (updatedAt !== null) {
      latestUpdate = Math.max(latestUpdate ?? updatedAt, updatedAt);
    }
    players.push({
      id: round.memberId,
      name: round.memberName,
      gross: score.gross,
      net: score.net,
      toPar: score.toPar,
      thru: score.thru,
      hole: nextHole(score, status),
      status,
      updatedAt: updatedAt !== null ? new Date(updatedAt).toISOString() : undefined,
      tie: score,
    });
  }

  players.sort(sortPlayers);

  const sanitized = players.map(({ tie, ...rest }) => rest);
  const updatedAt = latestUpdate !== null ? new Date(latestUpdate).toISOString() : new Date().toISOString();

  return {
    players: sanitized,
    updatedAt,
  };
}

