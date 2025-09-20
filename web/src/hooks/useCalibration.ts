import { useCallback, useEffect, useState } from "react";

type Quality = "ok" | "low_fps" | "blurry" | "ok_warn";

export type CalibrationSnapshot = {
  metersPerPixel: number;
  fps: number;
  quality: Quality;
  referenceLabel?: string;
  updatedAt: string;
  points?: { x: number; y: number }[];
};

const STORAGE_KEY = "golfiq-calibration";

const readFromStorage = (): CalibrationSnapshot | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as CalibrationSnapshot;
    if (typeof parsed.metersPerPixel === "number" && typeof parsed.fps === "number") {
      return parsed;
    }
  } catch (error) {
    console.warn("Failed to parse calibration snapshot", error);
  }
  return null;
};

const writeToStorage = (value: CalibrationSnapshot | null) => {
  if (typeof window === "undefined") {
    return;
  }
  if (!value) {
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }
  window.dispatchEvent(new Event("golfiq-calibration-updated"));
};

export const useCalibration = () => {
  const [calibration, setCalibration] = useState<CalibrationSnapshot | null>(() =>
    readFromStorage()
  );

  const sync = useCallback(() => {
    setCalibration(readFromStorage());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handle = () => sync();
    window.addEventListener("storage", handle);
    window.addEventListener("golfiq-calibration-updated", handle);
    return () => {
      window.removeEventListener("storage", handle);
      window.removeEventListener("golfiq-calibration-updated", handle);
    };
  }, [sync]);

  const saveCalibration = useCallback((value: CalibrationSnapshot) => {
    writeToStorage(value);
    setCalibration(value);
  }, []);

  const clearCalibration = useCallback(() => {
    writeToStorage(null);
    setCalibration(null);
  }, []);

  return { calibration, saveCalibration, clearCalibration };
};
