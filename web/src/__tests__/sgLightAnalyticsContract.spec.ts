import { describe, expect, it } from "vitest";

import { buildSgLightImpressionKey } from "@shared/sgLight/analytics";

describe("sg light analytics contract", () => {
  it("builds round recap summary keys", () => {
    expect(
      buildSgLightImpressionKey({
        surface: "round_recap",
        contextId: "round-123",
        cardType: "summary",
      }),
    ).toBe("sg_light:round_recap:round-123:summary");
  });

  it("builds round story trend keys with and without focus", () => {
    expect(
      buildSgLightImpressionKey({
        surface: "round_story",
        contextId: "story-456",
        cardType: "trend",
      }),
    ).toBe("sg_light:round_story:story-456:trend");

    expect(
      buildSgLightImpressionKey({
        surface: "round_story",
        contextId: "story-456",
        cardType: "trend",
        focusCategory: "tee",
      }),
    ).toBe("sg_light:round_story:story-456:trend:tee");
  });
});
