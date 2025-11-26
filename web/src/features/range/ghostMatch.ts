import type { RangeSession } from "./sessions";

export type GhostMatchLiveStats = {
  currentShots: number;
  ghostShots: number;
  deltaShots: number;
};

export function createGhostMatchStats(
  session: RangeSession | null,
): GhostMatchLiveStats | null {
  if (!session) {
    return null;
  }
  const ghostShots = session.shotCount ?? 0;
  return {
    currentShots: 0,
    ghostShots,
    deltaShots: 0,
  };
}

export function incrementGhostStats(
  stats: GhostMatchLiveStats | null,
): GhostMatchLiveStats | null {
  if (!stats) {
    return stats;
  }
  const nextCurrent = stats.currentShots + 1;
  return {
    currentShots: nextCurrent,
    ghostShots: stats.ghostShots,
    deltaShots: nextCurrent - stats.ghostShots,
  };
}

export function formatSignedDelta(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  if (value < 0) {
    return `−${Math.abs(value)}`;
  }
  return "0";
}
