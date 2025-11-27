import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import type { RoundSgPreview } from "@/api/sgPreview";
import { QuickRoundCoachSection } from "./QuickRoundCoachSection";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const useAccessPlan = vi.fn();
const useAccessFeatures = vi.fn();

vi.mock("@/access/UserAccessContext", () => ({
  useAccessPlan: () => useAccessPlan(),
  useAccessFeatures: () => useAccessFeatures(),
}));

const samplePreview: RoundSgPreview = {
  runId: "run-123",
  courseId: null,
  total_sg: -1.2,
  sg_by_cat: { TEE: -0.3, APPROACH: -0.9, SHORT: 0.2, PUTT: -0.2 },
  holes: [],
};

describe("QuickRoundCoachSection", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders recommendations for pro users", () => {
    useAccessPlan.mockReturnValue({ plan: "pro", loading: false, refresh: vi.fn() });
    useAccessFeatures.mockReturnValue({ hasPlanFeature: vi.fn().mockReturnValue(true) });

    render(
      <MemoryRouter>
        <QuickRoundCoachSection sgStatus="loaded" sgPreview={samplePreview} />
      </MemoryRouter>,
    );

    expect(screen.getByText("profile.coach.title")).toBeInTheDocument();
    expect(screen.getByText(/Focus on Approach shots/i)).toBeInTheDocument();
  });

  it("shows the upgrade gate for free users", () => {
    useAccessPlan.mockReturnValue({ plan: "free", loading: false, refresh: vi.fn() });
    useAccessFeatures.mockReturnValue({ hasPlanFeature: vi.fn().mockReturnValue(false) });

    render(
      <MemoryRouter>
        <QuickRoundCoachSection sgStatus="loaded" sgPreview={samplePreview} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/access.upgrade.title/i)).toBeInTheDocument();
  });
});
