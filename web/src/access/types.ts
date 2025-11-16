export type PlanName = "free" | "pro";

export type FeatureId =
  | "range.targetBingo"
  | "range.missions"
  | "range.sessionHistory"
  | "range.ghostMatch"
  | "range.smartBag"
  | "range.cameraFitness"
  | "trip.share"
  | "trip.liveSSE"
  | "profile.insights"
  | "profile.smartBagSuggestions"
  | "watch.hud";

export type AccessPlan = {
  plan: PlanName;
};

export type FeatureMatrix = Record<PlanName, FeatureId[]>;
