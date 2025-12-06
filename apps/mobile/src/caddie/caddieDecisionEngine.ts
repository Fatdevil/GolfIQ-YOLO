import type { PlayerBag } from '@app/api/bagClient';
import type { RiskProfile } from '@app/caddie/caddieSettingsStorage';
import type { CaddieDecision } from '@app/caddie/CaddieDecision';
import type { HoleCaddieTargets } from '@shared/round/autoHoleCore';

export type CaddieRiskPreference = 'safe' | 'balanced' | 'aggressive';

export type WindConditions = { speedMps: number; angleDeg: number };

export type CaddieDecisionContext = {
  holeNumber: number;
  holePar: number;
  holeYardageM: number | null;
  targets: HoleCaddieTargets | null;
  playerBag: PlayerBag | null;
  riskPreference: CaddieRiskPreference | RiskProfile | null;
  playsLikeDistanceFn: (flatDistanceM: number, elevationM: number, wind: WindConditions) => number;
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

function pickClubForDistance(bag: PlayerBag, targetM: number | null): string | null {
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

export function computeCaddieDecision(ctx: CaddieDecisionContext): CaddieDecision | null {
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

export { pickClubForDistance };
