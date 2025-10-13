const hasPerformance =
  typeof globalThis !== "undefined" &&
  typeof (globalThis as typeof globalThis & { performance?: Performance }).performance !== "undefined" &&
  typeof (globalThis as typeof globalThis & { performance?: Performance }).performance?.now === "function";

const performanceRef = hasPerformance
  ? (globalThis as typeof globalThis & { performance: Performance }).performance
  : undefined;

const timeOffset = hasPerformance && performanceRef
  ? Date.now() - performanceRef.now()
  : 0;

export function now(): number {
  if (performanceRef) {
    return performanceRef.now() + timeOffset;
  }
  return Date.now();
}

export interface FrameBudgetSample {
  fps: number;
  latencyMs: number;
  frameIntervalMs: number;
}

export interface FrameBudgetTracker {
  sample: (captureTs: number, displayTs?: number, pipelineLatencyMs?: number) => FrameBudgetSample;
  reset: () => void;
}

export function createFrameBudgetTracker(windowMs: number = 1000): FrameBudgetTracker {
  const frameTimes: number[] = [];
  let lastDisplayTs: number | null = null;

  const sample = (
    captureTs: number,
    displayTs: number = now(),
    pipelineLatencyMs?: number,
  ): FrameBudgetSample => {
    frameTimes.push(displayTs);
    while (frameTimes.length > 1 && displayTs - frameTimes[0] > windowMs) {
      frameTimes.shift();
    }

    const frameCount = frameTimes.length;
    let fps = 0;
    if (frameCount > 1) {
      const duration = frameTimes[frameCount - 1] - frameTimes[0];
      if (duration > 0) {
        fps = (frameCount - 1) * 1000 / duration;
      }
    }

    const interval = lastDisplayTs === null ? 0 : displayTs - lastDisplayTs;
    lastDisplayTs = displayTs;

    const latency = pipelineLatencyMs ?? Math.max(0, displayTs - captureTs);

    return {
      fps,
      latencyMs: latency,
      frameIntervalMs: interval,
    };
  };

  const reset = () => {
    frameTimes.length = 0;
    lastDisplayTs = null;
  };

  return { sample, reset };
}
