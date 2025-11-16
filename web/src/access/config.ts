import type { FeatureMatrix } from "./types";

export const FEATURE_MATRIX: FeatureMatrix = {
  free: [
    "range.targetBingo",
    "range.missions",
    "range.sessionHistory",
    "trip.share",
  ],
  pro: [
    "range.targetBingo",
    "range.missions",
    "range.sessionHistory",
    "range.ghostMatch",
    "range.smartBag",
    "range.cameraFitness",
    "trip.share",
    "trip.liveSSE",
    "profile.insights",
    "profile.smartBagSuggestions",
    "watch.hud",
  ],
};
