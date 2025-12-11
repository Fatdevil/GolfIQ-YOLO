export type ExperimentKey = 'weekly_goal_nudge';

type ExperimentConfig = {
  rollout: number;
  bucketCount?: number;
};

const EXPERIMENT_CONFIG: Record<ExperimentKey, ExperimentConfig> = {
  weekly_goal_nudge: { rollout: 50, bucketCount: 100 },
};

function hashUserId(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

export function getExperimentBucket(
  key: ExperimentKey,
  userId: string | number,
): number {
  const config = EXPERIMENT_CONFIG[key];
  const bucketCount = Math.max(1, config.bucketCount ?? 100);
  const hash = hashUserId(`${key}:${String(userId ?? '')}`);
  return Math.abs(hash) % bucketCount;
}

export function getExperimentVariant(
  key: ExperimentKey,
  userId: string | number,
): 'control' | 'treatment' {
  const config = EXPERIMENT_CONFIG[key];
  const bucket = getExperimentBucket(key, userId);
  const rollout = Math.max(0, Math.min(config.rollout, config.bucketCount ?? 100));
  return bucket < rollout ? 'treatment' : 'control';
}

export function isInExperiment(key: ExperimentKey, userId: string | number): boolean {
  return getExperimentVariant(key, userId) === 'treatment';
}
