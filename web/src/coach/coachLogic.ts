import type { RoundSgPreview, SgCategory } from "@/api/sgPreview";
import { pickMissionForCategory } from "@/range/missions";
import type { MissionId } from "@/range/missions";

export type CoachCategory = "tee" | "approach" | "short" | "putt";

export interface CoachRangeMission {
  type: "range";
  description: string;
  missionId?: MissionId;
  missionLabel?: string;
}

export interface CoachOnCourseMission {
  type: "on-course";
  description: string;
}

export interface CoachRecommendation {
  focusCategory: CoachCategory;
  reason: string;
  rangeMission?: CoachRangeMission;
  onCourseMission?: CoachOnCourseMission;
}

export type SgSummaryForRun = Pick<RoundSgPreview, "sg_by_cat" | "total_sg">;

export interface CoachInput {
  sgSummary: SgSummaryForRun;
}

const COACH_CATEGORY_LABEL: Record<CoachCategory, string> = {
  tee: "Tee shots",
  approach: "Approach shots",
  short: "Short game",
  putt: "Putting",
};

const RANGE_MISSION: Record<CoachCategory, string> = {
  tee: "On the range, hit 3 sets of 10 drives focusing on center-face contact.",
  approach:
    "On the range, alternate 10 shots each at 90 m and 120 m to tighten your dispersion.",
  short: "Hit 20 chip shots landing on a small target zone to control rollout.",
  putt: "Roll 20 putts from 2–3 m focusing on start line and speed control.",
};

const ON_COURSE_MISSION: Record<CoachCategory, string> = {
  tee: "Next round, choose a safer club off the tee on tight par 4s to keep the ball in play.",
  approach: "Play to the fat side of the green when you’re between clubs to avoid short-siding yourself.",
  short: "Give yourself an easy next putt: land chips past the fringe and avoid short-siding.",
  putt: "Prioritise speed over line on downhill putts and leave an uphill second putt.",
};

function sgToCoachCategory(cat: SgCategory): CoachCategory {
  switch (cat) {
    case "TEE":
      return "tee";
    case "APPROACH":
      return "approach";
    case "SHORT":
      return "short";
    case "PUTT":
    default:
      return "putt";
  }
}

function sortCategoriesByLeak(
  sg_by_cat: Partial<Record<SgCategory, number>>,
): [CoachCategory, number][] {
  const entries = Object.entries(sg_by_cat ?? {}) as [SgCategory, number][];
  const normalized: Array<[CoachCategory, number]> = entries.map(([cat, value]) => [
    sgToCoachCategory(cat),
    value,
  ]);
  return normalized.filter(([, value]) => Number.isFinite(value)).sort(([, a], [, b]) => a - b);
}

function formatLeak(value: number): string {
  const rounded = Math.abs(value);
  if (rounded >= 1) {
    return rounded.toFixed(1);
  }
  return (Math.round(rounded * 10) / 10).toFixed(1);
}

export function buildCoachRecommendations(input: CoachInput): CoachRecommendation[] {
  const { sgSummary } = input;
  const ordered = sortCategoriesByLeak(sgSummary?.sg_by_cat ?? {});

  if (!ordered.length) {
    return [];
  }

  const negative = ordered.filter(([, value]) => value < 0);
  const candidates = (negative.length > 0 ? negative : ordered).slice(0, 3);

  return candidates.map(([cat, value]) => {
    const reason = `Focus on ${COACH_CATEGORY_LABEL[cat]} — you lost ${formatLeak(value)} strokes vs the baseline.`;
    const mission = pickMissionForCategory(cat)[0];

    return {
      focusCategory: cat,
      reason,
      rangeMission: {
        type: "range",
        description: RANGE_MISSION[cat],
        missionId: mission?.id,
        missionLabel: mission?.label,
      },
      onCourseMission: {
        type: "on-course",
        description: ON_COURSE_MISSION[cat],
      },
    } satisfies CoachRecommendation;
  });
}
