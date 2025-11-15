import { QuickRound } from "./types";

export type QuickRoundComputedSummary = {
  totalPar: number;
  totalStrokes: number;
  toPar: number | null;
  netStrokes: number | null;
  netToPar: number | null;
  missingScores: boolean;
};

export function computeQuickRoundSummary(
  round: QuickRound
): QuickRoundComputedSummary {
  let totalPar = 0;
  let totalStrokes = 0;
  let missingScores = false;

  for (const hole of round.holes) {
    const parValue = typeof hole.par === "number" && Number.isFinite(hole.par)
      ? hole.par
      : 0;
    totalPar += parValue;

    if (typeof hole.strokes === "number" && Number.isFinite(hole.strokes)) {
      totalStrokes += hole.strokes;
    } else {
      missingScores = true;
    }
  }

  const toPar = missingScores ? null : totalStrokes - totalPar;

  const handicap =
    typeof round.handicap === "number" && Number.isFinite(round.handicap)
      ? round.handicap
      : null;

  let netStrokes: number | null = null;
  let netToPar: number | null = null;

  if (!missingScores && handicap !== null) {
    netStrokes = totalStrokes - handicap;
    netToPar = netStrokes - totalPar;
  }

  return {
    totalPar,
    totalStrokes,
    toPar,
    netStrokes,
    netToPar,
    missingScores,
  };
}
