import type { HoleState, RoundState } from '../round/types';

function safeHoleList(round: RoundState | null | undefined): HoleState[] {
  if (!round || !round.holes) {
    return [];
  }
  return Object.values(round.holes).filter((entry): entry is HoleState => Boolean(entry));
}

function holeGross(hole: HoleState | null | undefined): number {
  if (!hole) {
    return 0;
  }
  if (typeof hole.manualScore === 'number' && Number.isFinite(hole.manualScore)) {
    return Math.max(0, Math.floor(hole.manualScore));
  }
  if (typeof hole.strokes === 'number' && Number.isFinite(hole.strokes)) {
    return Math.max(0, Math.floor(hole.strokes));
  }
  const shots = Array.isArray(hole.shots) ? hole.shots.length : 0;
  return Math.max(0, shots);
}

export function computeRoundRevision(round: RoundState | null | undefined): number {
  const holes = safeHoleList(round);
  return holes.reduce((total, hole) => total + holeGross(hole), 0);
}

function rollingHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function computeScoresHash(round: RoundState | null | undefined): string {
  const holes = safeHoleList(round);
  if (!holes.length) {
    return '0';
  }
  const parts = holes
    .map((hole) => ({
      hole: Number.isFinite(hole.hole) ? Number(hole.hole) : 0,
      gross: holeGross(hole),
    }))
    .sort((a, b) => a.hole - b.hole)
    .map((entry) => `${entry.hole}:${entry.gross}`);
  return rollingHash(parts.join('|'));
}
