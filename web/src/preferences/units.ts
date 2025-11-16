export type DistanceUnit = "metric" | "imperial";

const STORAGE_KEY = "golfiq.units.v1";

export function loadUnitsPreference(
  defaultUnit: DistanceUnit = "metric"
): DistanceUnit {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "metric" || raw === "imperial") {
      return raw;
    }
  } catch {
    // ignore
  }
  return defaultUnit;
}

export function saveUnitsPreference(unit: DistanceUnit): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, unit);
  } catch {
    // ignore
  }
}
