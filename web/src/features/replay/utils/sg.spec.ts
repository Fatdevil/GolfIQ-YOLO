import { describe, expect, it } from "vitest";

import { makeShot } from "../../../__tests__/helpers/factories";
import { groupShotsByHole, summarizeShots } from "./sg";
import type { ParsedRound } from "./parseRound";

const roundStub: ParsedRound = {
  id: "round-1",
  courseId: "course-123",
  startedAt: Date.now(),
  finished: true,
  totalPar: 72,
  totalScore: 70,
  relative: -2,
  firHit: 0,
  firEligible: 0,
  girHit: 0,
  girEligible: 0,
  holes: [
    { holeNo: 1, par: 4, score: 4, strokes: 2, fir: null, gir: null },
    { holeNo: 2, par: 3, score: 3, strokes: 1, fir: null, gir: null },
  ],
} as const;

describe("sg utils", () => {
  it("summarizes adoption lift and strokes gained components", () => {
    const shots = [
      makeShot({
        shotId: "s1",
        phase: "tee",
        planAdopted: true,
        sg: { tee: 0.1, approach: 0, short: 0, putt: 0, total: 0.1, expStart: 3, expEnd: 2, strokes: 1 },
      }),
      makeShot({
        shotId: "s2",
        phase: "approach",
        sg: { tee: 0, approach: 0.2, short: 0, putt: 0, total: 0.2, expStart: 2, expEnd: 1, strokes: 1 },
      }),
      makeShot({
        shotId: "s3",
        phase: "putt",
        sg: { tee: 0, approach: 0, short: 0, putt: -0.05, total: -0.05, expStart: 1, expEnd: 0, strokes: 1 },
      }),
    ];

    const summary = summarizeShots(shots);

    expect(summary.count).toBe(3);
    expect(summary.total).toBeCloseTo(0.25, 5);
    expect(summary.tee).toBeCloseTo(0.1, 5);
    expect(summary.approach).toBeCloseTo(0.2, 5);
    expect(summary.putt).toBeCloseTo(-0.05, 5);
    expect(summary.adopted.count).toBe(1);
    expect(summary.adopted.average).toBeCloseTo(0.1, 5);
    expect(summary.notAdopted.count).toBe(2);
    expect(summary.notAdopted.average).toBeCloseTo(0.075, 5);
    expect(summary.lift).toBeCloseTo(0.025, 5);
  });

  it("groups shots by hole using stroke counts when available", () => {
    const shots = [
      makeShot({
        shotId: "s1",
        phase: "tee",
        sg: { tee: 0.1, approach: 0, short: 0, putt: 0, total: 0.1, expStart: 3, expEnd: 2, strokes: 1 },
      }),
      makeShot({
        shotId: "s2",
        phase: "approach",
        sg: { tee: 0, approach: 0.2, short: 0, putt: 0, total: 0.2, expStart: 2, expEnd: 1, strokes: 1 },
      }),
      makeShot({
        shotId: "s3",
        phase: "putt",
        sg: { tee: 0, approach: 0, short: 0, putt: -0.05, total: -0.05, expStart: 1, expEnd: 0, strokes: 1 },
      }),
    ];

    const aggregates = groupShotsByHole(shots, roundStub);

    expect(aggregates).toHaveLength(2);
    expect(aggregates[0].shots).toHaveLength(2);
    expect(aggregates[0].total).toBeCloseTo(0.3, 5);
    expect(aggregates[0].tee).toBeCloseTo(0.1, 5);
    expect(aggregates[0].approach).toBeCloseTo(0.2, 5);
    expect(aggregates[1].shots).toHaveLength(1);
    expect(aggregates[1].total).toBeCloseTo(-0.05, 5);
    expect(aggregates[1].putt).toBeCloseTo(-0.05, 5);
  });
});
