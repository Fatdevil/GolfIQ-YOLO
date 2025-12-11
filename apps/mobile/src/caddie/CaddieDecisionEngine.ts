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
import type { BagClubStats, BagClubStatsMap, DistanceSource } from '@shared/caddie/bagStats';
import { MIN_AUTOCALIBRATED_SAMPLES, shouldUseBagStat } from '@shared/caddie/bagStats';
import type { BagReadinessOverview, ClubReadinessLevel } from '@shared/caddie/bagReadiness';
import { getClubReadiness } from '@shared/caddie/bagReadiness';
import type { PracticeDecisionContext } from '@shared/practice/practiceDecisionContext';
import { safeEmit, type TelemetryEmitter } from '@app/telemetry';

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
  distanceSource: DistanceSource;
  sampleCount?: number;
  minSamples?: number;
  readiness?: ClubReadinessLevel;
}

type CaddieClubCandidateWithCarry = CaddieClubCandidate & { effectiveCarryM: number };

export interface CaddieDecisionContext {
  conditions: CaddieConditions;
  explicitIntent?: ShotShapeIntent;
  settings: CaddieSettings;
  clubs: CaddieClubCandidate[];
  shotShapeProfile: ShotShapeProfile;
  bagReadinessOverview?: BagReadinessOverview | null;
}

export interface CaddieDecisionOutput {
  club: string;
  intent: ShotShapeIntent;
  effectiveCarryM: number;
  playsLikeDistanceM: number;
  playsLikeBreakdown: { slopeAdjustM: number; windAdjustM: number };
  source: 'auto' | 'manual';
  samples: number;
  distanceSource: DistanceSource;
  sampleCount?: number;
  minSamples?: number;
  risk: ShotShapeRiskSummary;
  clubReadiness?: ClubReadinessLevel;
}

function candidateSampleCount(candidate: CaddieClubCandidate): number {
  return candidate.sampleCount ?? candidate.samples ?? 0;
}

function readinessRank(level: ClubReadinessLevel | undefined): number {
  switch (level) {
    case 'excellent':
      return 3;
    case 'ok':
      return 2;
    case 'poor':
      return 1;
    case 'unknown':
    default:
      return 0;
  }
}

// Slight readiness bias: when distance is effectively tied, lean toward better calibrated data.
function compareCandidates(
  a: CaddieClubCandidate & { effectiveCarryM: number },
  b: CaddieClubCandidate & { effectiveCarryM: number },
): number {
  if (a.effectiveCarryM !== b.effectiveCarryM) {
    const diff = a.effectiveCarryM - b.effectiveCarryM;
    if (Math.abs(diff) <= 2) {
      const readinessDelta = readinessRank(b.readiness) - readinessRank(a.readiness);
      if (readinessDelta !== 0) return readinessDelta;
    }
    return diff;
  }
  const readinessDelta = readinessRank(b.readiness) - readinessRank(a.readiness);
  if (readinessDelta !== 0) return readinessDelta;
  const sampleDiff = candidateSampleCount(b) - candidateSampleCount(a);
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
): CaddieClubCandidateWithCarry | null {
  if (!clubStats.length) return null;

  const effectiveTarget = targetDistanceM + safetyBufferM;
  const withCarry: CaddieClubCandidateWithCarry[] = clubStats
    .map((club) => ({
      ...club,
      readiness: club.readiness,
      effectiveCarryM: getEffectiveCarryM(club),
    }))
    .filter((club) => Number.isFinite(club.effectiveCarryM) && club.effectiveCarryM > 0);

  if (!withCarry.length) return null;

  const nearTarget = withCarry.filter((club) => club.effectiveCarryM >= effectiveTarget - 10);
  const shortList = nearTarget.length ? nearTarget : withCarry;

  const covering = shortList.filter((club) => club.effectiveCarryM >= effectiveTarget);
  if (covering.length) {
    return [...covering].sort(compareCandidates)[0];
  }

  const fallback = [...shortList].sort((a, b) => compareCandidates(b, a))[0];
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

  const clubsWithReadiness = ctx.clubs.map((club) =>
    club.readiness || ctx.bagReadinessOverview
      ? { ...club, readiness: club.readiness ?? getClubReadiness(club.club, ctx.bagReadinessOverview) }
      : club,
  );

  const initialSelection = chooseClubForTargetDistance(
    playsLike.effectiveDistanceM,
    safetyBufferM,
    clubsWithReadiness,
  );
  if (!initialSelection) return null;

  let selected: CaddieClubCandidateWithCarry = initialSelection;

  if (ctx.bagReadinessOverview) {
    const comparable = clubsWithReadiness
      .filter((club) => club.club !== selected?.club)
      .filter((club) => Math.abs(getEffectiveCarryM(club) - selected.effectiveCarryM) <= 2)
      .sort((a, b) => readinessRank(b.readiness) - readinessRank(a.readiness));

    const preferred = comparable.find(
      (club) => readinessRank(club.readiness) > readinessRank(selected?.readiness),
    );

    if (preferred) {
      selected = { ...preferred, effectiveCarryM: getEffectiveCarryM(preferred) };
    }
  }

  const effectiveCarryM = getEffectiveCarryM(selected);
  const risk = computeRiskZonesFromProfile(ctx.shotShapeProfile);
  const samples = candidateSampleCount(selected);

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
    samples,
    distanceSource: selected.distanceSource,
    sampleCount: selected.sampleCount ?? samples,
    minSamples: selected.minSamples,
    risk,
    clubReadiness: selected.readiness,
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
  const distanceSource: DistanceSource =
    stats.source === 'manual' && stats.manualCarryM != null ? 'manual' : 'default';

  return {
    club: stats.club,
    baselineCarryM: stats.baselineCarryM,
    manualCarryM: stats.manualCarryM ?? null,
    source: stats.source,
    samples: stats.samples,
    distanceSource,
    sampleCount: stats.samples,
    minSamples: MIN_AUTOCALIBRATED_SAMPLES,
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
  bagStats?: BagClubStatsMap | null;
  bagReadinessOverview?: BagReadinessOverview | null;
  practiceContext?: PracticeDecisionContext | null;
  riskPreference: CaddieRiskPreference | RiskProfile | null;
  playsLikeDistanceFn: (
    flatDistanceM: number,
    elevationM: number,
    wind: WindConditions,
  ) => number;
  elevationDiffM: number;
  wind: WindConditions;
  telemetryEmitter?: TelemetryEmitter;
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

type ClubCarryDetails = {
  carry: number | null;
  distanceSource: DistanceSource;
  sampleCount?: number;
  minSamples?: number;
};

function getClubCarryDetails(
  club: { clubId?: string; avgCarryM: number | null; manualAvgCarryM?: number | null },
  bagStats?: BagClubStatsMap | null,
  minSamples: number = MIN_AUTOCALIBRATED_SAMPLES,
): ClubCarryDetails {
  const manual = club.manualAvgCarryM;
  const stat: BagClubStats | undefined = club.clubId && bagStats ? bagStats[club.clubId] : undefined;

  if (Number.isFinite(manual)) {
    return {
      carry: manual as number,
      distanceSource: 'manual',
      sampleCount: stat?.sampleCount,
      minSamples: stat ? minSamples : undefined,
    };
  }

  if (stat) {
    const useStat = shouldUseBagStat(stat, minSamples);
    const sampleCount = (stat as BagClubStats).sampleCount;
    if (useStat) {
      return {
        carry: stat.meanDistanceM,
        distanceSource: 'auto_calibrated',
        sampleCount,
        minSamples,
      };
    }

    return {
      carry: Number.isFinite(club.avgCarryM) ? (club.avgCarryM as number) : null,
      distanceSource: 'partial_stats',
      sampleCount,
      minSamples,
    };
  }

  const carry = Number.isFinite(club.avgCarryM) ? (club.avgCarryM as number) : null;

  return {
    carry,
    distanceSource: 'default',
  };
}

function getClubCarry(
  club: { clubId?: string; avgCarryM: number | null; manualAvgCarryM?: number | null },
  bagStats?: BagClubStatsMap | null,
  minSamples: number = MIN_AUTOCALIBRATED_SAMPLES,
): number | null {
  return getClubCarryDetails(club, bagStats, minSamples).carry;
}

export function getMaxCarryFromBag(
  bag: PlayerBag | null,
  bagStats?: BagClubStatsMap | null,
  minSamples: number = MIN_AUTOCALIBRATED_SAMPLES,
): number {
  if (!bag) return 0;
  const carries = bag.clubs
    .filter((club) => club.active !== false)
    .map((club) => getClubCarry(club, bagStats, minSamples))
    .filter((carry): carry is number => Number.isFinite(carry));
  if (!carries.length) return 0;
  return Math.max(...carries);
}

export function pickClubForDistance(
  bag: PlayerBag,
  targetM: number | null,
  bagStats?: BagClubStatsMap | null,
  minSamples: number = MIN_AUTOCALIBRATED_SAMPLES,
): string | null {
  if (!Number.isFinite(targetM ?? NaN)) return null;
  const clubsWithCarry: DistanceClub[] = bag.clubs
    .filter((club) => club.active !== false)
    .map((club) => ({
      id: club.clubId,
      carry: getClubCarry(club, bagStats, minSamples),
    }))
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
  practiceContext?: PracticeDecisionContext | null,
): { targetType: 'green' | 'layup'; influencedByPractice: boolean } {
  let targetType: 'green' | 'layup' = 'green';
  let influencedByPractice = false;

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

  if (targetType === 'layup' && hasLayup && practiceContext) {
    const focusAreas = practiceContext.recentFocusAreas ?? [];
    const focusOnApproach = focusAreas.includes('approach');
    const goalReached = Boolean(practiceContext.goalReached);
    const practiceConfidence = Math.min(1, Math.max(0, practiceContext.practiceConfidence ?? 0));
    const reachableWithBestClub = totalDistanceM <= maxCarry * 1.05;

    if (par === 5 && focusOnApproach && goalReached && practiceConfidence >= 0.6 && reachableWithBestClub) {
      targetType = 'green';
      influencedByPractice = true;
    }
  }

  if (targetType === 'layup' && !hasLayup) {
    return { targetType: 'green', influencedByPractice };
  }

  return { targetType, influencedByPractice };
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
  const maxCarry = getMaxCarryFromBag(ctx.playerBag, ctx.bagStats);
  const total = ctx.holeYardageM ?? 0;
  const hasLayup = Boolean(ctx.targets.layup?.carryDistanceM);
  const { targetType, influencedByPractice } = chooseTargetType(
    total,
    ctx.holePar,
    risk,
    maxCarry,
    hasLayup,
    ctx.practiceContext,
  );

  const rawDistanceM = targetType === 'layup'
    ? ctx.targets.layup?.carryDistanceM ?? ctx.holeYardageM ?? null
    : ctx.holeYardageM ?? null;

  const targetDistanceM = rawDistanceM != null
    ? roundDistance(ctx.playsLikeDistanceFn(rawDistanceM, ctx.elevationDiffM, ctx.wind))
    : null;

  const recommendedClubId = pickClubForDistance(
    ctx.playerBag,
    targetDistanceM ?? rawDistanceM,
    ctx.bagStats,
  );
  const strategy = targetType === 'layup' ? 'layup' : 'attack';

  const recommendedClub = recommendedClubId
    ? ctx.playerBag.clubs.find((club) => club.clubId === recommendedClubId)
    : null;
  const recommendedCarry = recommendedClub
    ? getClubCarryDetails(recommendedClub, ctx.bagStats)
    : null;
  const recommendedReadiness = recommendedClubId
    ? getClubReadiness(recommendedClubId, ctx.bagReadinessOverview)
    : undefined;

  const emit = ctx.telemetryEmitter ?? safeEmit;
  emit('caddie_target_decision_context', {
    holeNumber: ctx.holeNumber,
    holePar: ctx.holePar,
    holeYardageM: ctx.holeYardageM,
    targetType,
    scenario: ctx.holePar === 5 ? 'par5_target' : ctx.holePar === 3 ? 'par3_target' : 'par4_target',
    hasLayup,
    practiceContext: ctx.practiceContext
      ? {
          goalReached: Boolean(ctx.practiceContext.goalReached),
          recentFocusAreas: ctx.practiceContext.recentFocusAreas,
          practiceConfidence: Math.round((ctx.practiceContext.practiceConfidence ?? 0) * 100) / 100,
        }
      : null,
    influencedByPractice,
    riskProfile: risk,
    recommendedClubId,
  });

  return {
    holeNumber: ctx.holeNumber,
    strategy,
    targetType,
    rawDistanceM: rawDistanceM ?? null,
    targetDistanceM,
    recommendedClubId,
    recommendedClubDistanceSource: recommendedCarry?.distanceSource,
    recommendedClubSampleCount: recommendedCarry?.sampleCount ?? null,
    recommendedClubMinSamples: recommendedCarry?.minSamples ?? null,
    recommendedClubReadiness: recommendedReadiness,
    explanation: buildExplanation({
      strategy,
      targetDistance: targetDistanceM,
      rawDistance: rawDistanceM,
      clubId: recommendedClubId,
    }),
  };
}
