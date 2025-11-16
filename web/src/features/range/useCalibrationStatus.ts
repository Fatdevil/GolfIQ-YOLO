import { useState } from "react";
import {
  type CalibrationStatus,
  loadCalibrationStatus,
  saveCalibrationStatus,
} from "./calibrationStatus";

export function useCalibrationStatus() {
  const [status, setStatus] = useState<CalibrationStatus>(() => loadCalibrationStatus());

  const markCalibrated = () => {
    const next: CalibrationStatus = {
      calibrated: true,
      lastUpdatedAt: new Date().toISOString(),
    };
    saveCalibrationStatus(next);
    setStatus(next);
  };

  const markUncalibrated = () => {
    const next: CalibrationStatus = { calibrated: false };
    saveCalibrationStatus(next);
    setStatus(next);
  };

  return { status, markCalibrated, markUncalibrated };
}
