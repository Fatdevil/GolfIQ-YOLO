import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import type { CoachDiagnosis } from "@/api/coachSummary";
import { CoachDiagnosisCard } from "./CoachDiagnosisCard";

describe("CoachDiagnosisCard", () => {
  const sampleDiagnosis: CoachDiagnosis = {
    run_id: "run-1",
    findings: [
      {
        id: "tee_inconsistency",
        category: "tee",
        severity: "critical",
        title: "Tee game is costing you strokes",
        message: "Lots of errant tee shots",
        suggested_missions: ["driver_fairway_challenge"],
      },
      {
        id: "short_game_leak",
        category: "short",
        severity: "warning",
        title: "Short game leak",
        message: "Short game needs work",
      },
    ],
  };

  it("renders findings and mission links", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CoachDiagnosisCard diagnosis={sampleDiagnosis} status="ready" />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Coach diagnosis/i)).toBeInTheDocument();
    expect(screen.getByText(/Tee game is costing you strokes/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start Driver fairway challenge/i })).toBeInTheDocument();
  });

  it("shows empty state when no findings", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CoachDiagnosisCard
          diagnosis={{ run_id: "run-2", findings: [] }}
          status="ready"
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/No major issues detected – keep doing what you’re doing/i),
    ).toBeInTheDocument();
  });
});

