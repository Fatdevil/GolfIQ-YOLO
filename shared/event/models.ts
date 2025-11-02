import type { SharedRoundV1 } from './payload';

export type EventFormat = 'gross' | 'net' | 'stableford';

export type Participant = {
  id: string;
  name: string;
  hcp?: number;
  rounds: Record<string, SharedRoundV1>;
};

export type EventState = {
  id: string;
  name: string;
  courseId?: string;
  format: EventFormat;
  holes: { start: number; end: number };
  participants: Record<string, Participant>;
  createdAt: number;
};

export type LeaderRow = {
  rank: number;
  participantId: string;
  name: string;
  gross?: number;
  net?: number;
  stableford?: number;
  sg?: number;
};

type SegmentSummary = { last3: number; last6: number; last9: number };

type AugmentedRow = LeaderRow & {
  tieGross: SegmentSummary;
  tieNet: SegmentSummary;
  tieStableford: SegmentSummary;
};

const DEFAULT_PAR = 4;

const rangeLen = (r?: { start: number; end: number }): number | undefined =>
  r && Number.isFinite(r.start) && Number.isFinite(r.end) && r.end >= r.start
    ? Math.floor(r.end) - Math.floor(r.start) + 1
    : undefined;

export function scaleHandicapForRound(
  fullHcp: number,
  roundHoles?: { start: number; end: number },
  eventHoles?: { start: number; end: number },
): number {
  const rh = rangeLen(roundHoles);
  const eh = rangeLen(eventHoles);
  const holesUsed = eh ?? rh ?? 18;
  const factor = Math.max(1, Math.min(18, holesUsed)) / 18;
  return fullHcp * factor;
}

function buildHoleOrder(range: { start: number; end: number }): number[] {
  const start = Math.max(1, Math.floor(range.start));
  const end = Math.max(start, Math.floor(range.end));
  const holes: number[] = [];
  for (let hole = start; hole <= end; hole += 1) {
    holes.push(hole);
  }
  return holes;
}

function computeStablefordPoints(relative: number): number {
  if (!Number.isFinite(relative)) {
    return 0;
  }
  if (relative <= -3) {
    return 5;
  }
  if (relative === -2) {
    return 4;
  }
  if (relative === -1) {
    return 3;
  }
  if (relative === 0) {
    return 2;
  }
  if (relative === 1) {
    return 1;
  }
  return 0;
}

function sumLast(values: number[], count: number): number {
  if (!values.length || count <= 0) {
    return 0;
  }
  const start = Math.max(0, values.length - count);
  let total = 0;
  for (let idx = start; idx < values.length; idx += 1) {
    total += values[idx];
  }
  return total;
}

function segments(values: number[]): SegmentSummary {
  return {
    last3: sumLast(values, 3),
    last6: sumLast(values, 6),
    last9: sumLast(values, 9),
  };
}

function normaliseName(participant: Participant, fallback: string | null): string {
  if (participant.name && participant.name.trim()) {
    return participant.name.trim();
  }
  if (fallback && fallback.trim()) {
    return fallback.trim();
  }
  return participant.id;
}

function compareDirectional(a: number, b: number, direction: 'asc' | 'desc'): number {
  if (!Number.isFinite(a) && !Number.isFinite(b)) {
    return 0;
  }
  const safeA = Number.isFinite(a) ? a : direction === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  const safeB = Number.isFinite(b) ? b : direction === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  return direction === 'asc' ? safeA - safeB : safeB - safeA;
}

function compareSegments(a: SegmentSummary, b: SegmentSummary, direction: 'asc' | 'desc'): number {
  const keys: Array<keyof SegmentSummary> = ['last9', 'last6', 'last3'];
  for (const key of keys) {
    const diff = compareDirectional(a[key], b[key], direction);
    if (Math.abs(diff) > 1e-9) {
      return diff;
    }
  }
  return 0;
}

function compareRows(a: AugmentedRow, b: AugmentedRow, format: EventFormat): number {
  const direction = format === 'stableford' ? 'desc' : 'asc';
  let metricA: number | undefined;
  let metricB: number | undefined;
  let tieA: SegmentSummary;
  let tieB: SegmentSummary;
  if (format === 'gross') {
    metricA = a.gross;
    metricB = b.gross;
    tieA = a.tieGross;
    tieB = b.tieGross;
  } else if (format === 'net') {
    metricA = a.net;
    metricB = b.net;
    tieA = a.tieNet;
    tieB = b.tieNet;
  } else {
    metricA = a.stableford;
    metricB = b.stableford;
    tieA = a.tieStableford;
    tieB = b.tieStableford;
  }

  const metricDiff = compareDirectional(metricA ?? Number.NaN, metricB ?? Number.NaN, direction);
  if (Math.abs(metricDiff) > 1e-9) {
    return metricDiff;
  }
  const segmentDiff = compareSegments(tieA, tieB, direction);
  if (Math.abs(segmentDiff) > 1e-9) {
    return segmentDiff;
  }
  return a.name.localeCompare(b.name);
}

function resolveParticipantHcp(participant: Participant, rounds: SharedRoundV1[]): number | undefined {
  if (Number.isFinite(participant.hcp ?? NaN)) {
    return Number(participant.hcp);
  }
  for (const round of rounds) {
    const candidate = Number(round.player?.hcp);
    if (Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function aggregateParticipant(
  participant: Participant,
  holeIndex: Map<number, number>,
  event?: EventState,
): AugmentedRow {
  const rounds = Object.values(participant.rounds ?? {});
  rounds.sort((a, b) => a.roundId.localeCompare(b.roundId));

  const grossValues: number[] = [];
  const netValues: number[] = [];
  const stablefordValues: number[] = [];

  let grossTotal = 0;
  let hasGross = false;
  let netTotal = 0;
  let hasNet = false;
  let stablefordTotal = 0;
  let hasStableford = false;
  let sgTotal = 0;
  let hasSg = false;

  const resolvedHcp = resolveParticipantHcp(participant, rounds);

  let fallbackName: string | null = null;

  for (const round of rounds) {
    if (!fallbackName && round.player?.name) {
      fallbackName = round.player.name;
    }
    if (Number.isFinite(round.gross)) {
      grossTotal += Number(round.gross);
      hasGross = true;
    }

    if (Number.isFinite(round.net)) {
      netTotal += Number(round.net);
      hasNet = true;
    } else if (Number.isFinite(round.gross) && Number.isFinite(resolvedHcp ?? NaN)) {
      const adjHcp = scaleHandicapForRound(Number(resolvedHcp), round.holes, event?.holes);
      const adj = Math.round(adjHcp);
      netTotal += Number(round.gross) - adj;
      hasNet = true;
    }

    if (Number.isFinite(round.sg)) {
      sgTotal += Number(round.sg);
      hasSg = true;
    }

    const holes = Array.isArray(round.holesBreakdown) ? [...round.holesBreakdown] : [];
    holes.sort((a, b) => {
      const idxA = holeIndex.get(a.h) ?? Number.MAX_SAFE_INTEGER;
      const idxB = holeIndex.get(b.h) ?? Number.MAX_SAFE_INTEGER;
      if (idxA !== idxB) {
        return idxA - idxB;
      }
      return a.h - b.h;
    });

    let roundStableford = 0;
    let roundSgFromHoles = 0;

    for (const hole of holes) {
      const strokes = Number(hole.strokes);
      if (!Number.isFinite(strokes)) {
        continue;
      }
      grossValues.push(strokes);

      const netRelative = Number.isFinite(hole.net ?? NaN) ? Number(hole.net) : null;
      const inferredPar = netRelative != null ? strokes - netRelative : DEFAULT_PAR;
      const relativeToPar = netRelative ?? strokes - inferredPar;
      netValues.push(relativeToPar);

      const holeSg = Number(hole.sg);
      if (Number.isFinite(holeSg)) {
        roundSgFromHoles += holeSg;
      }

      const points = computeStablefordPoints(relativeToPar);
      roundStableford += points;
      stablefordValues.push(points);
    }

    if (!Number.isFinite(round.sg) && holes.length) {
      sgTotal += roundSgFromHoles;
      hasSg = hasSg || Number.isFinite(roundSgFromHoles);
    }

    if (holes.length) {
      stablefordTotal += roundStableford;
      hasStableford = true;
    }
  }

  const name = normaliseName(participant, fallbackName);

  return {
    rank: 0,
    participantId: participant.id,
    name,
    gross: hasGross ? grossTotal : undefined,
    net: hasNet ? netTotal : undefined,
    stableford: hasStableford ? stablefordTotal : undefined,
    sg: hasSg ? sgTotal : undefined,
    tieGross: segments(grossValues),
    tieNet: segments(netValues),
    tieStableford: segments(stablefordValues),
  };
}

export function computeLeaderboard(event: EventState): LeaderRow[] {
  const holes = buildHoleOrder(event.holes);
  const holeIndex = new Map<number, number>();
  holes.forEach((hole, idx) => holeIndex.set(hole, idx));

  const participants = Object.values(event.participants ?? {});
  if (!participants.length) {
    return [];
  }

  const augmented = participants.map((participant) => aggregateParticipant(participant, holeIndex, event));

  augmented.sort((a, b) => compareRows(a, b, event.format));

  const metricKey: keyof LeaderRow = event.format === 'gross' ? 'gross' : event.format === 'net' ? 'net' : 'stableford';
  const direction = event.format === 'stableford' ? 'desc' : 'asc';

  let nextRank = 0;
  let lastMetric: number | null = null;
  let lastSegments: SegmentSummary | null = null;

  const rows: LeaderRow[] = [];

  for (const row of augmented) {
    nextRank += 1;
    const metricValueRaw = row[metricKey];
    const metricValue = Number.isFinite(metricValueRaw ?? NaN)
      ? Number(metricValueRaw)
      : direction === 'asc'
        ? Number.POSITIVE_INFINITY
        : Number.NEGATIVE_INFINITY;
    const tieSegments = event.format === 'gross' ? row.tieGross : event.format === 'net' ? row.tieNet : row.tieStableford;

    let rank = nextRank;
    if (
      lastMetric !== null &&
      Math.abs(compareDirectional(metricValue, lastMetric, direction)) <= 1e-9 &&
      lastSegments &&
      compareSegments(tieSegments, lastSegments, direction) === 0
    ) {
      rank = rows[rows.length - 1]?.rank ?? nextRank;
    } else {
      lastMetric = metricValue;
      lastSegments = tieSegments;
    }

    rows.push({
      rank,
      participantId: row.participantId,
      name: row.name,
      gross: row.gross,
      net: row.net,
      stableford: row.stableford,
      sg: row.sg,
    });
  }

  return rows;
}

