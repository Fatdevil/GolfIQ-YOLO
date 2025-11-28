import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShareWithCoachButton } from "./ShareWithCoachButton";

const fetchCoachRoundSummary = vi.fn();
const notify = vi.fn();
const useAccessPlan = vi.fn();

vi.mock("@/api/coachSummary", () => ({
  fetchCoachRoundSummary: (...args: unknown[]) => fetchCoachRoundSummary(...args),
}));

vi.mock("@/access/UserAccessContext", () => ({
  useAccessPlan: () => useAccessPlan(),
  useAccessFeatures: () => ({ hasPlanFeature: () => false }),
}));

vi.mock("@/notifications/NotificationContext", () => ({
  useNotifications: () => ({ notify }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ShareWithCoachButton", () => {
  it("fetches and copies the summary for pro users", async () => {
    useAccessPlan.mockReturnValue({ isPro: true, loading: false });
    fetchCoachRoundSummary.mockResolvedValue({
      run_id: "run-123",
      sg_by_category: [],
      sg_per_hole: [],
    });

    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ShareWithCoachButton runId="run-123" />);

    await userEvent.click(screen.getByText("coach.share.button"));

    expect(fetchCoachRoundSummary).toHaveBeenCalledWith("run-123");
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("success", "coach.share.copied");
  });

  it("shows upgrade gate for free users", () => {
    useAccessPlan.mockReturnValue({ isPro: false, loading: false });
    fetchCoachRoundSummary.mockResolvedValue({ run_id: "run-1", sg_by_category: [], sg_per_hole: [] });

    render(<ShareWithCoachButton runId="run-1" />);

    expect(screen.getByText("coach.share.button")).toBeInTheDocument();
    expect(screen.getByText("access.upgrade.title")).toBeInTheDocument();
  });
});
