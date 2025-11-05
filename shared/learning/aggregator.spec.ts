import { describe, expect, it } from "vitest";

import { __testUpdateEma, fold } from "./aggregator";
import type { AcceptSample, OutcomeSample } from "./types";

const baseAccept = (overrides: Partial<AcceptSample>): AcceptSample => ({
  ts: Date.now(),
  profile: "neutral",
  clubId: "7i",
  presented: 1,
  accepted: 1,
  ...overrides,
});

const baseOutcome = (overrides: Partial<OutcomeSample>): OutcomeSample => ({
  ts: Date.now(),
  profile: "neutral",
  clubId: "7i",
  tp: 1,
  fn: 0,
  ...overrides,
});

describe("shared/learning/aggregator", () => {
  it("produces no suggestion when samples below threshold", () => {
    const accepts: AcceptSample[] = [];
    const outcomes: OutcomeSample[] = [
      baseOutcome({ ts: 1, tp: 5, fn: 5 }),
      baseOutcome({ ts: 2, tp: 3, fn: 7 }),
    ];
    const suggestions = fold(accepts, outcomes, { minSamples: 50 });
    expect(suggestions).toHaveLength(0);
  });

  it("builds EMA metrics from streams", () => {
    const now = Date.now();
    const accepts: AcceptSample[] = [
      baseAccept({ ts: now - 5000, presented: 10, accepted: 5 }),
      baseAccept({ ts: now - 1000, presented: 10, accepted: 7 }),
    ];
    const outcomes: OutcomeSample[] = [
      baseOutcome({ ts: now - 4000, tp: 7, fn: 3 }),
      baseOutcome({ ts: now - 2000, tp: 6, fn: 4 }),
      baseOutcome({ ts: now - 1000, tp: 9, fn: 1 }),
    ];
    const suggestions = fold(accepts, outcomes, { minSamples: 10 });
    expect(suggestions).toHaveLength(1);
    const suggestion = suggestions[0];
    expect(suggestion.acceptEma).toBeGreaterThan(0);
    expect(suggestion.successEma).toBeGreaterThan(0);
    expect(suggestion.sampleSize).toBeGreaterThanOrEqual(10);
  });

  it("clamps delta magnitude and halves when low sample", () => {
    const accepts: AcceptSample[] = [
      baseAccept({ ts: 1, presented: 120, accepted: 60 }),
    ];
    const outcomes: OutcomeSample[] = [
      baseOutcome({ ts: 1, tp: 72, fn: 48 }),
    ];
    const [suggestion] = fold(accepts, outcomes, { minSamples: 50, gain: 0.6, targetPrecision: 0.75 });
    expect(Math.abs(suggestion.delta)).toBeLessThanOrEqual(0.1);
    const outcomesLow: OutcomeSample[] = [
      baseOutcome({ ts: 1, tp: 36, fn: 24 }),
    ];
    const [low] = fold(accepts, outcomesLow, { minSamples: 50, gain: 0.6, targetPrecision: 0.75 });
    expect(Math.abs(low.delta)).toBeLessThan(Math.abs(suggestion.delta));
  });

  it("returns correct sign for delta based on gap", () => {
    const accepts: AcceptSample[] = [baseAccept({ presented: 200, accepted: 100 })];
    const underperform: OutcomeSample[] = [baseOutcome({ tp: 100, fn: 150 })];
    const outperform: OutcomeSample[] = [baseOutcome({ tp: 180, fn: 20 })];

    const [negative] = fold(accepts, outperform, { minSamples: 50 });
    const [positive] = fold(accepts, underperform, { minSamples: 50 });

    expect(positive.delta).toBeGreaterThanOrEqual(0);
    expect(positive.hazardDelta).toBeGreaterThanOrEqual(0);
    expect(positive.distanceDelta).toBeLessThanOrEqual(0);
    expect(negative.delta).toBeLessThanOrEqual(0);
    expect(negative.hazardDelta).toBeLessThanOrEqual(0);
    expect(negative.distanceDelta).toBeGreaterThanOrEqual(0);
  });
});

describe("weighted EMA", () => {
  type EmaState = { ema: number; total: number; samples: number };
  const alpha = 0.2;

  it("heavier weight moves EMA further towards value", () => {
    const s0: EmaState = { ema: 0.5, total: 0, samples: 0 };
    const light = __testUpdateEma(s0, 1, 1, alpha);
    const heavy = __testUpdateEma(s0, 1, 50, alpha);
    expect(heavy.ema).toBeGreaterThan(light.ema);
    expect(heavy.samples - s0.samples).toBe(50);
    expect(light.samples - s0.samples).toBe(1);
  });

  it("weight=0 does not change EMA or totals", () => {
    const s0: EmaState = { ema: 0.4, total: 10, samples: 25 };
    const s1 = __testUpdateEma(s0, 1, 0, alpha);
    expect(s1.ema).toBeCloseTo(0.4, 10);
    expect(s1.total).toBe(10);
    expect(s1.samples).toBe(25);
  });

  it("alpha_eff matches repeated single-weight updates (within tolerance)", () => {
    const s0: EmaState = { ema: 0.3, total: 0, samples: 0 };
    const batched = __testUpdateEma(s0, 0.9, 20, alpha);

    let seq: EmaState = { ema: 0.3, total: 0, samples: 0 };
    for (let i = 0; i < 20; i += 1) {
      seq = __testUpdateEma(seq, 0.9, 1, alpha);
    }

    expect(batched.ema).toBeCloseTo(seq.ema, 6);
    expect(batched.samples).toBe(seq.samples);
    expect(batched.total).toBeCloseTo(seq.total, 6);
  });
});
