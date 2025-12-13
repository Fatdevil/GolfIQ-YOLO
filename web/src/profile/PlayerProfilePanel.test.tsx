import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import type { PlayerProfile } from "@/api/profile";
import { PlayerProfilePanel } from "./PlayerProfilePanel";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const sampleProfile: PlayerProfile = {
  memberId: "member-1",
  model: {
    playerType: "Aggressive driver",
    style: "Power-first",
    strengths: [
      { category: "tee", title: "Tee shots are hot", description: "Gaining strokes", evidence: {} },
      { category: "putt", title: "Rock solid putting", description: "Smooth tempo", evidence: {} },
    ],
    weaknesses: [
      {
        category: "approach",
        severity: "critical",
        title: "Approach needs work",
        description: "Losing shots on distance control",
        evidence: {},
      },
      {
        category: "sequence",
        severity: "focus",
        title: "Sequence clean-up",
        description: "Upper body leading",
        evidence: {},
      },
    ],
    consistencyScore: 78,
    developmentIndex: 64,
    referenceRunId: "run-1",
  },
  plan: {
    focusCategories: ["approach", "sequence", "tee"],
    steps: [
      {
        week: 1,
        title: "Week 1 – Approach",
        description: "Dial wedges",
        focusCategory: "approach",
        suggestedMissions: ["approach_band_80_130"],
      },
      {
        week: 2,
        title: "Week 2 – Sequence",
        description: "Sequence drills",
        focusCategory: "sequence",
        suggestedMissions: [],
      },
      {
        week: 3,
        title: "Week 3 – Tee",
        description: "Keep driver in play",
        focusCategory: "tee",
        suggestedMissions: ["driver_fairway_challenge"],
      },
      {
        week: 4,
        title: "Week 4 – Consolidate",
        description: "Checkpoint round",
        focusCategory: "tee",
        suggestedMissions: [],
      },
    ],
  },
};

describe("PlayerProfilePanel", () => {
  it("renders strengths, weaknesses and plan steps", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PlayerProfilePanel profile={sampleProfile} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Aggressive driver/i)).toBeInTheDocument();
    expect(screen.getByText(/Tee shots are hot/i)).toBeInTheDocument();
    expect(screen.getByText(/Approach needs work/i)).toBeInTheDocument();

    const weekHeadings = screen.getAllByRole("heading", { level: 5 });
    expect(weekHeadings).toHaveLength(4);
  });

  it("navigates to mission when CTA is clicked", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PlayerProfilePanel profile={sampleProfile} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Start mission/i })[0]);
    expect(navigateMock).toHaveBeenCalledWith("/range/practice?missionId=approach_band_80_130");
  });
});
