import { describe, expect, it } from "vitest";

import type { CaddieInsights } from "@/api/caddieInsights";
import type { RoundSgPreview } from "@/api/sgPreview";
import { buildCoachSuggestions } from "@/profile/coachInsights";

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

const sampleCaddie: CaddieInsights = {
  memberId: "member-123",
  from_ts: "2024-01-01T00:00:00Z",
  to_ts: "2024-02-01T00:00:00Z",
  advice_shown: 20,
  advice_accepted: 10,
  accept_rate: 0.5,
  per_club: [
    { club: "7i", shown: 10, accepted: 4 },
    { club: "Driver", shown: 8, accepted: 7 },
  ],
};

describe("buildCoachSuggestions", () => {
  it("returns worst SG category with severity", () => {
    const result = buildCoachSuggestions(sampleSg, null);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "sg",
      categoryKey: "tee",
      messageKey: "coach.sg.biggestLeak.high",
    });
  });

  it("adds caddie suggestion when accept rate is low", () => {
    const result = buildCoachSuggestions(sampleSg, sampleCaddie);

    expect(result.some((item) => item.type === "caddie")).toBe(true);
    const caddieSuggestion = result.find((item) => item.type === "caddie");
    expect(caddieSuggestion).toMatchObject({
      club: "7i",
      messageKey: "coach.caddie.followAdviceClub",
    });
  });
});
