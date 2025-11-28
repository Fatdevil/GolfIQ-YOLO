import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import type { PlayerProfile } from "@/api/profile";
import MyGolfIQPage from "./MyGolfIQPage";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const accessState = { plan: "free", isPro: false, loading: false } as const;
vi.mock("@/access/UserAccessContext", () => ({
  useAccessPlan: () => accessState,
  useAccessFeatures: () => ({ hasPlanFeature: () => false }),
}));

vi.mock("@/access/UpgradeGate", () => ({
  UpgradeGate: ({ feature }: { feature: string }) => (
    <div data-testid={`upgrade-${feature}`}>Upgrade: {feature}</div>
  ),
}));

vi.mock("@/profile/PlayerAnalyticsSection", () => ({
  PlayerAnalyticsSection: () => <div data-testid="analytics-section" />,
}));
vi.mock("@/profile/memberIdentity", () => ({ useCaddieMemberId: () => "member-1" }));
vi.mock("@/user/UserSessionContext", () => ({ useUserSession: () => ({ session: { userId: "user-1" } }) }));

vi.mock("@/features/quickround/storage", () => ({ loadAllRoundsFull: () => [] }));
vi.mock("@/features/range/ghost", () => ({ listGhosts: () => [] }));
vi.mock("@/bag/storage", () => ({ loadBag: () => [] }));
vi.mock("@/features/range/sessions", () => ({ loadRangeSessions: () => [] }));
vi.mock("@/profile/stats", () => ({
  computeBagSummary: () => ({ clubsWithCarry: 0, totalClubs: 0 }),
  computeQuickRoundStats: () => ({ totalRounds: 0, completedRounds: 0 }),
  computeRangeSummary: () => ({ total: 0 }),
}));

vi.mock("@/api/caddieInsights", () => ({ fetchCaddieInsights: () => Promise.resolve(null) }));
vi.mock("@/api/sgSummary", () => ({
  fetchMemberSgSummary: () => Promise.resolve({ runIds: [], per_category: {}, avg_sg_per_round: 0 }),
}));
vi.mock("@/coach/ShareWithCoachButton", () => ({
  ShareWithCoachButton: () => <div data-testid="share-button" />,
}));
vi.mock("@/api/coachSummary", () => ({ fetchCoachRoundSummary: () => Promise.resolve({ diagnosis: null }) }));
vi.mock("@/onboarding/checklist", () => ({ markProfileSeen: () => {} }));
vi.mock("@/user/historyMigration", () => ({ migrateLocalHistoryOnce: () => Promise.resolve() }));

const sampleProfile: PlayerProfile = {
  memberId: "member-1",
  model: {
    playerType: "Model type",
    strengths: [],
    weaknesses: [],
    consistencyScore: 80,
    developmentIndex: 70,
    referenceRunId: "run-1",
  },
  plan: {
    focusCategories: [],
    steps: [
      { week: 1, title: "Week 1", description: "Do work", focusCategory: "tee", suggestedMissions: [] },
      { week: 2, title: "Week 2", description: "More work", focusCategory: "approach", suggestedMissions: [] },
      { week: 3, title: "Week 3", description: "Keep going", focusCategory: "putt", suggestedMissions: [] },
      { week: 4, title: "Week 4", description: "Finish", focusCategory: "short", suggestedMissions: [] },
    ],
  },
};

vi.mock("@/api/profile", () => ({
  fetchPlayerProfile: () => Promise.resolve(sampleProfile),
}));

describe("MyGolfIQPage player profile gating", () => {
  beforeEach(() => {
    (accessState as any).plan = "free";
    (accessState as any).isPro = false;
  });

  it("shows upgrade gate for free users", async () => {
    render(
      <MemoryRouter>
        <MyGolfIQPage />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("upgrade-PLAYER_PROFILE")).toBeInTheDocument();
  });

  it("renders player profile for pro users", async () => {
    (accessState as any).plan = "pro";
    (accessState as any).isPro = true;

    render(
      <MemoryRouter>
        <MyGolfIQPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Model type/i)).toBeInTheDocument();
    });
    expect(screen.getAllByRole("heading", { level: 5 }).length).toBeGreaterThan(0);
  });
});
