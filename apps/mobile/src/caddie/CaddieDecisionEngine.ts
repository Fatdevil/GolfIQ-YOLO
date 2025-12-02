import { type ShotShapeIntent, type ShotShapeProfile } from '@app/api/caddieApi';
import type { ClubDistanceStats } from '@app/api/clubDistanceClient';
import { computePlaysLikeDistance, computeRiskZonesFromProfile } from '@app/caddie/caddieDistanceEngine';
import type { ShotShapeRiskSummary } from '@app/caddie/caddieDistanceEngine';

export interface CaddieConditions {
  targetDistanceM: number;
  windSpeedMps: number;
  windDirectionDeg: number;
  elevationDeltaM: number;
}

export interface CaddieClubCandidate {
  club: string;
  baselineCarryM: number;
  manualCarryM?: number | null;
  source: 'auto' | 'manual';
  samples: number;
}

export interface CaddieDecisionInput {
  conditions: CaddieConditions;
  intent: ShotShapeIntent;
  clubStats: CaddieClubCandidate[];
  shotShapeProfile: ShotShapeProfile;
}

export interface CaddieDecisionOutput {
  club: string;
  intent: ShotShapeIntent;
  effectiveCarryM: number;
  playsLikeDistanceM: number;
  source: 'auto' | 'manual';
  samples: number;
  risk: ShotShapeRiskSummary;
}

function compareCandidates(a: CaddieClubCandidate & { effectiveCarryM: number }, b: CaddieClubCandidate & { effectiveCarryM: number }): number {
  if (a.effectiveCarryM !== b.effectiveCarryM) {
    return a.effectiveCarryM - b.effectiveCarryM;
  }
  const sampleDiff = (b.samples ?? 0) - (a.samples ?? 0);
  if (sampleDiff !== 0) return sampleDiff;
  return a.club.localeCompare(b.club);
}

export function getEffectiveCarryM(stats: CaddieClubCandidate): number {
  if (stats.source === 'manual' && stats.manualCarryM != null) {
    return stats.manualCarryM;
  }
  return stats.baselineCarryM;
}

export function chooseClubForConditions(
  conditions: CaddieConditions,
  clubStats: CaddieClubCandidate[],
): CaddieClubCandidate | null {
  if (!clubStats.length) return null;

  const playsLike = computePlaysLikeDistance({
    targetDistanceM: conditions.targetDistanceM,
    windSpeedMps: conditions.windSpeedMps,
    windDirectionDeg: conditions.windDirectionDeg,
    elevationDeltaM: conditions.elevationDeltaM,
  });

  const withCarry = clubStats
    .map((club) => ({ ...club, effectiveCarryM: getEffectiveCarryM(club) }))
    .filter((club) => Number.isFinite(club.effectiveCarryM) && club.effectiveCarryM > 0);

  if (!withCarry.length) return null;

  const nearPlaysLike = withCarry.filter((club) => club.effectiveCarryM >= playsLike - 10);
  const shortList = nearPlaysLike.length ? nearPlaysLike : withCarry;

  const covering = shortList.filter((club) => club.effectiveCarryM >= playsLike);
  if (covering.length) {
    return [...covering].sort(compareCandidates)[0];
  }

  const fallback = [...shortList].sort((a, b) => compareCandidates(a, b))[shortList.length - 1];
  return fallback ?? null;
}

export function buildCaddieDecision(
  conditions: CaddieConditions,
  intent: ShotShapeIntent,
  clubs: CaddieClubCandidate[],
  shotShapeProfile: ShotShapeProfile,
): CaddieDecisionOutput | null {
  const selected = chooseClubForConditions(conditions, clubs);
  if (!selected) return null;

  const playsLikeDistanceM = computePlaysLikeDistance({
    targetDistanceM: conditions.targetDistanceM,
    windSpeedMps: conditions.windSpeedMps,
    windDirectionDeg: conditions.windDirectionDeg,
    elevationDeltaM: conditions.elevationDeltaM,
  });
  const effectiveCarryM = getEffectiveCarryM(selected);
  const risk = computeRiskZonesFromProfile(shotShapeProfile);

  return {
    club: selected.club,
    intent,
    effectiveCarryM,
    playsLikeDistanceM,
    source: selected.source,
    samples: selected.samples,
    risk,
  };
}

export function mapDistanceStatsToCandidate(stats: ClubDistanceStats): CaddieClubCandidate {
  return {
    club: stats.club,
    baselineCarryM: stats.baselineCarryM,
    manualCarryM: stats.manualCarryM ?? null,
    source: stats.source,
    samples: stats.samples,
  };
}
