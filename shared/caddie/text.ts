import { defaultCoachStyle, type CoachStyle } from "./style";
import type { Advice } from "./advice";
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
      const conciseLine = `${plan.club}, ${dictionary.landingShort(distance)}, ${dictionary.aimVerb} ${aimValue}° ${aimDirectionShort}. ${dictionary.riskWord} ${riskPercent}%.`;
      const pepLineBase = `${dictionary.pep.intro} ${dictionary.pep.risk(riskPercent)}`;
      const pepLine = includeEmoji
        ? `${pepLineBase} ${dictionary.pep.emoji}`.trim()
        : pepLineBase;
      return [`${conciseLine} ${pepLine}`.trim()];
    }
    const conciseLine = `${plan.club}, ${dictionary.landingShort(distance)}, ${dictionary.aimVerb} ${aimValue}° ${aimDirectionShort}. ${dictionary.riskWord} ${riskPercent}%.`;
    return [conciseLine];
  }

  if (resolvedStyle.verbosity === "detailed") {
    if (resolvedStyle.tone === "pep") {
      const pepLines = [
        `${modeLabel}: ${dictionary.pep.action(plan.club, distance)}.`,
        `${dictionary.pep.aim(aimValue, aimDirectionLong)}. ${dictionary.pep.risk(riskPercent)}`,
        windLine,
      ];
      if (plan.tuningActive || ctx?.tuningActive) {
        pepLines.push(dictionary.tuningLine);
      }
      if (plan.reason) {
        pepLines.push(plan.reason);
      }
      const pepOutro = includeEmoji
        ? `${dictionary.pep.intro} ${dictionary.pep.emoji}`.trim()
        : dictionary.pep.intro;
      pepLines.push(pepOutro);
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

const ADVICE_KEYS = [
  "headwind_plus_club",
  "headwind_tempo",
  "crosswind_alignment",
  "dispersion_high",
  "mental_reset",
  "bail_out_left",
] as const;

type AdviceMessageKey = (typeof ADVICE_KEYS)[number];

type AdviceMessageTemplate = {
  base: (advice: Advice, pack: AdviceLanguagePack) => string;
  detail?: (advice: Advice, pack: AdviceLanguagePack) => string | null;
  pep?: (advice: Advice, pack: AdviceLanguagePack) => string | null;
};

type AdviceLanguagePack = {
  severityBadge: Record<Advice["severity"], string>;
  detailIntro: string;
  neutralPep: string;
  templates: Record<AdviceMessageKey, AdviceMessageTemplate>;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const formatDetailParts = (intro: string, parts: string[]): string | null => {
  const filtered = parts.filter((part) => part.trim().length > 0);
  if (!filtered.length) {
    return null;
  }
  return `${intro} ${filtered.join(" – ")}`;
};

const ADVICE_LANGUAGE: Record<CoachStyle["language"], AdviceLanguagePack> = {
  sv: {
    severityBadge: { crit: "⚠️", warn: "•", info: "•" },
    detailIntro: "pga",
    neutralPep: "Fokus genom hela slaget.",
    templates: {
      headwind_plus_club: {
        base: () => "+1 klubb (motvind)",
        detail: (advice, pack) => {
          const headWind = toNumber(advice.data?.headWind);
          const headDelta = toNumber(advice.data?.headDelta);
          const parts: string[] = [];
          if (headWind !== null && headWind >= 0.5) {
            parts.push(`vind ${headWind.toFixed(1)} m/s rakt emot`);
          }
          if (headDelta !== null && headDelta <= -0.5) {
            parts.push(`plays-like ${headDelta.toFixed(1)} m kortare`);
          }
          return formatDetailParts(pack.detailIntro, parts);
        },
        pep: () => "Håll nedsvingen lugn och släpp loss genom bollen.",
      },
      headwind_tempo: {
        base: () => "80% tempo för lägre spinn",
        detail: (advice, pack) => {
          const headWind = toNumber(advice.data?.headWind);
          return headWind !== null
            ? formatDetailParts(pack.detailIntro, [`vind ${headWind.toFixed(1)} m/s lyfter bollen`])
            : null;
        },
        pep: () => "Stå stadigt, leverera strike.",
      },
      crosswind_alignment: {
        base: (advice) => {
          const aimDeg = toNumber(advice.data?.aimDeg);
          const aimLabel = typeof advice.data?.aimDirection === "string" ? advice.data.aimDirection : "M";
          const aimText = aimDeg !== null && aimDeg > 0 ? `${aimDeg.toFixed(1)}°` : "0.0°";
          const dir = aimLabel === "L" ? "L" : aimLabel === "R" ? "R" : "mitten";
          return `Sikta ${aimText} ${dir}, håll linjen`;
        },
        detail: (advice, pack) => {
          const crossWind = toNumber(advice.data?.crossWind);
          const windDir = advice.data?.windDirection === "left" ? "från höger" : "från vänster";
          const detail =
            crossWind !== null ? `vind ${crossWind.toFixed(1)} m/s ${windDir}` : `vind ${windDir}`;
          return formatDetailParts(pack.detailIntro, [detail, "säkrare sida mot hazard"]);
        },
        pep: () => "Commit och låt vinden jobba åt dig.",
      },
      dispersion_high: {
        base: () => "Hög spridning — välj större safe-yta",
        detail: (advice, pack) => {
          const sigmaLat = toNumber(advice.data?.sigmaLat);
          const sigmaLong = toNumber(advice.data?.sigmaLong);
          const parts: string[] = [];
          if (sigmaLat !== null) {
            parts.push(`σ lat ${sigmaLat.toFixed(1)} m`);
          }
          if (sigmaLong !== null) {
            parts.push(`σ long ${sigmaLong.toFixed(1)} m`);
          }
          return formatDetailParts(pack.detailIntro, parts);
        },
        pep: () => "Smart linje ger dig grön chans.",
      },
      mental_reset: {
        base: () => "Reset: andas 4–6, rutin, safe target",
        detail: (advice, pack) => {
          const bogey = toNumber(advice.data?.bogeyStreak);
          const misses =
            advice.data?.badShotStreak === true || advice.data?.largeMisses === true
              ? "två missar i rad"
              : "";
          const parts: string[] = [];
          if (bogey !== null && bogey >= 2) {
            parts.push(`${bogey} bogeys i rad`);
          }
          if (misses) {
            parts.push(misses);
          }
          return formatDetailParts(pack.detailIntro, parts);
        },
        pep: () => "Släpp det som varit – nytt tempo nu.",
      },
      bail_out_left: {
        base: () => "Bail-out vänster minskar bogeyrisk",
        detail: (advice, pack) => {
          const risk = toNumber(advice.data?.risk);
          return risk !== null
            ? formatDetailParts(pack.detailIntro, [`risk ${Math.round(risk * 100)}% mot hazard`])
            : null;
        },
        pep: () => "Ta smarta poäng och attackera nästa slag.",
      },
    },
  },
  en: {
    severityBadge: { crit: "⚠️", warn: "•", info: "•" },
    detailIntro: "because",
    neutralPep: "Stay locked in.",
    templates: {
      headwind_plus_club: {
        base: () => "+1 club (headwind)",
        detail: (advice, pack) => {
          const headWind = toNumber(advice.data?.headWind);
          const headDelta = toNumber(advice.data?.headDelta);
          const parts: string[] = [];
          if (headWind !== null && headWind >= 0.5) {
            parts.push(`wind ${headWind.toFixed(1)} m/s straight in`);
          }
          if (headDelta !== null && headDelta <= -0.5) {
            parts.push(`plays-like ${headDelta.toFixed(1)} m shorter`);
          }
          return formatDetailParts(pack.detailIntro, parts);
        },
        pep: () => "Smooth down, finish strong.",
      },
      headwind_tempo: {
        base: () => "80% tempo to kill spin",
        detail: (advice, pack) => {
          const headWind = toNumber(advice.data?.headWind);
          return headWind !== null
            ? formatDetailParts(pack.detailIntro, [`wind ${headWind.toFixed(1)} m/s inflates flight`])
            : null;
        },
        pep: () => "Own the strike.",
      },
      crosswind_alignment: {
        base: (advice) => {
          const aimDeg = toNumber(advice.data?.aimDeg);
          const aimLabel = typeof advice.data?.aimDirection === "string" ? advice.data.aimDirection : "M";
          const aimText = aimDeg !== null && aimDeg > 0 ? `${aimDeg.toFixed(1)}°` : "0.0°";
          const dir = aimLabel === "L" ? "L" : aimLabel === "R" ? "R" : "center";
          return `Aim ${aimText} ${dir}, stay committed`;
        },
        detail: (advice, pack) => {
          const crossWind = toNumber(advice.data?.crossWind);
          const windDir = advice.data?.windDirection === "left" ? "pushing right" : "pushing left";
          const detail =
            crossWind !== null ? `wind ${crossWind.toFixed(1)} m/s ${windDir}` : `wind ${windDir}`;
          return formatDetailParts(pack.detailIntro, [detail, "hazard sits downwind"]);
        },
        pep: () => "Trust it – let the wind move it.",
      },
      dispersion_high: {
        base: () => "Wide dispersion — choose bigger safe zone",
        detail: (advice, pack) => {
          const sigmaLat = toNumber(advice.data?.sigmaLat);
          const sigmaLong = toNumber(advice.data?.sigmaLong);
          const parts: string[] = [];
          if (sigmaLat !== null) {
            parts.push(`σ lat ${sigmaLat.toFixed(1)} m`);
          }
          if (sigmaLong !== null) {
            parts.push(`σ long ${sigmaLong.toFixed(1)} m`);
          }
          return formatDetailParts(pack.detailIntro, parts);
        },
        pep: () => "Smart target keeps birdie alive.",
      },
      mental_reset: {
        base: () => "Reset: breathe 4–6, routine, safe target",
        detail: (advice, pack) => {
          const bogey = toNumber(advice.data?.bogeyStreak);
          const misses =
            advice.data?.badShotStreak === true || advice.data?.largeMisses === true
              ? "two misses in a row"
              : "";
          const parts: string[] = [];
          if (bogey !== null && bogey >= 2) {
            parts.push(`${bogey} bogeys running`);
          }
          if (misses) {
            parts.push(misses);
          }
          return formatDetailParts(pack.detailIntro, parts);
        },
        pep: () => "Shake it off – new swing now.",
      },
      bail_out_left: {
        base: () => "Bail left cuts bogey risk",
        detail: (advice, pack) => {
          const risk = toNumber(advice.data?.risk);
          return risk !== null
            ? formatDetailParts(pack.detailIntro, [`risk ${Math.round(risk * 100)}% into hazard`])
            : null;
        },
        pep: () => "Bank the smart play, attack next.",
      },
    },
  },
};

const toAdviceKey = (value: string): AdviceMessageKey | null => {
  return (ADVICE_KEYS as readonly string[]).includes(value as AdviceMessageKey)
    ? (value as AdviceMessageKey)
    : null;
};

export function advicesToText(adviceList: Advice[], style: CoachStyle, lang: "sv" | "en"): string[] {
  const resolvedLang = (lang ?? style.language ?? "sv") as "sv" | "en";
  const pack = ADVICE_LANGUAGE[resolvedLang] ?? ADVICE_LANGUAGE.sv;
  const includeDetail = style.verbosity === "detailed";
  const includePep = style.tone === "pep";

  return adviceList.slice(0, 3).map((advice) => {
    const key = toAdviceKey(advice.message);
    const template = key ? pack.templates[key] : null;
    const base = template ? template.base(advice, pack) : advice.message;
    const parts = [base];
    if (includeDetail && template?.detail) {
      const detail = template.detail(advice, pack);
      if (detail) {
        parts.push(detail);
      }
    }
    if (includePep) {
      const pep = template?.pep?.(advice, pack) ?? pack.neutralPep;
      if (pep) {
        parts.push(pep);
      }
    }
    const text = parts.join(" ").replace(/\s+/g, " ").trim();
    const badge = pack.severityBadge[advice.severity] ?? "";
    return badge ? `${badge} ${text}`.trim() : text;
  });
}
