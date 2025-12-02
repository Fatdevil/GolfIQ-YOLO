import { type ShotShapeIntent, type ShotShapeProfile } from '@app/api/caddieApi';
import type { ClubDistanceStats } from '@app/api/clubDistanceClient';
import {
  computePlaysLikeDistance,
  computeRiskZonesFromProfile,
  type ShotShapeRiskSummary,
} from '@app/caddie/caddieDistanceEngine';
import type { CaddieSettings, RiskProfile } from '@app/caddie/caddieSettingsStorage';

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

export interface CaddieDecisionContext {
  conditions: CaddieConditions;
  explicitIntent?: ShotShapeIntent;
  settings: CaddieSettings;
  clubs: CaddieClubCandidate[];
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

export function riskProfileToBufferM(riskProfile: RiskProfile): number {
  switch (riskProfile) {
    case 'safe':
      return 7;
    case 'aggressive':
      return 0;
    case 'normal':
    default:
      return 3;
  }
}

export function chooseClubForTargetDistance(
  targetDistanceM: number,
  safetyBufferM: number,
  clubStats: CaddieClubCandidate[],
): CaddieClubCandidate | null {
  if (!clubStats.length) return null;

  const effectiveTarget = targetDistanceM + safetyBufferM;
  const withCarry = clubStats
    .map((club) => ({ ...club, effectiveCarryM: getEffectiveCarryM(club) }))
    .filter((club) => Number.isFinite(club.effectiveCarryM) && club.effectiveCarryM > 0);

  if (!withCarry.length) return null;

  const nearTarget = withCarry.filter((club) => club.effectiveCarryM >= effectiveTarget - 10);
  const shortList = nearTarget.length ? nearTarget : withCarry;

  const covering = shortList.filter((club) => club.effectiveCarryM >= effectiveTarget);
  if (covering.length) {
    return [...covering].sort(compareCandidates)[0];
  }

  const fallback = [...shortList].sort((a, b) => compareCandidates(a, b))[shortList.length - 1];
  return fallback ?? null;
}

export function buildCaddieDecisionFromContext(
  ctx: CaddieDecisionContext,
): CaddieDecisionOutput | null {
  const intent = ctx.explicitIntent ?? ctx.settings.stockShape ?? 'straight';
  const riskProfile = ctx.settings.riskProfile ?? 'normal';
  const safetyBufferM = riskProfileToBufferM(riskProfile);

  const playsLikeDistanceM = computePlaysLikeDistance({
    targetDistanceM: ctx.conditions.targetDistanceM,
    windSpeedMps: ctx.conditions.windSpeedMps,
    windDirectionDeg: ctx.conditions.windDirectionDeg,
    elevationDeltaM: ctx.conditions.elevationDeltaM,
  });

  const selected = chooseClubForTargetDistance(playsLikeDistanceM, safetyBufferM, ctx.clubs);
  if (!selected) return null;

  const effectiveCarryM = getEffectiveCarryM(selected);
  const risk = computeRiskZonesFromProfile(ctx.shotShapeProfile);

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
