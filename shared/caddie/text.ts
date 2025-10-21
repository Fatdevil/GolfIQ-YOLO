import type { RiskMode, ShotPlan } from "./strategy";

export interface CaddieTextContext {
  mode?: RiskMode;
  wind?: { cross_mps?: number; head_mps?: number };
  tuningActive?: boolean;
}

const MODE_LABEL: Record<RiskMode, string> = {
  safe: "SAFE",
  normal: "NORMAL",
  aggressive: "AGGRO",
};

const formatAimDirection = (direction: ShotPlan["aimDirection"]): string => {
  if (direction === "STRAIGHT") {
    return "STRAIGHT";
  }
  return direction;
};

const formatAimValue = (plan: ShotPlan): string => {
  if (plan.aimDirection === "STRAIGHT") {
    return "0.0";
  }
  return plan.aimDeg.toFixed(1);
};

export function caddieTipToText(plan: ShotPlan, ctx?: CaddieTextContext | null): string[] {
  const mode = ctx?.mode ?? plan.mode;
  const modeLabel = MODE_LABEL[mode] ?? MODE_LABEL.normal;
  const distance = Math.round(plan.landing.distance_m);
  const summary = `${modeLabel}: ${plan.club} till landningszon ${distance} m, sikta ${formatAimValue(plan)}° ${formatAimDirection(plan.aimDirection)}, risk≈${Math.round(plan.risk * 100)}%.`;

  const windCross = Number.isFinite(ctx?.wind?.cross_mps ?? NaN)
    ? Number(ctx?.wind?.cross_mps)
    : plan.crosswind_mps;
  const windHead = Number.isFinite(ctx?.wind?.head_mps ?? NaN)
    ? Number(ctx?.wind?.head_mps)
    : plan.headwind_mps;
  const windDirText = (() => {
    if (windCross > 0.1) {
      return "vänster→höger";
    }
    if (windCross < -0.1) {
      return "höger→vänster";
    }
    return windHead > 0.1 ? "medvind" : windHead < -0.1 ? "motvind" : "ingen sidvind";
  })();
  const windMagnitude = Math.abs(windCross) > Math.abs(windHead) ? Math.abs(windCross) : Math.abs(windHead);
  const windLine = `Vind ${windMagnitude.toFixed(1)} m/s ${windDirText}.${
    Math.abs(plan.windDrift_m) > 0.1 ? ` Drift≈${plan.windDrift_m.toFixed(1)} m.` : ""
  }`;

  const lines = [summary, windLine.trim()];
  if (plan.tuningActive || ctx?.tuningActive) {
    lines.push("Tuning aktiv – personlig dispersion används.");
  }
  if (plan.reason) {
    lines.push(plan.reason);
  }
  return lines;
}
