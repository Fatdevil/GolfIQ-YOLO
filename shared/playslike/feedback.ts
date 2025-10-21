import { CLUB_SEQUENCE, effectiveBag, suggestClub, type Bag, type ClubId } from "./bag";

const MINOR_ERROR_THRESHOLD_M = 0.75;
const MIN_FACTOR_MAGNITUDE_M = 0.5;
const MAX_FACTORS_TO_DISPLAY = 3;
const DEFAULT_CLUB_GAP_M = 12;
const MIN_ERROR_FOR_CLUB_ADJUST_M = 5;
const MIN_AIM_ADJUST_DEG = 0.25;
const AIM_DECIMALS = 1;
const MINOR_FACTOR_DECIMALS = 1;
const MINUS = "\u2212";

export interface FeedbackPlannedInput {
  base_m: number;
  playsLike_m: number;
  deltas: {
    temp: number;
    alt: number;
    head: number;
    slope: number;
  };
  clubSuggested?: string | null;
  tuningActive?: boolean;
  aimAdjust_deg?: number | null;
}

export interface FeedbackActualInput {
  carry_m: number;
  clubUsed?: string | null;
}

export type FeedbackFactorId = "temp" | "alt" | "head" | "slope";

export interface FeedbackFactorSummary {
  id: FeedbackFactorId;
  label: string;
  value_m: number;
}

export interface FeedbackInput {
  planned: FeedbackPlannedInput;
  actual: FeedbackActualInput;
  bag?: Bag | null;
  heading_deg?: number | null;
  cross_aim_deg_per_mps?: number | null;
}

export interface FeedbackOutput {
  title: string;
  lines: string[];
  nextClub?: string;
  error_m: number;
  clubError: number;
  topFactors: FeedbackFactorSummary[];
  tuningActive?: boolean;
}

const sanitizeNumber = (value: number | null | undefined): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value);
};

const sanitizeBag = (bag: Bag | null | undefined): Bag => (bag ? { ...bag } : effectiveBag());

const isClubId = (value: string | null | undefined): value is ClubId =>
  Boolean(value && (CLUB_SEQUENCE as readonly string[]).includes(value));

const clampIndex = (index: number, length: number): number => {
  if (length <= 0) {
    return 0;
  }
  if (index < 0) {
    return 0;
  }
  if (index >= length) {
    return length - 1;
  }
  return index;
};

const formatMeters = (value: number): string => {
  const magnitude = Math.abs(value);
  if (magnitude >= 1) {
    return Math.round(magnitude).toString();
  }
  return magnitude.toFixed(MINOR_FACTOR_DECIMALS);
};

const formatSignedMeters = (value: number): string => {
  if (Object.is(value, -0)) {
    return "0";
  }
  if (value === 0) {
    return "0";
  }
  const sign = value > 0 ? "+" : MINUS;
  return `${sign}${formatMeters(value)}`;
};

const formatSignedDegrees = (value: number): string => {
  const magnitude = Math.abs(value);
  const rounded = magnitude.toFixed(AIM_DECIMALS);
  const sign = value > 0 ? "+" : MINUS;
  return `${sign}${rounded}`;
};

const computeClubGap = (bag: Bag, referenceDistance: number): number => {
  const entries = (CLUB_SEQUENCE as readonly ClubId[])
    .map((club) => ({ club, carry: sanitizeNumber(bag[club]) }))
    .filter((entry) => entry.carry > 0)
    .sort((a, b) => a.carry - b.carry);

  if (entries.length < 2) {
    return DEFAULT_CLUB_GAP_M;
  }

  const reference = Number.isFinite(referenceDistance) ? Number(referenceDistance) : 0;
  let index = entries.findIndex((entry) => entry.carry >= reference);
  if (index === -1) {
    index = entries.length - 1;
  }

  const prevGap = index > 0 ? entries[index].carry - entries[index - 1].carry : 0;
  const nextGap = index < entries.length - 1 ? entries[index + 1].carry - entries[index].carry : 0;

  const gaps = [prevGap, nextGap].filter((gap) => gap > 0);
  if (gaps.length > 0) {
    const average = gaps.reduce((acc, gap) => acc + gap, 0) / gaps.length;
    if (Number.isFinite(average) && average > 0) {
      return average;
    }
  }

  const diffs = entries
    .slice(1)
    .map((entry, idx) => entry.carry - entries[idx].carry)
    .filter((gap) => gap > 0);

  if (diffs.length > 0) {
    const average = diffs.reduce((acc, gap) => acc + gap, 0) / diffs.length;
    if (Number.isFinite(average) && average > 0) {
      return average;
    }
  }

  return DEFAULT_CLUB_GAP_M;
};

const resolvePlannedClub = (bag: Bag, planned: FeedbackPlannedInput): ClubId => {
  if (isClubId(planned.clubSuggested)) {
    return planned.clubSuggested;
  }
  return suggestClub(bag, planned.playsLike_m);
};

const resolveActualClub = (bag: Bag, actual: FeedbackActualInput): ClubId => {
  if (isClubId(actual.clubUsed)) {
    return actual.clubUsed;
  }
  return suggestClub(bag, actual.carry_m);
};

const resolveActualClubLabel = (bag: Bag, actual: FeedbackActualInput): string => {
  if (actual.clubUsed && typeof actual.clubUsed === "string") {
    return actual.clubUsed;
  }
  return resolveActualClub(bag, actual);
};

const resolveFactorLabel = (id: FeedbackFactorId, value: number): string => {
  switch (id) {
    case "head":
      return value >= 0 ? "tailwind" : "headwind";
    case "slope":
      return value >= 0 ? "downhill" : "uphill";
    case "alt":
      return "altitude";
    case "temp":
    default:
      return "temp";
  }
};

const buildFactorSummaries = (planned: FeedbackPlannedInput): FeedbackFactorSummary[] => {
  const entries: { id: FeedbackFactorId; value: number }[] = [
    { id: "temp", value: sanitizeNumber(planned.deltas.temp) },
    { id: "alt", value: sanitizeNumber(planned.deltas.alt) },
    { id: "head", value: sanitizeNumber(planned.deltas.head) },
    { id: "slope", value: sanitizeNumber(planned.deltas.slope) },
  ];

  const sorted = entries.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const significant = sorted.filter((entry) => Math.abs(entry.value) >= MIN_FACTOR_MAGNITUDE_M);

  const result: FeedbackFactorSummary[] = [];
  for (const entry of significant.length >= 2 ? significant : sorted) {
    result.push({
      id: entry.id,
      label: resolveFactorLabel(entry.id, entry.value),
      value_m: entry.value,
    });
    if (result.length >= MAX_FACTORS_TO_DISPLAY) {
      break;
    }
  }

  return result;
};

const buildFactorsLine = (factors: FeedbackFactorSummary[]): string => {
  if (!factors.length) {
    return "Main factors: no significant adjustments.";
  }
  const parts = factors.map((factor) => `${factor.label} ${formatSignedMeters(factor.value_m)} m`);
  return `Main factors: ${parts.join(", ")}`;
};

const chooseNextClub = (
  bag: Bag,
  plannedClub: ClubId,
  actual: FeedbackActualInput,
  error_m: number,
  clubSteps: number,
): { nextClub: ClubId; steps: number } | null => {
  const baseClub = isClubId(actual.clubUsed) ? actual.clubUsed : plannedClub;
  const baseIndex = (CLUB_SEQUENCE as readonly ClubId[]).indexOf(baseClub);
  if (baseIndex === -1) {
    return null;
  }
  const direction = error_m < -MINOR_ERROR_THRESHOLD_M ? 1 : error_m > MINOR_ERROR_THRESHOLD_M ? -1 : 0;
  if (direction === 0 || clubSteps <= 0) {
    return { nextClub: baseClub, steps: 0 };
  }
  const steps = Math.max(1, clubSteps);
  const targetIndex = clampIndex(baseIndex + direction * steps, CLUB_SEQUENCE.length);
  return { nextClub: CLUB_SEQUENCE[targetIndex], steps: direction * steps };
};

export function buildShotFeedback(input: FeedbackInput): FeedbackOutput {
  const bag = sanitizeBag(input.bag ?? null);
  const planned = input.planned;
  const actual = input.actual;

  const plannedDistance = sanitizeNumber(planned.playsLike_m);
  const actualCarry = sanitizeNumber(actual.carry_m);
  const error = actualCarry - plannedDistance;

  const clubGap = computeClubGap(bag, plannedDistance);
  const approxClubError = clubGap > 0 ? error / clubGap : 0;
  const absError = Math.abs(error);
  let approxSteps = Math.round(Math.abs(approxClubError));
  if (approxSteps === 0 && absError >= MIN_ERROR_FOR_CLUB_ADJUST_M) {
    approxSteps = 1;
  }

  let title: string;
  if (absError < MINOR_ERROR_THRESHOLD_M) {
    title = "On target (<1 m)";
  } else {
    const rounded = formatMeters(error);
    const suffix = error < 0 ? "short" : "long";
    const clubLabel = approxSteps > 0
      ? ` (≈ ${approxSteps} club${approxSteps === 1 ? "" : "s"})`
      : "";
    title = `${rounded} m ${suffix}${clubLabel}`;
  }

  const plannedClub = resolvePlannedClub(bag, planned);
  const plannedClubLabel = plannedClub;
  const actualClubLabel = resolveActualClubLabel(bag, actual);

  const factors = buildFactorSummaries(planned);
  const factorsLine = buildFactorsLine(factors);

  const clubSuggestion = chooseNextClub(bag, plannedClub, actual, error, approxSteps);
  const nextClub = clubSuggestion ? clubSuggestion.nextClub : plannedClub;

  const hasCrossAim = Number.isFinite(planned.aimAdjust_deg)
    ? Math.abs(Number(planned.aimAdjust_deg)) >= MIN_AIM_ADJUST_DEG
    : Number.isFinite(input.cross_aim_deg_per_mps) && Math.abs(Number(input.cross_aim_deg_per_mps)) >= MIN_AIM_ADJUST_DEG;
  const aimAdjust = Number.isFinite(planned.aimAdjust_deg)
    ? Number(planned.aimAdjust_deg)
    : Number.isFinite(input.cross_aim_deg_per_mps)
      ? Number(input.cross_aim_deg_per_mps)
      : 0;

  const aimDirection = aimAdjust > 0 ? "LEFT" : aimAdjust < 0 ? "RIGHT" : null;
  const aimText = hasCrossAim && aimDirection
    ? `aim ${formatSignedDegrees(aimAdjust)}° ${aimDirection} for crosswind`
    : null;

  let nextLine: string;
  if (clubSuggestion && clubSuggestion.steps !== 0) {
    const sign = clubSuggestion.steps > 0 ? "+" : MINUS;
    const magnitude = Math.abs(clubSuggestion.steps);
    const stepLabel = `${sign}${magnitude} club${magnitude === 1 ? "" : "s"}`;
    nextLine = `Next time: choose ${stepLabel}`;
  } else {
    nextLine = "Next time: stay with the same club";
  }

  if (aimText) {
    nextLine = `${nextLine} OR ${aimText}.`;
  } else if (!nextLine.endsWith(".")) {
    nextLine = `${nextLine}.`;
  }

  const lines = [
    factorsLine,
    `You used ${actualClubLabel}; suggested was ${plannedClubLabel}.`,
    nextLine,
  ];

  return {
    title,
    lines,
    nextClub,
    error_m: error,
    clubError: approxClubError,
    topFactors: factors,
    tuningActive: Boolean(planned.tuningActive),
  };
}
