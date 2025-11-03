import { expectedStrokesForDistance } from '../sg/engine';
import type {
  BagStats,
  ClubId,
  HazardContext,
  PlaysLike,
  ScoreContext,
  Suggestion,
} from './types';

const nz = (value: number | undefined, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const has = <T>(value: T | undefined): value is T => value !== undefined;

type QuantileKey = 'p50_m' | 'p75_m' | 'p90_m';

type LabelConfig = {
  label: Suggestion['label'];
  quantile: QuantileKey;
  riskAdjustment: number;
};

const LABEL_CONFIGS: readonly LabelConfig[] = [
  { label: 'SAFE', quantile: 'p50_m', riskAdjustment: -0.03 },
  { label: 'NEUTRAL', quantile: 'p75_m', riskAdjustment: 0 },
  { label: 'AGG', quantile: 'p90_m', riskAdjustment: 0.05 },
];

const DEFAULT_MIN_SAMPLES = 5;
const DEFAULT_MAX_CANDIDATES = 3;
const ABS_TOLERANCE = 1e-6;

const LATERAL_SIGMA_M: Record<ClubId, number> = {
  D: 18,
  '3W': 16,
  '5W': 14,
  '3i': 13,
  '4i': 12,
  '5i': 11,
  '6i': 9.5,
  '7i': 8.5,
  '8i': 7.5,
  '9i': 6.5,
  PW: 5.5,
  GW: 4.8,
  SW: 4.5,
  LW: 4.5,
};

const ROLLOUT_FIRMNESS: Record<'soft' | 'med' | 'firm', Record<'wood' | 'longIron' | 'midIron' | 'shortIron' | 'wedge', number>> = {
  soft: { wood: 6, longIron: 4, midIron: 2, shortIron: 1, wedge: 0 },
  med: { wood: 12, longIron: 7, midIron: 4, shortIron: 2, wedge: 1 },
  firm: { wood: 18, longIron: 12, midIron: 7, shortIron: 4, wedge: 2 },
};

const SAFE_THRESHOLD = 0.05;
const NEUTRAL_THRESHOLD = 0.12;
const AGG_THRESHOLD = 0.22;

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value <= min) {
    return min;
  }
  if (value >= max) {
    return max;
  }
  return value;
};

const toFinite = (value: number | undefined): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
};

const normalizeDistance = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return value >= 0 ? value : 0;
};

const categorizeClub = (club: ClubId): 'wood' | 'longIron' | 'midIron' | 'shortIron' | 'wedge' => {
  if (club === 'D' || club.endsWith('W')) {
    return 'wood';
  }
  if (club === '3i' || club === '4i') {
    return 'longIron';
  }
  if (club === '5i' || club === '6i') {
    return 'midIron';
  }
  if (club === '7i' || club === '8i' || club === '9i') {
    return 'shortIron';
  }
  return 'wedge';
};

const computeRollout = (club: ClubId, firmness: PlaysLike['fairwayFirmness']): number => {
  const category = categorizeClub(club);
  const firmnessKey = firmness ?? 'med';
  const table = ROLLOUT_FIRMNESS[firmnessKey];
  const base = table[category];
  if (category === 'wedge' || category === 'shortIron') {
    return base;
  }
  return base;
};

const windAdjustment = (wind_mps: number): number => {
  if (!Number.isFinite(wind_mps)) {
    return 0;
  }
  const WIND_PER_MPS = 1.8; // metres of carry change per m/s
  return wind_mps * WIND_PER_MPS;
};

const temperatureAdjustment = (temp_c: number): number => {
  if (!Number.isFinite(temp_c)) {
    return 0;
  }
  const reference = 20;
  const diff = temp_c - reference;
  const TEMP_PER_DEG = -0.35; // colder (negative diff) increases needed distance
  return diff * TEMP_PER_DEG;
};

const elevationAdjustment = (elevation_m: number): number => {
  if (!Number.isFinite(elevation_m)) {
    return 0;
  }
  const ELEVATION_FACTOR = 0.8;
  return elevation_m * ELEVATION_FACTOR;
};

const computeEffectiveDistance = (dist: PlaysLike): number => {
  const base = normalizeDistance(dist.raw_m);
  const windAdj = windAdjustment(nz(dist.wind_mps));
  const tempAdj = temperatureAdjustment(nz(dist.temp_c));
  const elevAdj = elevationAdjustment(nz(dist.elevation_m));
  return Math.max(0, base + windAdj + tempAdj + elevAdj);
};

const computeAim = (haz: HazardContext, sigma: number): Suggestion['aim'] => {
  const left = clamp(toFinite(haz.leftPenaltyProb) ?? 0, 0, 1);
  const right = clamp(toFinite(haz.rightPenaltyProb) ?? 0, 0, 1);
  const diff = left - right;
  let type: Suggestion['aim']['type'] = 'CENTER';
  let lateral = 0;
  const FAIRWAY_ADJUST_M = 6;
  if (diff > 0.15) {
    type = 'SAFE_RIGHT';
    lateral = clamp(diff * FAIRWAY_ADJUST_M, 0, FAIRWAY_ADJUST_M * 1.5);
  } else if (diff < -0.15) {
    type = 'SAFE_LEFT';
    lateral = clamp(-diff * FAIRWAY_ADJUST_M, 0, FAIRWAY_ADJUST_M * 1.5) * -1;
  }

  const fairwayWidth = toFinite(haz.fairwayWidth_m);
  let fairwayProb: number;
  if (fairwayWidth && fairwayWidth > ABS_TOLERANCE) {
    const halfWidth = Math.max(0, fairwayWidth / 2 - Math.abs(lateral));
    const denom = Math.max(sigma, 1);
    const ratio = halfWidth / (Math.sqrt(2) * denom);
    const erfApprox = (2 / Math.sqrt(Math.PI)) * ratio - (2 / (3 * Math.sqrt(Math.PI))) * ratio ** 3;
    fairwayProb = clamp(0.5 + erfApprox / 2, 0.1, 0.95);
  } else {
    const base = 0.68 - (sigma - 6) / 40;
    fairwayProb = clamp(base, 0.25, 0.85);
  }

  return { type, lateral_m: lateral, expectedFairwayProb: fairwayProb };
};

const computeBaseRisk = (
  club: ClubId,
  carry_m: number,
  haz: HazardContext,
  aim: Suggestion['aim'],
  sigma: number,
  frontCarryReq: number | null,
): number => {
  if (frontCarryReq !== null && carry_m + ABS_TOLERANCE < frontCarryReq) {
    return 1;
  }

  const left = clamp(toFinite(haz.leftPenaltyProb) ?? 0, 0, 1);
  const right = clamp(toFinite(haz.rightPenaltyProb) ?? 0, 0, 1);
  const dispersionFactor = clamp(0.4 + sigma / 30, 0.4, 1.1);
  const directionalShift = aim.type === 'SAFE_RIGHT' ? -0.08 : aim.type === 'SAFE_LEFT' ? -0.08 : 0;
  const leftWeight = clamp(0.5 + (aim.lateral_m < 0 ? -aim.lateral_m / 20 : 0) + directionalShift, 0.1, 0.9);
  const rightWeight = clamp(0.5 + (aim.lateral_m > 0 ? aim.lateral_m / 20 : 0) + directionalShift, 0.1, 0.9);
  const lateralRisk = dispersionFactor * (left * leftWeight + right * rightWeight) / 2;

  const fairwayPenalty = 1 - aim.expectedFairwayProb;
  const fairwayContribution = clamp(fairwayPenalty * 0.15, 0, 0.2);

  const longRisk = club === 'D' || club.endsWith('W') ? 0.03 : 0.015;

  const total = lateralRisk + fairwayContribution + longRisk;
  return clamp(total, 0, 1);
};

const adjustRiskThresholds = (score: ScoreContext): Record<Suggestion['label'], number> => {
  let safe = SAFE_THRESHOLD;
  let neutral = NEUTRAL_THRESHOLD;
  let agg = AGG_THRESHOLD;

  const strokes = toFinite(score.strokesToTarget) ?? 0;
  const holesRemaining = toFinite(score.holesRemaining) ?? Number.POSITIVE_INFINITY;

  if (strokes >= 2 && holesRemaining <= 4) {
    safe += 0.07;
    neutral += 0.07;
    agg += 0.07;
  } else if (strokes >= 1) {
    safe += 0.03;
    neutral += 0.03;
    agg += 0.03;
  } else if (strokes <= -2) {
    safe -= 0.05;
    neutral -= 0.05;
    agg -= 0.05;
  } else if (strokes <= -1) {
    safe -= 0.03;
    neutral -= 0.03;
    agg -= 0.03;
  }

  safe = clamp(safe, 0.02, 0.25);
  neutral = clamp(neutral, safe + 0.02, 0.35);
  agg = clamp(agg, neutral + 0.02, 0.45);

  return { SAFE: safe, NEUTRAL: neutral, AGG: agg };
};

const computeRemainingDistance = (target_m: number, totalDistance: number): number => {
  if (totalDistance <= target_m) {
    return Math.max(0, target_m - totalDistance);
  }
  const overshoot = totalDistance - target_m;
  return Math.max(3, overshoot * 0.5);
};

const buildRationale = (
  label: Suggestion['label'],
  quantileCarry: number,
  target: number,
  risk: number,
  sgDelta: number,
  baselineClub: ClubId,
): string[] => {
  const quantileLabel = label === 'SAFE' ? 'p50' : label === 'NEUTRAL' ? 'p75' : 'p90';
  const carryString = `${quantileLabel} carry ${quantileCarry.toFixed(0)}m vs ${target.toFixed(0)}m need`;
  const riskString = `${Math.round(risk * 100)}% penalty risk`;
  const sgString = `${sgDelta >= 0 ? '+' : ''}${sgDelta.toFixed(2)} SG vs ${baselineClub}`;
  return [carryString, riskString, sgString];
};

type SuggestionInput = {
  label: Suggestion['label'];
  club: ClubId;
  carry: number;
  rollout: number;
  aim: Suggestion['aim'];
  risk: number;
  target: number;
  startExp: number;
  baselineClub: ClubId;
};

const createSuggestion = ({
  label,
  club,
  carry,
  rollout,
  aim,
  risk,
  target,
  startExp,
  baselineClub,
}: SuggestionInput): Suggestion => {
  const totalDistance = carry + rollout;
  const remainingFairway = computeRemainingDistance(target, totalDistance);
  const remainingRough = remainingFairway * 1.1;
  const penaltyExp = 2 + expectedStrokesForDistance(target);
  const fairwayExp = 1 + expectedStrokesForDistance(remainingFairway);
  const roughExp = 1 + expectedStrokesForDistance(remainingRough);

  const fairwayProb = clamp(aim.expectedFairwayProb, 0, 1);
  const penaltyProb = clamp(risk, 0, 1);
  const missProb = clamp(1 - penaltyProb - fairwayProb, 0, 1);
  const normalization = penaltyProb + fairwayProb + missProb;
  const penaltyWeight = normalization > ABS_TOLERANCE ? penaltyProb / normalization : penaltyProb;
  const fairwayWeight = normalization > ABS_TOLERANCE ? fairwayProb / normalization : fairwayProb;
  const missWeight = normalization > ABS_TOLERANCE ? missProb / normalization : missProb;

  const expected = penaltyWeight * penaltyExp + fairwayWeight * fairwayExp + missWeight * roughExp;
  const sgDelta = startExp - expected;

  const quantileLabel = label === 'SAFE' ? 'p50' : label === 'NEUTRAL' ? 'p75' : 'p90';
  const rationale = buildRationale(label, carry, target, penaltyProb, sgDelta, baselineClub);

  return {
    label,
    club,
    carry_m: carry,
    rollout_m: rollout,
    aim,
    expectedSGDelta: sgDelta,
    riskPenaltyProb: penaltyProb,
    rationale,
  };
};

export function computeSuggestions(
  bag: BagStats,
  dist: PlaysLike,
  haz: HazardContext,
  score: ScoreContext,
  opts?: { minSamples?: number; maxCandidates?: number },
): Suggestion[] {
  const minSamples = Math.max(1, Math.floor(opts?.minSamples ?? DEFAULT_MIN_SAMPLES));
  const maxCandidates = Math.max(1, Math.floor(opts?.maxCandidates ?? DEFAULT_MAX_CANDIDATES));

  const entries: Array<{ club: ClubId; stat: NonNullable<BagStats[ClubId]> }> = [];
  (Object.keys(bag) as ClubId[]).forEach((club) => {
    const stat = bag[club];
    if (!stat) {
      return;
    }
    if (!Number.isFinite(stat.samples) || stat.samples < minSamples) {
      return;
    }
    if (!Number.isFinite(stat.p50_m) || !Number.isFinite(stat.p75_m) || !Number.isFinite(stat.p90_m)) {
      return;
    }
    entries.push({ club, stat });
  });

  if (entries.length < 2) {
    return [];
  }

  const targetDistance = computeEffectiveDistance(dist);
  const frontCarryReq = toFinite(haz.frontCarryReq_m);
  const startExp = expectedStrokesForDistance(targetDistance);
  const thresholds = adjustRiskThresholds(score);

  const suggestionsByLabel: Partial<Record<Suggestion['label'], Suggestion>> = {};

  const baselineClub = entries
    .slice()
    .sort((a, b) => a.stat.p75_m - b.stat.p75_m)[Math.min(entries.length - 1, 1)].club;

  for (const { club, stat } of entries) {
    const sigma = LATERAL_SIGMA_M[club] ?? 8;
    const aim = computeAim(haz, sigma);
    const firmness = has(dist.fairwayFirmness) ? dist.fairwayFirmness : undefined;
    const rollout = computeRollout(club, firmness);

    for (const config of LABEL_CONFIGS) {
      const carry = stat[config.quantile];
      const riskBase = computeBaseRisk(club, carry, haz, aim, sigma, frontCarryReq);
      const risk = clamp(riskBase + config.riskAdjustment, 0, 1);
      if (risk > thresholds[config.label]) {
        continue;
      }
      if (frontCarryReq !== null && carry + ABS_TOLERANCE < frontCarryReq) {
        continue;
      }
      const suggestion = createSuggestion({
        label: config.label,
        club,
        carry,
        rollout,
        aim,
        risk,
        target: targetDistance,
        startExp,
        baselineClub,
      });
      const existing = suggestionsByLabel[config.label];
      if (!existing || suggestion.expectedSGDelta > existing.expectedSGDelta + ABS_TOLERANCE) {
        suggestionsByLabel[config.label] = suggestion;
      }
    }
  }

  const ordered = LABEL_CONFIGS.map((config) => suggestionsByLabel[config.label]).filter(
    (value): value is Suggestion => Boolean(value),
  );

  ordered.sort((a, b) => b.expectedSGDelta - a.expectedSGDelta);

  return ordered.slice(0, maxCandidates);
}

