import type { CoachStyle } from "./style";

export type AdviceType = "club_adjustment" | "execution_cue" | "mental" | "risk";
export interface Advice {
  type: AdviceType;
  message: string;
  reason: string;
  severity: "info" | "warn" | "crit";
  data?: Record<string, unknown>;
}

export interface AdviceCtx {
  wind: { head_mps: number; cross_mps: number; gust_mps?: number };
  deltas: { temp_m: number; alt_m: number; head_m: number; slope_m: number };
  plan: {
    club: string;
    aimDeg: number;
    risk: number;
    distance_m: number;
    aimDirection?: "LEFT" | "RIGHT" | "STRAIGHT";
    reason?: string;
    hazardRightOfAim?: boolean;
    hazardLeftOfAim?: boolean;
  };
  dispersion?: { sigma_long_m: number; sigma_lat_m: number };
  round: {
    hole: number;
    lastErrors: { long_m: number; lat_m: number }[];
    streak: { bogey: number; birdie: number };
  };
  style: CoachStyle;
}

type SeverityRank = Record<Advice["severity"], number>;

const SEVERITY_ORDER: SeverityRank = {
  crit: 0,
  warn: 1,
  info: 2,
};

const clampNumber = (value: number): number =>
  Number.isFinite(value) ? Number(value) : 0;

const pushUnique = (list: Advice[], advice: Advice, seen: Map<string, Advice>): void => {
  const key = `${advice.type}:${advice.message}`;
  const existing = seen.get(key);
  if (!existing) {
    seen.set(key, advice);
    list.push(advice);
    return;
  }
  if (SEVERITY_ORDER[advice.severity] < SEVERITY_ORDER[existing.severity]) {
    existing.severity = advice.severity;
    existing.reason = advice.reason;
    existing.data = advice.data;
  }
};

const hasLargeMisses = (errors: AdviceCtx["round"]["lastErrors"]): boolean => {
  if (!errors.length) {
    return false;
  }
  const lastTwo = errors.slice(-2);
  if (lastTwo.length < 2) {
    return false;
  }
  return lastTwo.every((entry) => Math.hypot(entry.long_m ?? 0, entry.lat_m ?? 0) > 12);
};

export function advise(ctx: AdviceCtx): Advice[] {
  const advices: Advice[] = [];
  const seen = new Map<string, Advice>();
  const headWind = clampNumber(ctx.wind.head_mps);
  const headDelta = clampNumber(ctx.deltas.head_m);
  if (headWind >= 2.5 || headDelta <= -6) {
    pushUnique(advices, {
      type: "club_adjustment",
      message: "headwind_plus_club",
      severity: "warn",
      reason: `Motvind ${headWind.toFixed(1)} m/s eller plays-like ${headDelta.toFixed(1)} m`,
      data: { headWind, headDelta },
    }, seen);
    pushUnique(advices, {
      type: "execution_cue",
      message: "headwind_tempo",
      severity: "warn",
      reason: `Headwind mitigation: tempo control`,
      data: { headWind },
    }, seen);
  }

  const crossWind = clampNumber(ctx.wind.cross_mps);
  if (Math.abs(crossWind) >= 2) {
    const signedAim = clampNumber(ctx.plan.aimDeg);
    const direction: "left" | "right" = crossWind < 0 ? "left" : "right";
    const aimDirection = signedAim < 0 ? "L" : signedAim > 0 ? "R" : "M";
    pushUnique(advices, {
      type: "execution_cue",
      message: "crosswind_alignment",
      severity: "warn",
      reason: `Crosswind ${crossWind.toFixed(1)} m/s`,
      data: {
        windDirection: direction,
        aimDirection,
        aimDeg: Math.abs(signedAim),
        crossWind,
      },
    }, seen);
  }

  const sigmaLat = clampNumber(ctx.dispersion?.sigma_lat_m ?? 0);
  const sigmaLong = clampNumber(ctx.dispersion?.sigma_long_m ?? 0);
  if (sigmaLat > 9 || sigmaLong > 12) {
    pushUnique(advices, {
      type: "risk",
      message: "dispersion_high",
      severity: "warn",
      reason: `Dispersion σlat ${sigmaLat.toFixed(1)} / σlong ${sigmaLong.toFixed(1)}`,
      data: { sigmaLat, sigmaLong },
    }, seen);
  }

  const bogeyStreak = clampNumber(ctx.round.streak?.bogey ?? 0);
  const largeMisses = hasLargeMisses(ctx.round.lastErrors ?? []);
  if (bogeyStreak >= 2 || largeMisses) {
    pushUnique(advices, {
      type: "mental",
      message: "mental_reset",
      severity: bogeyStreak >= 3 ? "crit" : "warn",
      reason: bogeyStreak >= 2 ? `Bogeystreak ${bogeyStreak}` : "Recent misses >12 m",
      data: { bogeyStreak, largeMisses },
    }, seen);
  }

  const hazardRight = ctx.plan.hazardRightOfAim === true;
  if (ctx.plan.risk > 0.4 && hazardRight) {
    pushUnique(advices, {
      type: "risk",
      message: "bail_out_left",
      severity: ctx.plan.risk > 0.55 ? "crit" : "warn",
      reason: `Risk ${Math.round(ctx.plan.risk * 100)}% med hazard höger`,
      data: { risk: ctx.plan.risk },
    }, seen);
  }

  advices.sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) {
      return severityDiff;
    }
    return a.type.localeCompare(b.type);
  });

  return advices.slice(0, 3);
}
