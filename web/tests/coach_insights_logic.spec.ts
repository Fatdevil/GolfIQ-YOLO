import { describe, expect, it } from "vitest";

import type { RoundSgPreview } from "@/api/sgPreview";
import { buildCoachRecommendations } from "@/coach/coachLogic";

const sampleSg: RoundSgPreview = {
  runId: "run-123",
  courseId: "course-1",
  total_sg: -4,
  sg_by_cat: {
    TEE: -1.5,
    APPROACH: -0.4,
    SHORT: 0.1,
    PUTT: -0.3,
  },
  holes: [],
};

describe("buildCoachRecommendations", () => {
  it("returns the worst SG category first", () => {
    const result = buildCoachRecommendations({ sgSummary: sampleSg });

    expect(result[0].focusCategory).toBe("tee");
  });

  it("limits the number of recommendations", () => {
    const result = buildCoachRecommendations({ sgSummary: sampleSg });

    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(3);
  });
});
