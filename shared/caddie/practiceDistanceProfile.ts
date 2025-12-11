export type PracticeDistanceSample = {
  clubId?: string | null;
  club?: string | null;
  avgCarryM?: number | null;
  sampleCount?: number | null;
  shotCount?: number | null;
  finishedAt?: string | Date | null;
};

export type PracticeDistanceProfileEntry = {
  avgCarryM: number;
  sampleCount: number;
  confidence: 'low' | 'high';
  lastRecordedAt?: Date;
};

export type PracticeDistanceProfile = Record<string, PracticeDistanceProfileEntry>;

const DAY_MS = 24 * 60 * 60 * 1000;

function coerceClubId(sample: PracticeDistanceSample): string | null {
  const id = sample.clubId ?? sample.club;
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function coerceSampleCount(sample: PracticeDistanceSample): number | null {
  const rawCount = sample.sampleCount ?? sample.shotCount;
  if (typeof rawCount !== 'number' || !Number.isFinite(rawCount)) return null;
  const rounded = Math.max(0, Math.round(rawCount));
  return rounded > 0 ? rounded : null;
}

function coerceAvgCarry(sample: PracticeDistanceSample): number | null {
  const { avgCarryM } = sample;
  if (typeof avgCarryM !== 'number' || !Number.isFinite(avgCarryM)) return null;
  return avgCarryM > 0 ? avgCarryM : null;
}

function coerceTimestamp(sample: PracticeDistanceSample): number | null {
  const raw = sample.finishedAt;
  if (!raw) return null;
  if (raw instanceof Date) {
    const ts = raw.getTime();
    return Number.isFinite(ts) ? ts : null;
  }
  if (typeof raw === 'string') {
    const ts = new Date(raw).getTime();
    return Number.isFinite(ts) ? ts : null;
  }
  return null;
}

export function buildPracticeDistanceProfile(
  samples: PracticeDistanceSample[] | null | undefined,
  options: {
    minSamplesForHighConfidence?: number;
    minSamplesToInclude?: number;
    maxAgeDays?: number;
    now?: Date;
  } = {},
): PracticeDistanceProfile {
  if (!Array.isArray(samples) || samples.length === 0) return {};

  const {
    minSamplesForHighConfidence = 8,
    minSamplesToInclude = 3,
    maxAgeDays,
    now = new Date(),
  } = options;

  const cutoffMs = maxAgeDays ? now.getTime() - maxAgeDays * DAY_MS : null;

  const aggregates = new Map<
    string,
    { totalCarry: number; totalSamples: number; lastRecordedAt: number | null }
  >();

  for (const sample of samples) {
    const clubId = coerceClubId(sample);
    const avgCarryM = coerceAvgCarry(sample);
    const sampleCount = coerceSampleCount(sample);
    const ts = coerceTimestamp(sample);

    if (!clubId || avgCarryM == null || sampleCount == null) continue;
    if (sampleCount < minSamplesToInclude) continue;
    if (cutoffMs && ts && ts < cutoffMs) continue;

    const existing = aggregates.get(clubId) ?? { totalCarry: 0, totalSamples: 0, lastRecordedAt: null };

    aggregates.set(clubId, {
      totalCarry: existing.totalCarry + avgCarryM * sampleCount,
      totalSamples: existing.totalSamples + sampleCount,
      lastRecordedAt: existing.lastRecordedAt != null ? Math.max(existing.lastRecordedAt, ts ?? 0) : ts ?? existing.lastRecordedAt,
    });
  }

  const profile: PracticeDistanceProfile = {};

  for (const [clubId, aggregate] of aggregates.entries()) {
    if (aggregate.totalSamples <= 0) continue;
    profile[clubId] = {
      avgCarryM: aggregate.totalCarry / aggregate.totalSamples,
      sampleCount: aggregate.totalSamples,
      confidence: aggregate.totalSamples >= minSamplesForHighConfidence ? 'high' : 'low',
      lastRecordedAt: aggregate.lastRecordedAt != null ? new Date(aggregate.lastRecordedAt) : undefined,
    };
  }

  return profile;
}
