export type ResetableKey =
  | "quickRounds"
  | "bag"
  | "rangeSessions"
  | "calibration"
  | "preferences";

const QUICK_ROUNDS_STORAGE_KEY = "golfiq.quickRounds.v1";
const QUICK_ROUNDS_HCP_KEY = "golfiq.quickRound.handicap.v1";
const BAG_STORAGE_KEY = "golfiq.bag.v1";
const RANGE_SESSIONS_STORAGE_KEY = "golfiq.range.sessions.v1";
const CALIBRATION_STORAGE_KEY = "golfiq.range.calibrationStatus.v1";
const LANG_KEY = "golfiq.lang";
const UNITS_KEY = "golfiq.units.v1";

export function resetLocalData(keys: ResetableKey[]): void {
  const storage: Storage | null =
    typeof window !== "undefined" && window.localStorage
      ? window.localStorage
      : (globalThis as { localStorage?: Storage }).localStorage ?? null;

  if (!storage) return;

  for (const key of keys) {
    try {
      switch (key) {
        case "quickRounds":
          storage.removeItem(QUICK_ROUNDS_STORAGE_KEY);
          storage.removeItem(QUICK_ROUNDS_HCP_KEY);
          break;
        case "bag":
          storage.removeItem(BAG_STORAGE_KEY);
          break;
        case "rangeSessions":
          storage.removeItem(RANGE_SESSIONS_STORAGE_KEY);
          break;
        case "calibration":
          storage.removeItem(CALIBRATION_STORAGE_KEY);
          break;
        case "preferences":
          storage.removeItem(LANG_KEY);
          storage.removeItem(UNITS_KEY);
          break;
      }
    } catch {
      // ignore
    }
  }
}
