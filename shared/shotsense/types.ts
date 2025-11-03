export type IMUFrame = {
  ts: number; // ms epoch
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
};

export type GpsContext = {
  ts: number;
  speed_mps: number;
  distToGreen_m?: number;
  onGreen?: boolean;
};

export type DetectorOpts = {
  // IMU
  sampleHz?: number; // default 50–100 Hz
  swingGyroPeak_degps?: number; // default 450
  swingAccelPeak_ms2?: number; // default 20
  jerkThresh_ms3?: number; // default 180 // |Δa|/Δt impulse gate
  minSwingWindow_ms?: number; // default 250
  debounce_ms?: number; // default 2500
  // GPS gates
  gateOnGreen?: boolean; // default true -> suppress putts initially
  minMoveAfter_ms?: number; // default 800
  minMoveAfter_m?: number; // default 3.0
};

export type ShotCandidate = {
  ts: number;
  strength: number; // normalized 0..1 from peaks
  features: { gyroPeak: number; accelPeak: number; jerkPeak: number };
};

export type ShotSenseEvent = { kind: 'ShotDetected'; at: ShotCandidate };

export type AutoDetectedShot = {
  ts: number;
  strength: number;
  holeId: number;
  start?: { lat: number; lon: number } | undefined;
  lie?: 'Tee' | 'Fairway' | 'Rough' | 'Sand' | 'Recovery' | undefined;
  source: 'auto';
};
