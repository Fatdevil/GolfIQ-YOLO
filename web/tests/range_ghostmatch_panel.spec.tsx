import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GhostMatchPanel } from "@web/features/range/GhostMatchPanel";
import type { GhostProfile } from "@web/features/range/ghost";
import type { TargetBingoResult } from "@web/features/range/games";

const baseConfig = { target_m: 150, tolerance_m: 6, maxShots: 10 } as const;

const baseGhost: GhostProfile = {
  id: "ghost-1",
  createdAt: 1,
  name: "Ghost baseline",
  config: { ...baseConfig },
  result: {
    totalShots: 10,
    hits: 6,
    hitRate_pct: 60,
    avgAbsError_m: 5,
  },
};

describe("GhostMatchPanel", () => {
  it("renders stats and highlights the player lead", () => {
    const current: TargetBingoResult = {
      shots: [],
      totalShots: 10,
      hits: 7,
      misses: 3,
      hitRate_pct: 70,
      avgAbsError_m: 4,
    };

    render(<GhostMatchPanel cfg={baseConfig} current={current} ghost={baseGhost} />);

    expect(screen.getByText(/GhostMatch – Target 150 m/)).toBeTruthy();
    expect(screen.getAllByText("10", { selector: "td" })).toHaveLength(2);
    expect(screen.getAllByText("Du leder")).toHaveLength(2);
    expect(screen.getByText(/Slå Ghostens träff%/i)).toBeTruthy();
    expect(screen.getByText(/Du leder mot Ghosten/i)).toBeTruthy();
  });

  it("encourages chasing when ghost is ahead and challenge still running", () => {
    const current: TargetBingoResult = {
      shots: [],
      totalShots: 4,
      hits: 1,
      misses: 3,
      hitRate_pct: 25,
      avgAbsError_m: 8,
    };

    render(<GhostMatchPanel cfg={baseConfig} current={current} ghost={baseGhost} />);

    expect(screen.getAllByText(/Ghost leder/)).toHaveLength(2);
    expect(screen.getByText(/Du har slagit 4 av 10/)).toBeTruthy();
    expect(screen.getByText(/Ghosten leder – jaga ikapp!/i)).toBeTruthy();
  });
});
