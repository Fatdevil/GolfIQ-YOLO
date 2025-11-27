import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { CaddieInsights } from "@/api/caddieInsights";
import { CaddieInsightsPreviewPage } from "./CaddieInsightsPreviewPage";
import { UserAccessProvider } from "@/access/UserAccessContext";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const fetchCaddieInsights = vi.fn();

vi.mock("@/api/caddieInsights", () => ({
  fetchCaddieInsights: (...args: unknown[]) => fetchCaddieInsights(...args),
}));

const mockInsights: CaddieInsights = {
  memberId: "m1",
  from_ts: new Date().toISOString(),
  to_ts: new Date().toISOString(),
  recent_from_ts: new Date().toISOString(),
  recent_window_days: 7,
  advice_shown: 5,
  advice_accepted: 3,
  accept_rate: 0.6,
  per_club: [],
  clubs: [
    {
      club_id: "7i",
      total_tips: 3,
      accepted: 2,
      ignored: 1,
      recent_accepted: 1,
      recent_total: 2,
      trust_score: 0.75,
    },
    {
      club_id: "3w",
      total_tips: 2,
      accepted: 0,
      ignored: 2,
      recent_accepted: 0,
      recent_total: 1,
      trust_score: 0.05,
    },
  ],
};

describe("CaddieInsightsPreviewPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders trust sections for pro users", async () => {
    fetchCaddieInsights.mockResolvedValue(mockInsights);

    render(
      <UserAccessProvider autoFetch={false} initialPlan="pro">
        <CaddieInsightsPreviewPage />
      </UserAccessProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /load insights/i }));

    await waitFor(() => expect(fetchCaddieInsights).toHaveBeenCalled());

    expect(screen.getByText(/Top trusted clubs/i)).toBeInTheDocument();
    expect(screen.getByText(/Clubs you often ignore/i)).toBeInTheDocument();
    expect(screen.getAllByText("7i").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3w").length).toBeGreaterThan(0);
  });

  it("shows upgrade gate for free users", () => {
    render(
      <UserAccessProvider autoFetch={false} initialPlan="free">
        <CaddieInsightsPreviewPage />
      </UserAccessProvider>,
    );

    expect(screen.getByText(/access.upgrade.title/i)).toBeInTheDocument();
    expect(fetchCaddieInsights).not.toHaveBeenCalled();
  });
});
