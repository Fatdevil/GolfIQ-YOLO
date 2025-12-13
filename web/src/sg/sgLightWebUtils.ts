import { useTranslation } from "react-i18next";

import {
  STROKES_GAINED_LIGHT_MIN_CONFIDENCE,
  type StrokesGainedLightCategory,
  type StrokesGainedLightSummary,
} from "@shared/stats/strokesGainedLight";

export function mapSgLightCategoryToFocusArea(category: StrokesGainedLightCategory): string {
  if (category === "tee") return "driving";
  if (category === "approach") return "approach";
  if (category === "short_game") return "short_game";
  if (category === "putting") return "putting";
  return category;
}

export function isValidSgLightSummary(summary?: StrokesGainedLightSummary | null): boolean {
  if (!summary || !summary.byCategory?.length) return false;
  return summary.byCategory.every((entry) => entry.confidence >= STROKES_GAINED_LIGHT_MIN_CONFIDENCE);
}

export function formatSgDelta(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const rounded = Number(value.toFixed(1));
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}`;
}

export function labelForSgLightCategory(
  category: StrokesGainedLightCategory,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const key = category === "tee" ? "sg_light.focus.off_the_tee" : `sg_light.focus.${category}`;
  return t(key);
}
