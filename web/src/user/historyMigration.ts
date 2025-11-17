import type { QuickRound } from "@/features/quickround/types";
import type { RangeSession } from "@/features/range/sessions";
import { mapQuickRoundToSnapshot, mapRangeSessionToSnapshot } from "./historySync";
import { postQuickRoundSnapshots, postRangeSessionSnapshots } from "./historyApi";

const MIGRATION_KEY_PREFIX = "golfiq.history.migrated.v1:";

function getMigrationKey(userId: string): string {
  return `${MIGRATION_KEY_PREFIX}${userId}`;
}

export function hasMigratedHistory(userId: string): boolean {
  try {
    const raw = window.localStorage.getItem(getMigrationKey(userId));
    return raw === "1";
  } catch {
    return false;
  }
}

function markMigrated(userId: string) {
  try {
    window.localStorage.setItem(getMigrationKey(userId), "1");
  } catch {
    // ignore
  }
}

export async function migrateLocalHistoryOnce(
  userId: string,
  quickRounds: QuickRound[],
  rangeSessions: RangeSession[]
): Promise<void> {
  if (!userId) return;
  if (hasMigratedHistory(userId)) return;

  const qrSnaps = quickRounds.map(mapQuickRoundToSnapshot);
  const rsSnaps = rangeSessions.map(mapRangeSessionToSnapshot);

  try {
    if (qrSnaps.length > 0) {
      await postQuickRoundSnapshots(qrSnaps);
    }
    if (rsSnaps.length > 0) {
      await postRangeSessionSnapshots(rsSnaps);
    }
  } catch {
    return;
  }

  markMigrated(userId);
}
