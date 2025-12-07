import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SwingTimelinePanel from "./SwingTimelinePanel";

const mockFetchSessionTimeline = vi.fn();
const mockUseAccessPlan = vi.fn();

vi.mock("../api", () => ({
  fetchSessionTimeline: (...args: unknown[]) => mockFetchSessionTimeline(...args),
}));

vi.mock("@/access/UserAccessContext", () => ({
  useAccessPlan: () => mockUseAccessPlan(),
}));

vi.mock("@/access/UpgradeGate", () => ({
  UpgradeGate: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="upgrade-gate">{children}</div>
  ),
}));

describe("SwingTimelinePanel", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockFetchSessionTimeline.mockReset();
    mockUseAccessPlan.mockReset();
  });

  it("renders markers for pro users", async () => {
    mockUseAccessPlan.mockReturnValue({ isPro: true, loading: false });
    mockFetchSessionTimeline.mockResolvedValue({
      runId: "run-1",
      events: [
        { ts: 0.2, type: "impact", label: "Impact" },
        { ts: 0.4, type: "peak_hips", label: "Hips" },
      ],
    });

    render(<SwingTimelinePanel runId="run-1" />);

    await waitFor(() => expect(mockFetchSessionTimeline).toHaveBeenCalled());
    expect(await screen.findByText(/Impact/)).toBeInTheDocument();
    expect(screen.getByText(/Hips/)).toBeInTheDocument();
  });

  it("gates access for free users", async () => {
    mockUseAccessPlan.mockReturnValue({ isPro: false, loading: false });
    mockFetchSessionTimeline.mockResolvedValue({ runId: "run-1", events: [] });

    render(<SwingTimelinePanel runId="run-1" />);

    const gates = await screen.findAllByTestId("upgrade-gate");

    expect(gates.length).toBeGreaterThan(0);
  });

  it("handles missing access provider gracefully", async () => {
    mockUseAccessPlan.mockReturnValue(undefined as any);
    mockFetchSessionTimeline.mockResolvedValue({ runId: "run-1", events: [] });

    render(<SwingTimelinePanel runId="run-1" />);

    const gates = await screen.findAllByTestId("upgrade-gate");

    expect(gates.length).toBeGreaterThan(0);
  });

  it("shows an empty state when no events exist", async () => {
    mockUseAccessPlan.mockReturnValue({ isPro: true, loading: false });
    mockFetchSessionTimeline.mockResolvedValue({ runId: "run-1", events: [] });

    render(<SwingTimelinePanel runId="run-1" />);

    await waitFor(() => expect(mockFetchSessionTimeline).toHaveBeenCalled());
    const emptyState = await screen.findByRole("status");
    expect(emptyState).toHaveTextContent(/No timeline available for this round yet/i);
  });
});
