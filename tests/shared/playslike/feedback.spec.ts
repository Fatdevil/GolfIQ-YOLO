import { describe, expect, it } from "vitest";

import { defaultBag } from "../../../shared/playslike/bag";
import { buildShotFeedback } from "../../../shared/playslike/feedback";

describe("buildShotFeedback", () => {
  it("summarises a short shot with headwind and uphill factors", () => {
    const bag = defaultBag();
    const feedback = buildShotFeedback({
      planned: {
        base_m: 150,
        playsLike_m: 160,
        deltas: { temp: 1, alt: 0, head: -8, slope: -5 },
        clubSuggested: "6i",
        tuningActive: true,
        aimAdjust_deg: 1.6,
      },
      actual: {
        carry_m: 148,
        clubUsed: "7i",
      },
      bag,
    });

    expect(feedback.title).toBe("12 m short (≈ 1 club)");
    expect(feedback.lines[0]).toContain("headwind");
    expect(feedback.lines[0]).toContain("−8 m");
    expect(feedback.lines[0]).toContain("uphill");
    expect(feedback.lines[0]).toContain("−5 m");
    expect(feedback.lines[0]).toContain("temp +1 m");
    expect(feedback.lines[1]).toBe("You used 7i; suggested was 6i.");
    expect(feedback.lines[2]).toContain("choose +1 club");
    expect(feedback.lines[2]).toContain("aim +1.6° LEFT");
    expect(feedback.nextClub).toBe("6i");
    expect(feedback.tuningActive).toBe(true);
    expect(feedback.clubError).toBeLessThan(-0.7);
    expect(feedback.clubError).toBeGreaterThan(-1.3);
    expect(feedback.topFactors.length).toBeGreaterThanOrEqual(2);
  });

  it("handles a long shot with tailwind and downhill support", () => {
    const bag = defaultBag();
    const feedback = buildShotFeedback({
      planned: {
        base_m: 150,
        playsLike_m: 150,
        deltas: { temp: 0, alt: 0, head: 6, slope: 3 },
        clubSuggested: "7i",
        aimAdjust_deg: -2.4,
      },
      actual: {
        carry_m: 164,
        clubUsed: "6i",
      },
      bag,
    });

    expect(feedback.title).toBe("14 m long (≈ 1 club)");
    expect(feedback.lines[0]).toContain("tailwind +6 m");
    expect(feedback.lines[0]).toContain("downhill +3 m");
    expect(feedback.lines[2]).toContain("choose −1 club");
    expect(feedback.lines[2]).toContain("aim −2.4° RIGHT");
    expect(feedback.nextClub).toBe("7i");
    expect(feedback.tuningActive).toBe(false);
    expect(feedback.clubError).toBeGreaterThan(0.7);
    expect(feedback.clubError).toBeLessThan(1.3);
  });

  it("keeps the recommendation stable when the shot is effectively on target", () => {
    const bag = defaultBag();
    const feedback = buildShotFeedback({
      planned: {
        base_m: 150,
        playsLike_m: 151,
        deltas: { temp: 0, alt: 0, head: 0.4, slope: -0.2 },
        clubSuggested: "7i",
      },
      actual: {
        carry_m: 151.3,
      },
      bag,
    });

    expect(feedback.title).toBe("On target (<1 m)");
    expect(feedback.lines[2]).toBe("Next time: stay with the same club.");
    expect(feedback.nextClub).toBe("7i");
  });
});
