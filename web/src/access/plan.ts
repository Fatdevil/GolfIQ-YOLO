export type PlanId = "FREE" | "PRO";

export interface PlanDefinition {
  id: PlanId;
  label: string;
  description?: string;
}

export type FeatureKey =
  | "CADDIE_INSIGHTS"
  | "SG_PREVIEW"
  | "COACH_PLAN"
  | "COACH_SHARE"
  | "RANGE_BINGO"
  | "RANGE_MISSIONS"
  | "RANGE_GHOSTMATCH"
  | "HUD_PREVIEW"
  | "KINEMATIC_SEQUENCE"
  | "PLAYER_ANALYTICS"
  | "PLAYER_PROFILE"
  | "SESSION_TIMELINE";

export type PlanFeatureMatrix = Record<PlanId, Record<FeatureKey, boolean>>;

export const DEFAULT_PLAN: PlanId = "FREE";

export const PLAN_FEATURES: PlanFeatureMatrix = {
  FREE: {
    CADDIE_INSIGHTS: false,
    SG_PREVIEW: false,
    COACH_PLAN: false,
    COACH_SHARE: false,
    RANGE_BINGO: true,
    RANGE_MISSIONS: false,
    RANGE_GHOSTMATCH: false,
    HUD_PREVIEW: false,
    KINEMATIC_SEQUENCE: false,
    PLAYER_ANALYTICS: false,
    PLAYER_PROFILE: false,
    SESSION_TIMELINE: false,
  },
  PRO: {
    CADDIE_INSIGHTS: true,
    SG_PREVIEW: true,
    COACH_PLAN: true,
    COACH_SHARE: true,
    RANGE_BINGO: true,
    RANGE_MISSIONS: true,
    RANGE_GHOSTMATCH: true,
    HUD_PREVIEW: true,
    KINEMATIC_SEQUENCE: true,
    PLAYER_ANALYTICS: true,
    PLAYER_PROFILE: true,
    SESSION_TIMELINE: true,
  },
};

export function isFeatureEnabled(plan: PlanId, feature: FeatureKey): boolean {
  return PLAN_FEATURES[plan][feature];
}
