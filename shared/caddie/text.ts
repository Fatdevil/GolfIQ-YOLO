import { defaultCoachStyle, type CoachStyle } from "./style";
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

type LanguageDictionary = {
  aimVerb: string;
  aimVerbCapitalized: string;
  aimDirectionLong: Record<ShotPlan["aimDirection"], string>;
  aimDirectionShort: Record<Exclude<ShotPlan["aimDirection"], "STRAIGHT">, string>;
  aimStraightShort: string;
  toLanding(distance: number): string;
  landingShort(distance: number): string;
  riskWord: string;
  riskApprox: string;
  windWord: string;
  windDirections: {
    leftToRight: string;
    rightToLeft: string;
    headwind: string;
    tailwind: string;
    calm: string;
  };
  driftWord: string;
  tuningLine: string;
  detailIntro(modeLabel: string, club: string, distance: number): string;
  detailAimLine(aimValue: string, aimDirection: string): string;
  detailRiskLine(riskPercent: number): string;
  pep: {
    intro: string;
    action(club: string, distance: number): string;
    aim(aimValue: string, aimDirection: string): string;
    risk(riskPercent: number): string;
    emoji: string;
    tokens: string[];
  };
};

const LANGUAGE_MAP: Record<CoachStyle["language"], LanguageDictionary> = {
  sv: {
    aimVerb: "sikta",
    aimVerbCapitalized: "Sikta",
    aimDirectionLong: {
      LEFT: "vänster",
      RIGHT: "höger",
      STRAIGHT: "rakt fram",
    },
    aimDirectionShort: {
      LEFT: "L",
      RIGHT: "R",
    },
    aimStraightShort: "rakt",
    toLanding: (distance) => `till landningszon ${distance} m`,
    landingShort: (distance) => `${distance} m`,
    riskWord: "Risk",
    riskApprox: "Risk≈",
    windWord: "Vind",
    windDirections: {
      leftToRight: "vänster→höger",
      rightToLeft: "höger→vänster",
      headwind: "motvind",
      tailwind: "medvind",
      calm: "ingen sidvind",
    },
    driftWord: "Drift≈",
    tuningLine: "Tuning aktiv – personlig dispersion används.",
    detailIntro: (modeLabel, club, distance) => `${modeLabel}: ${club} mot ${distance} m landning.`,
    detailAimLine: (aimValue, aimDirection) => `Sikta ${aimValue}° ${aimDirection}`,
    detailRiskLine: (riskPercent) => `Risk≈${riskPercent}%`,
    pep: {
      intro: "Nu kör vi!",
      action: (club, distance) => `Ta ${club} för ${distance} m carry`,
      aim: (aimValue, aimDirection) => `Sikta ${aimValue}° ${aimDirection}`,
      risk: (riskPercent) => `Risk på ${riskPercent}% – du fixar det!`,
      emoji: "🔥⛳",
      tokens: ["Nu kör vi", "du fixar det"],
    },
  },
  en: {
    aimVerb: "aim",
    aimVerbCapitalized: "Aim",
    aimDirectionLong: {
      LEFT: "left",
      RIGHT: "right",
      STRAIGHT: "straight ahead",
    },
    aimDirectionShort: {
      LEFT: "L",
      RIGHT: "R",
    },
    aimStraightShort: "straight",
    toLanding: (distance) => `to landing zone ${distance} m`,
    landingShort: (distance) => `${distance} m`,
    riskWord: "Risk",
    riskApprox: "Risk≈",
    windWord: "Wind",
    windDirections: {
      leftToRight: "left→right",
      rightToLeft: "right→left",
      headwind: "headwind",
      tailwind: "tailwind",
      calm: "calm",
    },
    driftWord: "Drift≈",
    tuningLine: "Tuning active – personal dispersion applied.",
    detailIntro: (modeLabel, club, distance) => `${modeLabel}: ${club} to ${distance} m landing.`,
    detailAimLine: (aimValue, aimDirection) => `Aim ${aimValue}° ${aimDirection}`,
    detailRiskLine: (riskPercent) => `Risk≈${riskPercent}%`,
    pep: {
      intro: "Let's go!",
      action: (club, distance) => `Grab ${club} for ${distance} m carry`,
      aim: (aimValue, aimDirection) => `Aim ${aimValue}° ${aimDirection}`,
      risk: (riskPercent) => `Risk at ${riskPercent}% — you've got this!`,
      emoji: "🔥⛳",
      tokens: ["Let's go", "you've got this"],
    },
  },
};

const formatAimValue = (plan: ShotPlan): string => {
  if (plan.aimDirection === "STRAIGHT") {
    return "0.0";
  }
  return plan.aimDeg.toFixed(1);
};

const buildWindLine = (
  plan: ShotPlan,
  ctx: CaddieTextContext | null | undefined,
  dictionary: LanguageDictionary,
): string => {
  const windCross = Number.isFinite(ctx?.wind?.cross_mps ?? NaN)
    ? Number(ctx?.wind?.cross_mps)
    : plan.crosswind_mps;
  const windHead = Number.isFinite(ctx?.wind?.head_mps ?? NaN)
    ? Number(ctx?.wind?.head_mps)
    : plan.headwind_mps;
  let direction: keyof LanguageDictionary["windDirections"] = "calm";
  if (windCross > 0.1) {
    direction = "leftToRight";
  } else if (windCross < -0.1) {
    direction = "rightToLeft";
  } else if (windHead > 0.1) {
    direction = "tailwind";
  } else if (windHead < -0.1) {
    direction = "headwind";
  }
  const windMagnitude = Math.max(Math.abs(windCross), Math.abs(windHead));
  const driftText =
    Math.abs(plan.windDrift_m) > 0.1 ? ` ${dictionary.driftWord}${plan.windDrift_m.toFixed(1)} m.` : "";
  return `${dictionary.windWord} ${windMagnitude.toFixed(1)} m/s ${dictionary.windDirections[direction]}.${driftText}`;
};

export function caddieTipToText(
  plan: ShotPlan,
  ctx?: CaddieTextContext | null,
  style: CoachStyle = defaultCoachStyle,
): string[] {
  const resolvedStyle: CoachStyle = {
    ...defaultCoachStyle,
    ...style,
    emoji: style.emoji ?? defaultCoachStyle.emoji,
  };
  const dictionary = LANGUAGE_MAP[resolvedStyle.language] ?? LANGUAGE_MAP.sv;
  const mode = ctx?.mode ?? plan.mode;
  const modeLabel = MODE_LABEL[mode] ?? MODE_LABEL.normal;
  const distance = Math.round(plan.landing.distance_m);
  const aimValue = formatAimValue(plan);
  const aimDirectionLong = dictionary.aimDirectionLong[plan.aimDirection];
  const aimDirectionShort =
    plan.aimDirection === "STRAIGHT"
      ? dictionary.aimStraightShort
      : dictionary.aimDirectionShort[plan.aimDirection];
  const riskPercent = Math.round(plan.risk * 100);
  const windLine = buildWindLine(plan, ctx, dictionary);
  const includeEmoji = resolvedStyle.format === "text" && !!resolvedStyle.emoji;

  if (resolvedStyle.verbosity === "short") {
    if (resolvedStyle.tone === "pep") {
      const pepLineBase = `${dictionary.pep.intro} ${dictionary.pep.risk(riskPercent)}`;
      const pepLine = includeEmoji
        ? `${pepLineBase} ${dictionary.pep.emoji}`.trim()
        : pepLineBase;
      const conciseLine = `${plan.club}, ${dictionary.landingShort(distance)}, ${dictionary.aimVerb} ${aimValue}° ${aimDirectionShort}. ${dictionary.riskWord} ${riskPercent}%.`;
      return [`${pepLine} ${conciseLine}`.trim()];
    }
    const conciseLine = `${plan.club}, ${dictionary.landingShort(distance)}, ${dictionary.aimVerb} ${aimValue}° ${aimDirectionShort}. ${dictionary.riskWord} ${riskPercent}%.`;
    return [conciseLine];
  }

  if (resolvedStyle.verbosity === "detailed") {
    if (resolvedStyle.tone === "pep") {
      const pepLines = [
        includeEmoji ? `${dictionary.pep.intro} ${dictionary.pep.emoji}`.trim() : dictionary.pep.intro,
        `${dictionary.pep.action(plan.club, distance)}.`,
        `${dictionary.pep.aim(aimValue, aimDirectionLong)}. ${dictionary.pep.risk(riskPercent)}`,
        windLine,
      ];
      if (plan.tuningActive || ctx?.tuningActive) {
        pepLines.push(dictionary.tuningLine);
      }
      if (plan.reason) {
        pepLines.push(plan.reason);
      }
      return pepLines;
    }
    const detailedLines = [
      dictionary.detailIntro(modeLabel, plan.club, distance),
      `${dictionary.detailAimLine(aimValue, aimDirectionLong)}. ${dictionary.detailRiskLine(riskPercent)}.`,
      windLine,
    ];
    if (plan.tuningActive || ctx?.tuningActive) {
      detailedLines.push(dictionary.tuningLine);
    }
    if (plan.reason) {
      detailedLines.push(plan.reason);
    }
    return detailedLines;
  }

  if (resolvedStyle.tone === "pep") {
    const pepLines = [
      `${modeLabel}: ${dictionary.pep.action(plan.club, distance)}.`,
      `${dictionary.pep.aim(aimValue, aimDirectionLong)}. ${dictionary.pep.risk(riskPercent)}`,
      windLine,
    ];
    if (includeEmoji) {
      pepLines[0] = `${pepLines[0]} ${dictionary.pep.emoji}`.trim();
    }
    if (plan.tuningActive || ctx?.tuningActive) {
      pepLines.push(dictionary.tuningLine);
    }
    if (plan.reason) {
      pepLines.push(plan.reason);
    }
    return pepLines;
  }

  const summary = `${
    resolvedStyle.tone === "concise" ? plan.club : `${modeLabel}: ${plan.club}`
  } ${dictionary.toLanding(distance)}, ${dictionary.aimVerbCapitalized} ${aimValue}° ${aimDirectionLong}, ${dictionary.riskApprox}${riskPercent}%.`;

  const lines = [summary, windLine];
  if (plan.tuningActive || ctx?.tuningActive) {
    lines.push(dictionary.tuningLine);
  }
  if (plan.reason) {
    lines.push(plan.reason);
  }
  return lines;
}
