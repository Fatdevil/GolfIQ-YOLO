export interface SequenceOrder {
  peakOrder: string[];
  isIdeal: boolean;
}

export interface KinematicSequence {
  maxShoulderRotation: number | null;
  maxHipRotation: number | null;
  maxXFactor: number | null;
  shoulderPeakFrame: number | null;
  hipPeakFrame: number | null;
  xFactorPeakFrame: number | null;
  sequenceOrder?: SequenceOrder | null;
}
