export type FeatureFlagName = 'practiceGrowthV1' | 'roundFlowV2';

export type ResolvedFeatureFlag = {
  enabled: boolean;
  rolloutPct: number;
  source?: string;
};

export type FeatureFlagsPayload = {
  version: number;
  flags: Partial<Record<FeatureFlagName, ResolvedFeatureFlag>>;
};
