export type ArhudServiceLevelObjectives = {
  /** Maximum acceptable pose variance (degrees^2) before allowing calibration. */
  aimPoseVarianceMax: number;
  /** Maximum RMS error (degrees) allowed when completing calibration. */
  calibrationHeadingRmsMax: number;
  /** Maximum RMS (degrees) allowed while tracking before forcing recenter. */
  trackingHeadingRmsMax: number;
  /** Grace period (milliseconds) before we require a recenter after calibration. */
  recenterGraceMs: number;
};

export const DEFAULT_ARHUD_SLOS: ArhudServiceLevelObjectives = {
  aimPoseVarianceMax: 0.0125,
  calibrationHeadingRmsMax: 1.75,
  trackingHeadingRmsMax: 2.5,
  recenterGraceMs: 15_000,
};

export const HEADING_SMOOTHER_DEFAULTS = {
  alpha: 0.35,
  rmsWindow: 20,
};
