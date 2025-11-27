import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TargetBingoResult } from "../src/features/range/games";

vi.mock("../src/bag/storage", () => ({
  loadBag: () => ({
    updatedAt: 0,
    clubs: [
      { id: "7i", label: "7-iron", carry_m: null },
      { id: "PW", label: "Pitching wedge", carry_m: null },
    ],
  }),
  updateClubCarry: vi.fn(),
}));

vi.mock("../src/bag/gapping", () => ({
  computeGappingStats: vi.fn(() => null),
  recommendedCarry: vi.fn(() => null),
}));

const mockBingoResult: TargetBingoResult = {
  shots: [],
  totalShots: 8,
  hits: 5,
  misses: 3,
  hitRate_pct: 62.5,
  avgAbsError_m: 4.3,
};

vi.mock("../src/features/range/games", async () => {
  const actual = await vi.importActual<typeof import("../src/features/range/games")>(
    "../src/features/range/games"
  );
  return {
    ...actual,
    scoreTargetBingo: vi.fn(() => mockBingoResult),
  };
});

const { saveGhostSpy, getLatestGhostSpy, createGhostIdSpy } = vi.hoisted(() => ({
  saveGhostSpy: vi.fn(),
  getLatestGhostSpy: vi.fn(() => null),
  createGhostIdSpy: vi.fn(() => "ghost-test"),
}));

vi.mock("../src/features/range/ghost", () => ({
  createGhostId: createGhostIdSpy,
  getLatestGhost: getLatestGhostSpy,
  saveGhost: saveGhostSpy,
}));

vi.mock("../src/features/range/api", () => ({
  postRangeAnalyze: vi.fn(() => Promise.resolve({ metrics: null })),
}));
vi.mock("../src/user/historyApi", () => ({
  postRangeSessionSnapshots: vi.fn(),
}));
import RangePracticePage from "../src/pages/RangePracticePage";
import { saveGhost } from "../src/features/range/ghost";
import { scoreTargetBingo } from "../src/features/range/games";
import { UserAccessContext } from "../src/access/UserAccessContext";
import type { FeatureId, PlanName } from "../src/access/types";
import { UnitsContext } from "../src/preferences/UnitsContext";
import { UserSessionProvider } from "../src/user/UserSessionContext";

const proAccessValue = {
  loading: false,
  plan: "pro" as PlanName,
  isPro: true,
  isFree: false,
  trial: null,
  expiresAt: null,
  error: undefined,
  refresh: vi.fn(),
  hasFeature: (_feature: FeatureId) => true,
  hasPlanFeature: () => true,
};

function renderWithAccess(ui: ReactElement) {
  return render(
    <UserSessionProvider>
      <UserAccessContext.Provider value={proAccessValue}>
        <UnitsContext.Provider value={{ unit: "metric", setUnit: () => {} }}>
          {ui}
        </UnitsContext.Provider>
      </UserAccessContext.Provider>
    </UserSessionProvider>,
  );
}

describe("RangePracticePage ghost integration", () => {
  beforeEach(() => {
    saveGhostSpy.mockClear();
    getLatestGhostSpy.mockClear();
    createGhostIdSpy.mockClear();
    vi.mocked(scoreTargetBingo).mockClear();
  });

  it("saves a ghost profile using the current bingo config and result", async () => {
    renderWithAccess(<RangePracticePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Target Bingo/i }));

    await screen.findByText(/Spara som Ghost/i);
    await user.click(screen.getByRole("button", { name: /Spara som Ghost/i }));

    expect(saveGhostSpy).toHaveBeenCalledTimes(1);
    const savedProfile = saveGhostSpy.mock.calls[0][0];
    expect(savedProfile.config.target_m).toBe(150);
    expect(savedProfile.config.maxShots).toBe(20);
    expect(savedProfile.result.totalShots).toBe(mockBingoResult.totalShots);
    expect(saveGhost).toBe(saveGhostSpy);
  });
});
