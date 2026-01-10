export type FpsEstimate = {
  value?: number;
  method: "rvfc" | "seeked" | "metadata" | "fallback";
  confidence: "high" | "medium" | "low";
};

const COARSE_DELTA_THRESHOLD = 0.2;

const median = (values: number[]): number | undefined => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

export function estimateFpsFromTimes(
  times: number[],
  method: FpsEstimate["method"],
): FpsEstimate {
  if (times.length < 2) {
    return { method, confidence: "low" };
  }
  const deltas = times
    .slice(1)
    .map((value, index) => value - times[index])
    .filter((delta) => Number.isFinite(delta) && delta > 0);
  const medianDelta = median(deltas);
  if (!medianDelta || medianDelta <= 0 || medianDelta > COARSE_DELTA_THRESHOLD) {
    return { method, confidence: "low" };
  }
  const value = 1 / medianDelta;
  const confidence = medianDelta < 0.05 ? "high" : "medium";
  return { value, method, confidence };
}

export function effectiveFpsFromEstimate(
  estimate: FpsEstimate | undefined,
  fallback: number,
): number {
  if (!estimate?.value || estimate.confidence === "low") {
    return fallback;
  }
  return estimate.value;
}
