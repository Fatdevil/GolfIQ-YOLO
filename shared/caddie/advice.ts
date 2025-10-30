import type { PlayerProfile } from "../coach/profile";
import { getCoachProvider } from "../coach/provider";
import { pickAdviceStyle, pickRisk } from "../coach/policy";
import type { CoachPersona, TrainingFocus } from "../training/types";
import { getCaddieRc } from "./rc";
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
    lastErrors: {
      long_m: number;
      lat_m: number;
      quality?: "good" | "ok" | "neutral" | "bad" | "penalty";
    }[];
    streak: { bogey: number; birdie: number };
  };
  style: CoachStyle;
  focus?: TrainingFocus;
  persona?: CoachPersona;
  coachProfile?: PlayerProfile | null;
  learningActive?: boolean;
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

const isBadShot = (
  entry: AdviceCtx["round"]["lastErrors"][number],
  vectorThreshold = 12,
): boolean => {
  if (!entry) {
    return false;
  }
  if (typeof entry.quality === "string") {
    const rating = entry.quality.toLowerCase();
    if (rating === "bad" || rating === "penalty") {
      return true;
    }
  }
  const longMiss = clampNumber(entry.long_m ?? 0);
  const latMiss = clampNumber(entry.lat_m ?? 0);
  return Math.hypot(longMiss, latMiss) > vectorThreshold;
};

const hasBadShotStreak = (
  errors: AdviceCtx["round"]["lastErrors"],
  streakLength = 2,
): boolean => {
  if (!errors.length || streakLength <= 1) {
    return false;
  }
  const recent = errors.slice(-streakLength);
  if (recent.length < streakLength) {
    return false;
  }
  return recent.every((entry) => isBadShot(entry));
};

const computeHazardDensity = (ctx: AdviceCtx): number => {
  let hazards = 0;
  if (ctx.plan.hazardLeftOfAim) {
    hazards += 1;
  }
  if (ctx.plan.hazardRightOfAim) {
    hazards += 1;
  }
  return hazards > 0 ? hazards / 2 : 0;
};

const applyRiskOverride = (baseRisk: number, mode: 'safe' | 'normal' | 'aggressive'): number => {
  const clamped = clampNumber(baseRisk);
  if (mode === 'safe') {
    return Math.min(clamped, 0.35);
  }
  if (mode === 'aggressive') {
    return Math.max(clamped, 0.6);
  }
  return clamped;
};

export function advise(inputCtx: AdviceCtx): Advice[] {
  const rc = getCaddieRc();
  const profile = inputCtx.coachProfile ?? null;
  const gate = Boolean(rc.coach.learningEnabled && inputCtx.learningActive && profile);
  let ctx = inputCtx;
  if (gate && profile) {
    const style = pickAdviceStyle(profile);
    const riskMode = pickRisk(profile, {
      hazardDensity: computeHazardDensity(inputCtx),
      planRisk: inputCtx.plan.risk,
    });
    ctx = {
      ...inputCtx,
      style: {
        ...inputCtx.style,
        tone: style.tone,
        verbosity: style.verbosity,
      },
      plan: {
        ...inputCtx.plan,
        risk: applyRiskOverride(inputCtx.plan.risk, riskMode),
      },
    };
  }
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
  const badShotStreak = hasBadShotStreak(ctx.round.lastErrors ?? []);
  if (bogeyStreak >= 2 || badShotStreak) {
    pushUnique(advices, {
      type: "mental",
      message: "mental_reset",
      severity: bogeyStreak >= 3 ? "crit" : "warn",
      reason: bogeyStreak >= 2 ? `Bogeystreak ${bogeyStreak}` : "Two misses in a row",
      data: { bogeyStreak, badShotStreak },
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

  const provider = getCoachProvider();
  try {
    const tips = provider.getPreShotAdvice({ ...ctx });
    if (Array.isArray(tips) && tips.length) {
      const normalized = tips
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0);
      if (normalized.length) {
        const limit = ctx.style.verbosity === "short" ? 1 : 2;
        normalized.slice(0, limit).forEach((tip) => {
          pushUnique(
            advices,
            {
              type: "mental",
              message: tip,
              severity: "info",
              reason: "coach_provider",
              data: {
                provider: ctx.persona?.id ?? "default",
                focus: ctx.focus,
              },
            },
            seen,
          );
        });
      }
    }
  } catch (error) {
    // ignore provider failures to keep tournament-safe
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
