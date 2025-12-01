import type { RangeHistoryEntry } from '@app/range/rangeHistoryStorage';

export interface RangeProgressStats {
  sessionCount: number;
  totalRecordedShots: number;
  firstSessionDate?: string;
  lastSessionDate?: string;

  mostRecordedClubs: Array<{
    club: string;
    shotCount: number;
  }>;

  recentSampleSize: {
    sessions: number;
    shots: number;
  };

  recentContactPct?: number;
  recentLeftRightBias?: 'left' | 'right' | 'balanced' | null;
}

const RECENT_SESSIONS = 5;
const MIN_RECENT_SESSIONS = 3;
const MIN_RECENT_SHOTS = 30;

function parseDate(value?: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function entryTimestamp(entry: RangeHistoryEntry): number {
  return parseDate(entry.savedAt || entry.summary.finishedAt || entry.summary.startedAt);
}

function sortByMostRecent(history: RangeHistoryEntry[]): RangeHistoryEntry[] {
  return [...history].sort((a, b) => entryTimestamp(b) - entryTimestamp(a));
}

function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function computeTimeRange(history: RangeHistoryEntry[]): { firstSessionDate?: string; lastSessionDate?: string } {
  if (history.length === 0) return {};

  const sortedByDate = sortByMostRecent(history);
  const latest = sortedByDate[0];
  const oldest = sortedByDate[sortedByDate.length - 1];

  const lastDate = latest.savedAt || latest.summary.finishedAt || latest.summary.startedAt;
  const firstDate = oldest.savedAt || oldest.summary.finishedAt || oldest.summary.startedAt;

  return {
    firstSessionDate: firstDate,
    lastSessionDate: lastDate,
  };
}

function computeMostRecordedClubs(history: RangeHistoryEntry[]): RangeProgressStats['mostRecordedClubs'] {
  const clubCounts = new Map<string, number>();

  history.forEach((entry) => {
    const club = entry.summary.club?.trim() || 'Unknown';
    const shotCount = typeof entry.summary.shotCount === 'number' ? entry.summary.shotCount : 0;
    clubCounts.set(club, (clubCounts.get(club) || 0) + shotCount);
  });

  return Array.from(clubCounts.entries())
    .map(([club, shotCount]) => ({ club, shotCount }))
    .sort((a, b) => b.shotCount - a.shotCount)
    .slice(0, 3);
}

export function computeRangeProgressStats(history: RangeHistoryEntry[]): RangeProgressStats {
  const sessionCount = history.length;
  const sortedHistory = sortByMostRecent(history);

  const totalRecordedShots = sortedHistory.reduce((total, entry) => {
    const shots = typeof entry.summary.shotCount === 'number' ? entry.summary.shotCount : 0;
    return total + shots;
  }, 0);

  const { firstSessionDate, lastSessionDate } = computeTimeRange(sortedHistory);

  const mostRecordedClubs = computeMostRecordedClubs(sortedHistory);

  const recentSessions = Math.min(sessionCount, RECENT_SESSIONS);
  const recentHistory = sortedHistory.slice(0, recentSessions);
  const recentShots = recentHistory.reduce((total, entry) => {
    const shots = typeof entry.summary.shotCount === 'number' ? entry.summary.shotCount : 0;
    return total + shots;
  }, 0);

  const stats: RangeProgressStats = {
    sessionCount,
    totalRecordedShots,
    firstSessionDate,
    lastSessionDate,
    mostRecordedClubs,
    recentSampleSize: {
      sessions: recentSessions,
      shots: recentShots,
    },
  };

  const hasEnoughRecentSessions = recentSessions >= MIN_RECENT_SESSIONS;
  const hasEnoughRecentShots = recentShots >= MIN_RECENT_SHOTS;

  if (hasEnoughRecentSessions && hasEnoughRecentShots) {
    const contactValues = recentHistory
      .map((entry) => entry.summary.contactPct)
      .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));

    if (contactValues.length > 0) {
      const averageContact =
        contactValues.reduce((total, value) => total + clampPercent(value), 0) / contactValues.length;
      stats.recentContactPct = Math.round(averageContact);
    }

    const leftRightCounts = recentHistory.reduce(
      (acc, entry) => {
        const tendency = entry.summary.tendency;
        if (tendency === 'left') acc.left += 1;
        else if (tendency === 'right') acc.right += 1;
        else if (tendency === 'straight') acc.balanced += 1;
        return acc;
      },
      { left: 0, right: 0, balanced: 0 }
    );

    const totalDirectionalSessions = leftRightCounts.left + leftRightCounts.right + leftRightCounts.balanced;

    if (totalDirectionalSessions > 0) {
      if (leftRightCounts.left > leftRightCounts.right && leftRightCounts.left > leftRightCounts.balanced) {
        stats.recentLeftRightBias = 'left';
      } else if (leftRightCounts.right > leftRightCounts.left && leftRightCounts.right > leftRightCounts.balanced) {
        stats.recentLeftRightBias = 'right';
      } else {
        stats.recentLeftRightBias = 'balanced';
      }
    }
  }

  return stats;
}
