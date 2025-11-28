import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { fetchDemoProfile, type DemoProfileResponse } from "@/api/demo";
import MyGolfIQPage from "./MyGolfIQPage";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/access/UserAccessContext", () => ({
  useAccessPlan: () => ({ plan: "free", isPro: false, loading: false, refresh: vi.fn() }),
  useAccessFeatures: () => ({ hasPlanFeature: () => false }),
}));

vi.mock("@/access/UpgradeGate", () => ({
  UpgradeGate: ({ children }: { feature: string; children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/profile/PlayerAnalyticsSection", () => ({
  PlayerAnalyticsSection: ({ demoAnalytics }: { demoAnalytics?: { memberId?: string } }) => (
    <div data-testid="analytics-section">analytics {demoAnalytics?.memberId ?? "none"}</div>
  ),
}));

vi.mock("@/profile/PlayerProfilePanel", () => ({
  PlayerProfilePanel: ({ profile }: any) => (
    <div data-testid="profile-panel">{profile.model.playerType}</div>
  ),
}));

vi.mock("@/user/UserSessionContext", () => ({
  useUserSession: () => ({ session: { userId: "user-1" } }),
}));

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

vi.mock("@/api/demo", () => ({ fetchDemoProfile: vi.fn() }));
const mockFetchDemoProfile = vi.mocked(fetchDemoProfile);

const demoPayload: DemoProfileResponse = {
  profile: {
    memberId: "demo-member",
    model: {
      playerType: "Demo player",
      strengths: [],
      weaknesses: [],
      consistencyScore: 70,
      developmentIndex: 60,
      referenceRunId: "demo-run-1",
    },
    plan: {
      focusCategories: ["tee"],
      steps: [
        { week: 1, title: "Week 1", description: "Demo work", focusCategory: "tee", suggestedMissions: [] },
      ],
    },
  },
  analytics: {
    memberId: "demo-member",
    sgTrend: [],
    categoryStatus: [],
    missionStats: { totalMissions: 0, completed: 0, completionRate: 0 },
    bestRoundId: null,
    worstRoundId: null,
  },
  diagnosis: { run_id: "demo-run-1", findings: [] },
};

describe("MyGolfIQPage demo onboarding", () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetchDemoProfile.mockResolvedValue(demoPayload);
  });

  it("shows onboarding modal when not completed", () => {
    render(
      <MemoryRouter>
        <MyGolfIQPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/See GolfIQ in action/i)).toBeInTheDocument();
  });

  it("loads demo profile when user opts in", async () => {
    render(
      <MemoryRouter>
        <MyGolfIQPage />
      </MemoryRouter>,
    );

    const [showDemoButton] = screen.getAllByText(/Start demo/i);
    await userEvent.click(showDemoButton);

    await waitFor(() => expect(mockFetchDemoProfile).toHaveBeenCalled());
    expect(screen.getByText(/Demo mode/i)).toBeInTheDocument();
    const analyticsSections = screen.getAllByTestId("analytics-section");
    expect(
      analyticsSections.some((el: HTMLElement) =>
        el.textContent?.includes("demo-member"),
      )
    ).toBe(true);
    expect(screen.getByTestId("profile-panel")).toHaveTextContent("Demo player");
    await waitFor(() => {
      expect(screen.queryByTestId("upgrade-PLAYER_PROFILE")).not.toBeInTheDocument();
    });
  });
});
