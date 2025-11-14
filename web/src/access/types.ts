export type PlanName = "free" | "pro";

export type FeatureId =
  | "range.targetBingo"
  | "range.ghostMatch"
  | "range.gapping"
  | "caddie.advancedHints"
  | "profile.advancedStats";

export type AccessPlan = {
  plan: PlanName;
};

export type FeatureMatrix = Record<PlanName, FeatureId[]>;
