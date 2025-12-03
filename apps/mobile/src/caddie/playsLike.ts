export interface PlayerProfile {
  /** Map of club name to expected carry in meters. */
  carries: Record<string, number>;
  /** Optional ordering to break carry ties in a stable way. */
  priority?: string[];
}

export interface PlaysLikeInput {
  distance: number;
  elevationDiff: number;
  windSpeed: number;
  windAngle: number;
  playerProfile: PlayerProfile;
}

export interface PlaysLikeBreakdown {
  slopeAdjust: number;
  windAdjust: number;
}

export interface PlaysLikeRecommendation {
  effectiveDistance: number;
  recommendedClub: string | null;
  breakdown: PlaysLikeBreakdown;
}

const asNumber = (value: number, fallback = 0): number => {
  return Number.isFinite(value) ? Number(value) : fallback;
};

const normalizeAngleDeg = (angle: number): number => {
  if (!Number.isFinite(angle)) return 0;
  const wrapped = angle % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
};

export function computeEffectiveDistance(
  distance: number,
  elevationDiff: number,
  windSpeed: number,
  windAngle: number,
): { effectiveDistance: number; breakdown: PlaysLikeBreakdown } {
  const baseDistance = asNumber(distance, 0);
  const slopeAdjust = asNumber(elevationDiff, 0) * 1.0;
  const windSpeedMps = asNumber(windSpeed, 0);
  const normalizedAngle = normalizeAngleDeg(windAngle);
  const windFactor = Math.cos((normalizedAngle * Math.PI) / 180) * windSpeedMps * 0.02;
  const windAdjust = baseDistance * windFactor;

  const effectiveDistance = baseDistance + slopeAdjust + windAdjust;

  return {
    effectiveDistance,
    breakdown: {
      slopeAdjust,
      windAdjust,
    },
  };
}

export function recommendClub(
  effectiveDistance: number,
  profile: PlayerProfile,
): string | null {
  const entries = Object.entries(profile.carries)
    .map(([club, carry]) => ({ club, carry: asNumber(carry, Number.NaN) }))
    .filter((entry) => Number.isFinite(entry.carry) && entry.carry > 0);

  if (!entries.length) return null;

  const priority = profile.priority ?? [];
  const priorityIndex = new Map(priority.map((club, idx) => [club, idx] as const));

  entries.sort((a, b) => {
    if (a.carry !== b.carry) {
      return a.carry - b.carry;
    }
    const aRank = priorityIndex.get(a.club) ?? Number.POSITIVE_INFINITY;
    const bRank = priorityIndex.get(b.club) ?? Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    return a.club.localeCompare(b.club);
  });

  const covering = entries.find((entry) => entry.carry >= effectiveDistance);
  return (covering ?? entries[entries.length - 1]).club;
}

export function getPlaysLikeRecommendation(input: PlaysLikeInput): PlaysLikeRecommendation {
  const { effectiveDistance, breakdown } = computeEffectiveDistance(
    input.distance,
    input.elevationDiff,
    asNumber(input.windSpeed, 0),
    input.windAngle,
  );
  const recommendedClub = recommendClub(effectiveDistance, input.playerProfile);

  return {
    effectiveDistance,
    recommendedClub,
    breakdown,
  };
}
