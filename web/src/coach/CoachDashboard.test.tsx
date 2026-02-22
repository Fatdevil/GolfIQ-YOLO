import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PlayerSessionListItem, SessionSummary } from "@/coach/api";
import { CoachDashboard } from "@/coach/CoachDashboard";

const sampleSessions: PlayerSessionListItem[] = [
  {
    sessionId: "sess-2",
    userId: "player-1",
    startedAt: "2025-02-02T10:00:00Z",
    endedAt: "2025-02-02T10:20:00Z",
    totalShots: 12,
    onTargetShots: 9,
    onTargetPercent: 75,
  },
  {
    sessionId: "sess-1",
    userId: "player-1",
    startedAt: "2025-01-01T08:00:00Z",
    endedAt: "2025-01-01T08:15:00Z",
    totalShots: 8,
    onTargetShots: 5,
    onTargetPercent: 62.5,
  },
];

describe("CoachDashboard", () => {
  it("renders session list for selected player", async () => {
    const fetchSessions = vi.fn().mockResolvedValue(sampleSessions);

    render(
      <CoachDashboard
        selectedPlayerId="player-1"
        sessionFetcher={fetchSessions}
        sessionSummaryFetcher={vi.fn()}
      />,
    );

    expect(screen.getByText(/Loading sessions/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchSessions).toHaveBeenCalled();
    });

    expect(screen.getByText(/2025-02-02 10:00/)).toBeInTheDocument();
    expect(screen.getByText("12 shots")).toBeInTheDocument();
    expect(screen.getByText("9 on-target")).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.replace(/\s+/g, " ").includes("75.0%")),
    ).toBeInTheDocument();
  });

  it("loads session details when a row is clicked", async () => {
    const fetchSessions = vi.fn().mockResolvedValue(sampleSessions);
    const summary: SessionSummary = {
      sessionId: "sess-2",
      userId: "player-1",
      startedAt: "2025-02-02T10:00:00Z",
      endedAt: "2025-02-02T10:20:00Z",
      totalShots: 12,
      onTargetShots: 9,
      onTargetPercent: 75,
    };
    const fetchSummary = vi.fn().mockResolvedValue(summary);

    render(
      <CoachDashboard
        selectedPlayerId="player-1"
        sessionFetcher={fetchSessions}
        sessionSummaryFetcher={fetchSummary}
      />,
    );

    const row = await screen.findByTestId("session-sess-2");
    fireEvent.click(row);

    await waitFor(() => {
      expect(fetchSummary).toHaveBeenCalledWith(expect.any(String), "sess-2");
    });

    await screen.findByText(/Total shots/i);
    expect(screen.getByText("12")).toBeInTheDocument();
    const accuracyValues = screen.getAllByText("75.0%");
    expect(accuracyValues.length).toBeGreaterThan(0);
  });

  it("shows empty state when there are no sessions", async () => {
    const fetchSessions = vi.fn().mockResolvedValue([]);

    render(
      <CoachDashboard
        selectedPlayerId="player-empty"
        sessionFetcher={fetchSessions}
        sessionSummaryFetcher={vi.fn()}
      />,
    );

    await screen.findByText(/No sessions recorded/i);
  });

  it("surfaces errors from the session list", async () => {
    const fetchSessions = vi.fn().mockRejectedValue(new Error("boom"));

    render(
      <CoachDashboard
        selectedPlayerId="player-err"
        sessionFetcher={fetchSessions}
        sessionSummaryFetcher={vi.fn()}
      />,
    );

    await screen.findByText(/Unable to load sessions/i);
  });
});
