export type PlanId = "FREE" | "PRO";

export interface PlanDefinition {
  id: PlanId;
  label: string;
  description?: string;
}

export type FeatureKey =
  | "CADDIE_INSIGHTS"
  | "SG_PREVIEW"
  | "RANGE_BINGO"
  | "RANGE_GHOSTMATCH"
  | "HUD_PREVIEW";

export type PlanFeatureMatrix = Record<PlanId, Record<FeatureKey, boolean>>;

export const DEFAULT_PLAN: PlanId = "FREE";

export const PLAN_FEATURES: PlanFeatureMatrix = {
  FREE: {
    CADDIE_INSIGHTS: false,
    SG_PREVIEW: false,
    RANGE_BINGO: true,
    RANGE_GHOSTMATCH: false,
    HUD_PREVIEW: false,
  },
  PRO: {
    CADDIE_INSIGHTS: true,
    SG_PREVIEW: true,
    RANGE_BINGO: true,
    RANGE_GHOSTMATCH: true,
    HUD_PREVIEW: true,
  },
};

export function isFeatureEnabled(plan: PlanId, feature: FeatureKey): boolean {
  return PLAN_FEATURES[plan][feature];
}
