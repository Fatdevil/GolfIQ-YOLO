import { describe, expect, it } from "vitest";

import { buildCoachRecommendations, type SgSummaryForRun } from "./coachLogic";

function makeSummary(values: Partial<Record<"TEE" | "APPROACH" | "SHORT" | "PUTT", number>>): SgSummaryForRun {
  return {
    total_sg: 0,
    sg_by_cat: {
      TEE: values.TEE ?? 0,
      APPROACH: values.APPROACH ?? 0,
      SHORT: values.SHORT ?? 0,
      PUTT: values.PUTT ?? 0,
    },
  };
}

describe("buildCoachRecommendations", () => {
  it("prioritises the biggest negative SG leak", () => {
    const summary = makeSummary({ TEE: -2.1, APPROACH: -0.4, SHORT: 0.1, PUTT: -0.2 });

    const recs = buildCoachRecommendations({ sgSummary: summary });

    expect(recs[0].focusCategory).toBe("tee");
    expect(recs[0].reason).toContain("2.1");
  });

  it("limits the number of recommendations to three", () => {
    const summary = makeSummary({ TEE: -2, APPROACH: -1.5, SHORT: -1, PUTT: -0.5 });

    const recs = buildCoachRecommendations({ sgSummary: summary });

    expect(recs).toHaveLength(3);
  });

  it("uses non-negative categories when all SG values are positive", () => {
    const summary = makeSummary({ TEE: 0.5, APPROACH: 1.2, SHORT: 0.3, PUTT: 0.1 });

    const recs = buildCoachRecommendations({ sgSummary: summary });

    expect(recs[0].focusCategory).toBe("putt");
    expect(recs[0].reason).toContain("0.1");
  });
});
