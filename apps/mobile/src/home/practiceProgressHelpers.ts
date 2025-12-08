import type { PracticeProgressOverview } from '@app/storage/practiceMissionHistory';

export type PracticeProgressTileModel = {
  completionRatio: number;
  completedSessionsLabelKey: string;
  subtitleKey: string;
  hasData: boolean;
  completedSessions?: number;
  totalSessions?: number;
  windowDays: number;
};

export function buildPracticeProgressTileModel(
  overview: PracticeProgressOverview | null,
): PracticeProgressTileModel | null {
  if (!overview) return null;

  const { totalSessions, completedSessions, windowDays } = overview;

  const hasData = totalSessions > 0;
  const completionRatio = totalSessions > 0 ? completedSessions / totalSessions : 0;

  let completedSessionsLabelKey = 'practice.progress.none';
  if (completedSessions > 0 && completedSessions < totalSessions) {
    completedSessionsLabelKey = 'practice.progress.some';
  }
  if (totalSessions > 0 && completedSessions === totalSessions) {
    completedSessionsLabelKey = 'practice.progress.all';
  }

  return {
    completionRatio,
    completedSessionsLabelKey,
    subtitleKey: 'practice.progress.subtitleLast7Days',
    hasData,
    completedSessions: hasData ? completedSessions : undefined,
    totalSessions: hasData ? totalSessions : undefined,
    windowDays,
  };
}
