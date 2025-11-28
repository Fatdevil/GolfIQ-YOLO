import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";

import RangeScorePage from "@/pages/range/score";
import { UserAccessContext } from "@/access/UserAccessContext";
import type { FeatureId, PlanName } from "@/access/types";
import { UnitsContext } from "@/preferences/UnitsContext";

type AccessValue = {
  loading: boolean;
  plan: PlanName;
  hasFeature: (_feature: FeatureId) => boolean;
  hasPlanFeature: () => boolean;
  isPro: boolean;
  isFree: boolean;
  refresh: () => Promise<void>;
  trial: null;
  expiresAt: null;
  error?: Error;
};

const proAccess: AccessValue = {
  loading: false,
  plan: "pro" as PlanName,
  hasFeature: () => true,
  hasPlanFeature: () => true,
  isPro: true,
  isFree: false,
  refresh: async () => undefined,
  trial: null,
  expiresAt: null,
};

function renderScore(path: string, access = proAccess) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <UserAccessContext.Provider value={access}>
        <UnitsContext.Provider value={{ unit: "metric", setUnit: () => {} }}>
          <Routes>
            <Route path="/range/score" element={<RangeScorePage />} />
          </Routes>
        </UnitsContext.Provider>
      </UserAccessContext.Provider>
    </MemoryRouter>,
  );
}

describe("RangeScorePage mission summary", () => {
  it("shows mission completion when above threshold", () => {
    renderScore(
      "/range/score?missionId=wedge_ladder_60_100&missionHits=2&missionAttempts=3",
    );

    expect(screen.getByText(/Wedge ladder 60–100 m/)).toBeInTheDocument();
    expect(screen.getByText(/Mission completed/)).toBeInTheDocument();
  });

  it("gates mission summary for free users", () => {
    const freeAccess: AccessValue = { ...proAccess, isPro: false, isFree: true, plan: "free" as PlanName };

    renderScore(
      "/range/score?missionId=wedge_ladder_60_100&missionHits=1&missionAttempts=4",
      freeAccess,
    );

    expect(screen.getByText(/Upgrade to Pro/i)).toBeInTheDocument();
  });
});
