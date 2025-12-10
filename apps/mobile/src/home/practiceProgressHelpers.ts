import type { PracticeProgressOverview } from '@app/storage/practiceMissionHistory';

export type PracticeProgressTileModel = {
  completionRatio: number;
  summaryKey: string;
  summaryParams?: Record<string, number>;
  subtitleKey: string;
  subtitleParams?: Record<string, number>;
  hasData: boolean;
  completedSessions?: number;
  totalSessions?: number;
  windowDays: number;
  streakDays?: number;
};

export function buildPracticeProgressTileModel(
  overview: PracticeProgressOverview | null,
): PracticeProgressTileModel | null {
  if (!overview) return null;

  const { totalSessions, completedSessions, windowDays } = overview;

  const hasData = totalSessions > 0;
  const completionRatio = totalSessions > 0 ? completedSessions / totalSessions : 0;

  let summaryKey = 'practice.progress.getStarted';
  let summaryParams: Record<string, number> | undefined;

  if (hasData && completedSessions === 0) {
    summaryKey = 'practice.progress.abandonedOnly';
  }

  if (completedSessions > 0) {
    summaryKey = 'practice.progress.completedSummary';
    summaryParams = { completed: completedSessions, total: totalSessions };
  }

  const subtitleKey = overview.streakDays && overview.streakDays >= 2
    ? 'practice.progress.streak'
    : 'practice.progress.subtitleWindow';
  const subtitleParams: Record<string, number> | undefined = subtitleKey === 'practice.progress.subtitleWindow'
    ? { window: windowDays }
    : overview.streakDays != null
      ? { days: overview.streakDays }
      : undefined;

  return {
    completionRatio,
    summaryKey,
    summaryParams,
    subtitleKey,
    subtitleParams,
    hasData,
    completedSessions: hasData ? completedSessions : undefined,
    totalSessions: hasData ? totalSessions : undefined,
    windowDays,
    streakDays: overview.streakDays,
  };
}
