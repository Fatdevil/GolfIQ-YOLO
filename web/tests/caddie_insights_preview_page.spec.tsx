import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { UserAccessProvider } from "@/access/UserAccessContext";

const mockInsights = {
  memberId: "member-1",
  from_ts: "2024-01-01T00:00:00Z",
  to_ts: "2024-02-01T00:00:00Z",
  recent_from_ts: "2024-01-25T00:00:00Z",
  recent_window_days: 7,
  advice_shown: 4,
  advice_accepted: 3,
  accept_rate: 0.75,
  per_club: [
    { club: "7i", shown: 2, accepted: 1 },
    { club: "PW", shown: 2, accepted: 2 },
  ],
  clubs: [],
};

const fetchCaddieInsights = vi.fn().mockResolvedValue(mockInsights);

vi.mock("@/api/caddieInsights", () => ({ fetchCaddieInsights }));

describe("CaddieInsightsPreviewPage", () => {
  it("loads telemetry insights for a member", async () => {
    const { CaddieInsightsPreviewPage } = await import(
      "@/pages/dev/CaddieInsightsPreviewPage"
    );

    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <UserAccessProvider autoFetch={false} initialPlan="pro">
          <CaddieInsightsPreviewPage />
        </UserAccessProvider>
      </MemoryRouter>,
    );

    await user.clear(screen.getByLabelText(/member id/i));
    await user.type(screen.getByLabelText(/member id/i), "member-1");
    await user.selectOptions(screen.getByLabelText(/window/i), "7");
    await user.click(screen.getByRole("button", { name: /load insights/i }));

    await waitFor(() =>
      expect(fetchCaddieInsights).toHaveBeenCalledWith("member-1", 7),
    );

    expect(await screen.findByText(/advice shown/i)).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getAllByText("7i").length).toBeGreaterThan(0);
    expect(screen.getAllByText("50%").length).toBeGreaterThan(0);
  });
});
