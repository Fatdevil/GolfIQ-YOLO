export interface PlaysLikeInput {
  targetDistanceM: number;
  windSpeedMps: number;
  windDirectionDeg: number;
  elevationDeltaM: number;
}

export interface ClubCandidate {
  club: string;
  baselineCarryM: number;
  manualCarryM?: number | null;
  source: 'auto' | 'manual';
  samples?: number;
}

type ClubCandidateWithCarry = ClubCandidate & { effectiveCarry: number };

const HEADWIND_COEFFICIENT = 0.8;
const ELEVATION_COEFFICIENT = 0.9;

export function computePlaysLikeDistance(input: PlaysLikeInput): number {
  const headwindComponent =
    input.windSpeedMps * Math.cos(((input.windDirectionDeg % 360) * Math.PI) / 180);
  return (
    input.targetDistanceM +
    headwindComponent * HEADWIND_COEFFICIENT +
    input.elevationDeltaM * ELEVATION_COEFFICIENT
  );
}

function filterBySamples<T extends ClubCandidate>(clubs: T[]): T[] {
  const withSamples = clubs.filter((club) => (club.samples ?? 0) >= 3);
  return withSamples.length > 0 ? withSamples : clubs;
}

export function suggestClubForTarget(
  clubs: ClubCandidate[],
  input: PlaysLikeInput,
): ClubCandidate | null {
  if (!clubs.length) return null;

  const withEffectiveCarry: ClubCandidateWithCarry[] = clubs.map((club) => ({
    ...club,
    effectiveCarry:
      club.source === 'manual' && club.manualCarryM != null
        ? club.manualCarryM
        : club.baselineCarryM,
  }));

  const validClubs = filterBySamples(
    withEffectiveCarry.filter((club) => Number.isFinite(club.effectiveCarry) && club.effectiveCarry > 0),
  ).sort((a, b) => a.effectiveCarry - b.effectiveCarry);

  if (!validClubs.length) return null;

  const playsLike = computePlaysLikeDistance(input);
  const atOrAbove = validClubs.filter((club) => club.effectiveCarry >= playsLike);
  if (atOrAbove.length > 0) {
    return atOrAbove[0];
  }
  return validClubs[validClubs.length - 1];
}
