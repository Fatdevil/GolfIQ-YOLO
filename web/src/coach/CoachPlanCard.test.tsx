import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CoachRecommendation } from "./coachLogic";
import { CoachPlanCard } from "./CoachPlanCard";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

const recs: CoachRecommendation[] = [
  {
    focusCategory: "approach",
    reason: "Focus on Approach shots — you lost 1.0 strokes vs the baseline.",
    rangeMission: { type: "range", description: "Hit wedges" },
    onCourseMission: { type: "on-course", description: "Aim for the middle" },
  },
];

describe("CoachPlanCard", () => {
  it("renders recommendations when ready", () => {
    render(<CoachPlanCard status="ready" recommendations={recs} />);

    expect(screen.getByText("profile.coach.title")).toBeInTheDocument();
    expect(screen.getByText(/Focus on Approach shots/i)).toBeInTheDocument();
    expect(screen.getByText(/Range:/i)).toBeInTheDocument();
    expect(screen.getByText(/On-course:/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /profile.coach.cta.range/i })).toHaveAttribute(
      "href",
      "/range/practice?missionId=approach_band_80_130",
    );
  });

  it("shows empty state when no data is available", () => {
    render(<CoachPlanCard status="empty" recommendations={[]} />);

    expect(screen.getByText("profile.coach.empty")).toBeInTheDocument();
  });
});
