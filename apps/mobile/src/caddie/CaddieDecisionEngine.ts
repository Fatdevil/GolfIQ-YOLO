import type { PlayerBag } from '@app/api/bagClient';
import { type ShotShapeIntent, type ShotShapeProfile } from '@app/api/caddieApi';
import type { ClubDistanceStats } from '@app/api/clubDistanceClient';
import {
  computePlaysLikeDetails,
  computeRiskZonesFromProfile,
  type PlaysLikeDetails,
  type ShotShapeRiskSummary,
} from '@app/caddie/caddieDistanceEngine';
import type { CaddieSettings, RiskProfile } from '@app/caddie/caddieSettingsStorage';
import type { CaddieDecision } from '@app/caddie/CaddieDecision';
import type { HoleCaddieTargets } from '@shared/round/autoHoleCore';

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
  playsLikeBreakdown: { slopeAdjustM: number; windAdjustM: number };
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

  const playsLike: PlaysLikeDetails = computePlaysLikeDetails({
    targetDistanceM: ctx.conditions.targetDistanceM,
    windSpeedMps: ctx.conditions.windSpeedMps,
    windDirectionDeg: ctx.conditions.windDirectionDeg,
    elevationDeltaM: ctx.conditions.elevationDeltaM,
  });

  const selected = chooseClubForTargetDistance(playsLike.effectiveDistanceM, safetyBufferM, ctx.clubs);
  if (!selected) return null;

  const effectiveCarryM = getEffectiveCarryM(selected);
  const risk = computeRiskZonesFromProfile(ctx.shotShapeProfile);

  return {
    club: selected.club,
    intent,
    effectiveCarryM,
    playsLikeDistanceM: playsLike.effectiveDistanceM,
    playsLikeBreakdown: {
      slopeAdjustM: playsLike.slopeAdjustM,
      windAdjustM: playsLike.windAdjustM,
    },
    source: selected.source,
    samples: selected.samples,
    risk,
  };
}

export function getPlaysLikeRecommendation(
  holeData: { distanceM: number; elevationDeltaM: number },
  currentConditions: { windSpeedMps?: number; windDirectionDeg?: number },
  playerProfile: CaddieClubCandidate[],
  safetyBufferM = 0,
) {
  const playsLike = computePlaysLikeDetails({
    targetDistanceM: holeData.distanceM,
    windSpeedMps: currentConditions.windSpeedMps ?? 0,
    windDirectionDeg: currentConditions.windDirectionDeg ?? 0,
    elevationDeltaM: holeData.elevationDeltaM,
  });

  const recommended = chooseClubForTargetDistance(
    playsLike.effectiveDistanceM,
    safetyBufferM,
    playerProfile,
  );

  return {
    effectiveDistance: playsLike.effectiveDistanceM,
    recommendedClub: recommended?.club ?? null,
    breakdown: {
      slopeAdjust: playsLike.slopeAdjustM,
      windAdjust: playsLike.windAdjustM,
    },
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

// Target-aware caddie decision engine (attack vs. layup)
export type CaddieRiskPreference = 'safe' | 'balanced' | 'aggressive';

export type WindConditions = { speedMps: number; angleDeg: number };

export type TargetAwareCaddieDecisionContext = {
  holeNumber: number;
  holePar: number;
  holeYardageM: number | null;
  targets: HoleCaddieTargets | null;
  playerBag: PlayerBag | null;
  riskPreference: CaddieRiskPreference | RiskProfile | null;
  playsLikeDistanceFn: (
    flatDistanceM: number,
    elevationM: number,
    wind: WindConditions,
  ) => number;
  elevationDiffM: number;
  wind: WindConditions;
};

type DistanceClub = { id: string; carry: number };

const roundDistance = (value: number | null | undefined): number | null => {
  if (!Number.isFinite(value ?? NaN)) return null;
  return Math.round(value as number);
};

export function normalizeRiskPreference(risk: CaddieRiskPreference | RiskProfile | null): CaddieRiskPreference {
  if (risk === 'safe' || risk === 'aggressive') return risk;
  return 'balanced';
}

function getClubCarry(club: { avgCarryM: number | null; manualAvgCarryM?: number | null }): number | null {
  const manual = club.manualAvgCarryM;
  if (Number.isFinite(manual)) return manual as number;
  const auto = club.avgCarryM;
  if (Number.isFinite(auto)) return auto as number;
  return null;
}

export function getMaxCarryFromBag(bag: PlayerBag | null): number {
  if (!bag) return 0;
  const carries = bag.clubs
    .filter((club) => club.active !== false)
    .map((club) => getClubCarry(club))
    .filter((carry): carry is number => Number.isFinite(carry));
  if (!carries.length) return 0;
  return Math.max(...carries);
}

export function pickClubForDistance(bag: PlayerBag, targetM: number | null): string | null {
  if (!Number.isFinite(targetM ?? NaN)) return null;
  const clubsWithCarry: DistanceClub[] = bag.clubs
    .filter((club) => club.active !== false)
    .map((club) => ({ id: club.clubId, carry: getClubCarry(club) }))
    .filter((club): club is DistanceClub => Number.isFinite(club.carry));

  if (!clubsWithCarry.length) return null;

  const sorted = clubsWithCarry.sort((a, b) => a.carry - b.carry);
  const covering = sorted.find((club) => club.carry >= (targetM as number));
  return (covering ?? sorted[sorted.length - 1]).id;
}

function chooseTargetType(
  totalDistanceM: number,
  par: number,
  risk: CaddieRiskPreference,
  maxCarry: number,
  hasLayup: boolean,
): 'green' | 'layup' {
  let targetType: 'green' | 'layup' = 'green';

  if (risk === 'safe') {
    if (totalDistanceM > maxCarry * 0.9 || par === 5) {
      targetType = 'layup';
    }
  } else if (risk === 'balanced') {
    if (par === 5) targetType = 'layup';
  } else if (risk === 'aggressive') {
    if (totalDistanceM > maxCarry * 1.3) {
      targetType = 'layup';
    }
  }

  if (targetType === 'layup' && !hasLayup) {
    return 'green';
  }

  return targetType;
}

function buildExplanation(options: {
  strategy: 'attack' | 'layup';
  targetDistance: number | null;
  rawDistance: number | null;
  clubId: string | null;
}): string {
  const distance = options.targetDistance ?? roundDistance(options.rawDistance);
  const distanceText = distance != null ? `~${distance} m` : 'target';
  const clubPart = options.clubId ? ` ${options.clubId}` : '';

  if (options.strategy === 'layup') {
    return `Safe layup to ${distanceText}.${clubPart ? ` ${clubPart} keeps you short of trouble.` : ''} Based on your bag and risk setting.`;
  }

  return `Attack the green — ${distanceText} plays-like.${clubPart ? ` ${clubPart} recommended.` : ''}`;
}

export function computeCaddieDecision(ctx: TargetAwareCaddieDecisionContext): CaddieDecision | null {
  if (!ctx.targets || !ctx.playerBag) return null;

  const risk = normalizeRiskPreference(ctx.riskPreference);
  const maxCarry = getMaxCarryFromBag(ctx.playerBag);
  const total = ctx.holeYardageM ?? 0;
  const hasLayup = Boolean(ctx.targets.layup?.carryDistanceM);
  const targetType = chooseTargetType(total, ctx.holePar, risk, maxCarry, hasLayup);

  const rawDistanceM = targetType === 'layup'
    ? ctx.targets.layup?.carryDistanceM ?? ctx.holeYardageM ?? null
    : ctx.holeYardageM ?? null;

  const targetDistanceM = rawDistanceM != null
    ? roundDistance(ctx.playsLikeDistanceFn(rawDistanceM, ctx.elevationDiffM, ctx.wind))
    : null;

  const recommendedClubId = pickClubForDistance(ctx.playerBag, targetDistanceM ?? rawDistanceM);
  const strategy = targetType === 'layup' ? 'layup' : 'attack';

  return {
    holeNumber: ctx.holeNumber,
    strategy,
    targetType,
    rawDistanceM: rawDistanceM ?? null,
    targetDistanceM,
    recommendedClubId,
    explanation: buildExplanation({
      strategy,
      targetDistance: targetDistanceM,
      rawDistance: rawDistanceM,
      clubId: recommendedClubId,
    }),
  };
}
