import { describe, expect, it } from "vitest";

import { computeCarrySuggestions } from "@web/bag/smart_sync";
import type { BagState } from "@web/bag/types";
import type { RangeSession } from "@web/features/range/sessions";

function buildBag(partial?: Partial<BagState>): BagState {
  return {
    updatedAt: 0,
    clubs: [
      { id: "7i", label: "7-iron", carry_m: 145 },
      { id: "9i", label: "9-iron", carry_m: 120 },
    ],
    ...partial,
  };
}

function buildSession(
  overrides: Partial<RangeSession> & { id: string }
): RangeSession {
  const { id, ...rest } = overrides;
  return {
    id,
    startedAt: "2024-01-01T00:00:00.000Z",
    endedAt: "2024-01-01T01:00:00.000Z",
    shotCount: 10,
    avgCarry_m: 150,
    carryStd_m: null,
    clubId: "7i",
    ...rest,
  };
}

describe("computeCarrySuggestions", () => {
  it("aggregates sessions per club and ignores insufficient data", () => {
    const bag = buildBag();
    const sessions: RangeSession[] = [
      buildSession({ id: "s1", avgCarry_m: 150, clubId: "7i" }),
      buildSession({ id: "s2", avgCarry_m: 154, clubId: "7i" }),
      buildSession({ id: "s3", avgCarry_m: 152, clubId: "7i" }),
      buildSession({ id: "s4", avgCarry_m: 110, clubId: "9i", shotCount: 4 }),
      buildSession({ id: "s5", avgCarry_m: null, clubId: "7i" }),
      buildSession({ id: "s6", avgCarry_m: 130, clubId: null }),
    ];

    const suggestions = computeCarrySuggestions(bag, sessions);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      clubId: "7i",
      currentCarry_m: 145,
      suggestedCarry_m: 152,
      sampleCount: 3,
    });
  });

  it("skips suggestions when difference is below threshold", () => {
    const bag = buildBag({
      clubs: [
        { id: "7i", label: "7-iron", carry_m: 151 },
      ],
    });
    const sessions: RangeSession[] = [
      buildSession({ id: "s1", avgCarry_m: 153, clubId: "7i" }),
      buildSession({ id: "s2", avgCarry_m: 152, clubId: "7i" }),
    ];

    const suggestions = computeCarrySuggestions(bag, sessions);
    expect(suggestions).toHaveLength(0);
  });

  it("rounds suggested carry and handles missing current values", () => {
    const bag = buildBag({
      clubs: [
        { id: "7i", label: "7-iron", carry_m: null },
      ],
    });
    const sessions: RangeSession[] = [
      buildSession({ id: "s1", avgCarry_m: 152.6, clubId: "7i" }),
      buildSession({ id: "s2", avgCarry_m: 153.4, clubId: "7i" }),
    ];

    const suggestions = computeCarrySuggestions(bag, sessions);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].suggestedCarry_m).toBe(153);
    expect(suggestions[0].currentCarry_m).toBeNull();
  });
});
