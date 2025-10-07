export type PlaysLikeQuality = "good" | "warn" | "low";

export interface PlaysLikeComponents {
  slopeM: number;
  windM: number;
}

export interface PlaysLikeResult {
  distanceEff: number;
  components: PlaysLikeComponents;
  quality: PlaysLikeQuality;
}

export interface PlaysLikeOptions {
  kS?: number;
  kHW?: number;
  warnThresholdRatio?: number;
  lowThresholdRatio?: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const computeSlopeAdjust = (D: number, deltaH: number, kS = 1.0): number => {
  if (!Number.isFinite(D) || D <= 0 || !Number.isFinite(deltaH)) return 0;
  const gain = clamp(kS, 0.2, 3.0);
  return deltaH * gain;
};

export const computeWindAdjust = (D: number, wParallel: number, kHW = 2.5): number => {
  if (!Number.isFinite(D) || D <= 0 || !Number.isFinite(wParallel)) return 0;
  const gain = clamp(kHW, 0.5, 6.0);
  return wParallel * gain;
};

export const compute = (
  D: number,
  deltaH: number,
  wParallel: number,
  opts: PlaysLikeOptions = {}
): PlaysLikeResult => {
  const options = {
    kS: clamp(opts.kS ?? 1.0, 0.2, 3.0),
    kHW: clamp(opts.kHW ?? 2.5, 0.5, 6.0),
    warnThresholdRatio: opts.warnThresholdRatio ?? 0.05,
    lowThresholdRatio: opts.lowThresholdRatio ?? 0.12,
  };
  const distance = Number.isFinite(D) ? Math.max(D, 0) : 0;
  const slopeM = computeSlopeAdjust(distance, deltaH, options.kS);
  const windM = computeWindAdjust(distance, wParallel, options.kHW);
  const eff = distance + slopeM + windM;
  const total = Math.abs(slopeM) + Math.abs(windM);
  const ratio = distance > 0 ? total / distance : Number.POSITIVE_INFINITY;
  let quality: PlaysLikeQuality;
  if (ratio <= options.warnThresholdRatio) {
    quality = "good";
  } else if (ratio <= options.lowThresholdRatio) {
    quality = "warn";
  } else {
    quality = "low";
  }
  return {
    distanceEff: eff,
    components: { slopeM, windM },
    quality,
  };
};
