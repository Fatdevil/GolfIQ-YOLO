import type { RoundSgPreview, SgCategory } from "@/api/sgPreview";
import type { CaddieInsights, CaddieClubStats } from "@/api/caddieInsights";

export const SG_CATEGORY_ORDER: SgCategory[] = ["TEE", "APPROACH", "SHORT", "PUTT"];

export function sgCategoryKeyToLabel(cat: SgCategory): "tee" | "approach" | "short" | "putt" {
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

export type CoachSuggestion = {
  type: "sg" | "caddie";
  severity: "high" | "medium";
  categoryKey?: "tee" | "approach" | "short" | "putt";
  club?: string;
  messageKey: string;
};

export function buildCoachSuggestions(
  sg: RoundSgPreview | null,
  caddie: CaddieInsights | null,
): CoachSuggestion[] {
  const suggestions: CoachSuggestion[] = [];

  if (sg && Object.keys(sg.sg_by_cat).length > 0) {
    let worstCat: SgCategory | null = null;
    let worstValue = Infinity;

    for (const cat of SG_CATEGORY_ORDER) {
      const value = sg.sg_by_cat[cat] ?? 0;
      if (value < worstValue) {
        worstValue = value;
        worstCat = cat;
      }
    }

    if (worstCat !== null) {
      const categoryKey = sgCategoryKeyToLabel(worstCat);
      const severity: "high" | "medium" = worstValue < -1.0 ? "high" : "medium";

      suggestions.push({
        type: "sg",
        severity,
        categoryKey,
        messageKey:
          severity === "high" ? "coach.sg.biggestLeak.high" : "coach.sg.biggestLeak.medium",
      });
    }
  }

  if (caddie && caddie.per_club && caddie.per_club.length > 0) {
    let worstClub: CaddieClubStats | null = null;
    let worstAcceptRate = 1.1;

    for (const stat of caddie.per_club) {
      if (!stat.shown) continue;
      const r = stat.accepted / stat.shown;
      if (r < worstAcceptRate) {
        worstAcceptRate = r;
        worstClub = stat;
      }
    }

    if (worstClub && worstClub.shown >= 5 && worstAcceptRate < 0.7) {
      suggestions.push({
        type: "caddie",
        severity: "medium",
        club: worstClub.club,
        messageKey: "coach.caddie.followAdviceClub",
      });
    }
  }

  return suggestions;
}
