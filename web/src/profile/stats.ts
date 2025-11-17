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

  const completedWithScores = rounds.filter(
    (round) =>
      Boolean(round.completedAt) &&
      round.holes.some(
        (hole) => typeof hole.strokes === "number" && Number.isFinite(hole.strokes)
      )
  );

  if (completedWithScores.length === 0) {
    return { totalRounds, completedRounds };
  }

  let totalStrokes = 0;
  let totalToPar = 0;
  let bestToPar: number | undefined;
  let countedRounds = 0;

  completedWithScores.forEach((round) => {
    let strokesTotal = 0;
    let parTotal = 0;
    let hasData = false;

    round.holes.forEach((hole) => {
      if (typeof hole.strokes === "number" && Number.isFinite(hole.strokes)) {
        strokesTotal += hole.strokes;
        parTotal += typeof hole.par === "number" && Number.isFinite(hole.par) ? hole.par : 0;
        hasData = true;
      }
    });

    if (!hasData) {
      return;
    }

    const toPar = strokesTotal - parTotal;
    totalStrokes += strokesTotal;
    totalToPar += toPar;
    countedRounds += 1;

    if (bestToPar === undefined || toPar < bestToPar) {
      bestToPar = toPar;
    }
  });

  if (countedRounds === 0) {
    return { totalRounds, completedRounds };
  }

  return {
    totalRounds,
    completedRounds,
    avgStrokes: totalStrokes / countedRounds,
    avgToPar: totalToPar / countedRounds,
    bestToPar,
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
