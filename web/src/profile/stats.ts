import type { QuickRound } from "@/features/quickround/types";
import type { GhostProfile } from "@/features/range/ghost";
import type { BagState } from "@/bag/types";

export type QuickRoundSummaryStats = {
  totalRounds: number;
  completedRounds: number;
  avgStrokes?: number;
  avgToPar?: number;
  bestToPar?: number;
};

export type RangeSummaryStats = {
  ghostCount: number;
  lastGhost?: GhostProfile;
};

export type BagSummaryStats = {
  totalClubs: number;
  clubsWithCarry: number;
};

export function computeQuickRoundStats(rounds: QuickRound[]): QuickRoundSummaryStats {
  const totalRounds = rounds.length;
  const completedRounds = rounds.filter((round) => Boolean(round.completedAt)).length;

  const scoredRounds = rounds.filter(
    (round) =>
      Boolean(round.completedAt) &&
      round.holes.some((hole) => typeof hole.strokes === "number" && !Number.isNaN(hole.strokes))
  );

  if (scoredRounds.length === 0) {
    return {
      totalRounds,
      completedRounds,
    };
  }

  let totalStrokes = 0;
  let totalToPar = 0;
  let bestToPar: number | undefined;
  let processedRounds = 0;

  scoredRounds.forEach((round) => {
    let strokesTotal = 0;
    let parTotal = 0;

    round.holes.forEach((hole) => {
      if (typeof hole.strokes === "number" && !Number.isNaN(hole.strokes)) {
        strokesTotal += hole.strokes;
        parTotal += typeof hole.par === "number" && !Number.isNaN(hole.par) ? hole.par : 0;
      }
    });

    if (strokesTotal === 0 && parTotal === 0) {
      return;
    }

    const toPar = strokesTotal - parTotal;
    totalStrokes += strokesTotal;
    totalToPar += toPar;
    processedRounds += 1;
    if (bestToPar === undefined || toPar < bestToPar) {
      bestToPar = toPar;
    }
  });

  const count = processedRounds;

  return {
    totalRounds,
    completedRounds,
    avgStrokes: count > 0 ? totalStrokes / count : undefined,
    avgToPar: count > 0 ? totalToPar / count : undefined,
    bestToPar: count > 0 ? bestToPar : undefined,
  };
}

export function computeRangeSummary(ghosts: GhostProfile[]): RangeSummaryStats {
  return {
    ghostCount: ghosts.length,
    lastGhost: ghosts[0] ?? undefined,
  };
}

export function computeBagSummary(bag: BagState): BagSummaryStats {
  const totalClubs = bag.clubs.length;
  const clubsWithCarry = bag.clubs.filter(
    (club) => typeof club.carry_m === "number" && !Number.isNaN(club.carry_m)
  ).length;

  return {
    totalClubs,
    clubsWithCarry,
  };
}
