import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { QuickRoundCoachSection } from "./QuickRoundCoachSection";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const fetchCoachRoundSummary = vi.fn();
const useAccessPlan = vi.fn();
const useAccessFeatures = vi.fn();

vi.mock("@/api/coachSummary", () => ({
  fetchCoachRoundSummary: (...args: unknown[]) => fetchCoachRoundSummary(...args),
}));

vi.mock("@/access/UserAccessContext", () => ({
  useAccessPlan: () => useAccessPlan(),
  useAccessFeatures: () => useAccessFeatures(),
}));

describe("QuickRoundCoachSection", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders diagnosis for pro users", async () => {
    useAccessPlan.mockReturnValue({ isPro: true, loading: false });
    useAccessFeatures.mockReturnValue({ hasPlanFeature: vi.fn().mockReturnValue(true) });
    fetchCoachRoundSummary.mockResolvedValue({
      diagnosis: {
        run_id: "run-123",
        findings: [
          {
            id: "tee_inconsistency",
            category: "tee",
            severity: "warning",
            title: "Tee leak",
            message: "Lost strokes off the tee",
          },
        ],
      },
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <QuickRoundCoachSection runId="run-123" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Tee leak/i)).toBeInTheDocument();
    });
  });

  it("shows upgrade gate for free users", () => {
    useAccessPlan.mockReturnValue({ isPro: false, loading: false });
    useAccessFeatures.mockReturnValue({ hasPlanFeature: vi.fn().mockReturnValue(false) });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <QuickRoundCoachSection runId="run-123" />
      </MemoryRouter>,
    );

    expect(screen.getByText(/access.upgrade.title/i)).toBeInTheDocument();
  });
});
