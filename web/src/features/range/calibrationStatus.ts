export type CalibrationStatus = {
  calibrated: boolean;
  lastUpdatedAt?: string;
};

const STORAGE_KEY = "golfiq.range.calibrationStatus.v1";

export function loadCalibrationStatus(): CalibrationStatus {
  if (typeof window === "undefined" || !window.localStorage) {
    return { calibrated: false };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { calibrated: false };
    }
    const parsed = JSON.parse(raw) as CalibrationStatus;
    if (typeof parsed.calibrated !== "boolean") {
      return { calibrated: false };
    }
    return parsed;
  } catch {
    return { calibrated: false };
  }
}

export function saveCalibrationStatus(status: CalibrationStatus): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...status,
        lastUpdatedAt: status.lastUpdatedAt ?? new Date().toISOString(),
      })
    );
  } catch {
    // ignore
  }
}
