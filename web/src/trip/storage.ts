const TRIP_HCP_STORAGE_KEY = "golfiq.trip.defaultHandicap.v1";

export function loadTripDefaultHandicap(): number | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(TRIP_HCP_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveTripDefaultHandicap(value: number): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(TRIP_HCP_STORAGE_KEY, String(value));
  } catch {
    // ignore
  }
}

export function clearTripDefaultHandicap(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(TRIP_HCP_STORAGE_KEY);
  } catch {
    // ignore
  }
}
