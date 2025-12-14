import { render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SwingDiagnosticsPanel from "./SwingDiagnosticsPanel";
import type { NormalisedSwingMetricsResponse } from "@/api";

const mockFetchSwingMetrics = vi.fn();

vi.mock("@/api", () => ({
  fetchSwingMetrics: (...args: unknown[]) => mockFetchSwingMetrics(...args),
}));

describe("SwingDiagnosticsPanel", () => {
  beforeEach(() => {
    mockFetchSwingMetrics.mockReset();
  });

  it("renders metrics with tour comparison", async () => {
    mockFetchSwingMetrics.mockResolvedValue({
      runId: "run-1",
      club: "Driver",
      metrics: {
        max_shoulder_rotation: { value: 78.2, units: "°" },
        max_x_factor: { value: 42.5, units: "°" },
        launch_deg: { value: 14.2, units: "°" },
        sideAngleDeg: { value: -2.1, units: "°" },
      },
      tourCompare: {
        max_shoulder_rotation: { bandGroup: "driver", status: "below", rangeMin: 80, rangeMax: 100 },
        max_x_factor: { bandGroup: "driver", status: "in_range", rangeMin: 30, rangeMax: 50 },
        launch_deg: { bandGroup: "driver", status: "above", rangeMin: 10, rangeMax: 13 },
      },
    });

    render(<SwingDiagnosticsPanel runId="run-1" />);

    await waitFor(() => expect(mockFetchSwingMetrics).toHaveBeenCalled());

    expect(await screen.findByText(/Shoulder rotation/)).toBeInTheDocument();
    expect(screen.getByText(/78\.2/)).toBeInTheDocument();
    expect(screen.getByText(/Below tour range/)).toBeInTheDocument();
    expect(screen.getByText(/Tour range 80\.0–100\.0/)).toBeInTheDocument();

    expect(screen.getByText("X-factor (shoulders vs hips)")).toBeInTheDocument();
    expect(screen.getByText(/Within tour range/)).toBeInTheDocument();

    expect(screen.getByText(/Launch angle/)).toBeInTheDocument();
    expect(screen.getByText(/Above tour range/)).toBeInTheDocument();

    expect(screen.getByText(/Side angle/)).toBeInTheDocument();
    expect(screen.getAllByText(/No tour ref/).length).toBeGreaterThan(0);
  });

  it("shows loading state before data arrives", async () => {
    let resolveFn!: (value: NormalisedSwingMetricsResponse) => void;
    const pending = new Promise<NormalisedSwingMetricsResponse>((resolve) => {
      resolveFn = resolve;
    });
    mockFetchSwingMetrics.mockReturnValue(pending);

    const { container } = render(<SwingDiagnosticsPanel runId="run-loading" />);

    expect(screen.getAllByText(/Swing diagnostics/).length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);

    resolveFn({ runId: "run-loading", metrics: {}, tourCompare: {} });
    await waitFor(() => expect(mockFetchSwingMetrics).toHaveBeenCalled());
  });

  it("renders an empty message when no metrics exist", async () => {
    mockFetchSwingMetrics.mockResolvedValue({ runId: "run-empty", metrics: {}, tourCompare: {} });

    const view = render(<SwingDiagnosticsPanel runId="run-empty" />);

    const empty = await within(view.container).findByTestId("swing-diagnostics-empty");

    expect(within(empty).getByText(/No swing metrics available/)).toBeInTheDocument();
    expect(within(view.container).queryByText(/Tour range/)).not.toBeInTheDocument();
  });

  it("shows error state and allows retry", async () => {
    mockFetchSwingMetrics.mockRejectedValueOnce(new Error("API offline"));
    mockFetchSwingMetrics.mockResolvedValueOnce({ runId: "run-1", metrics: {}, tourCompare: {} });

    render(<SwingDiagnosticsPanel runId="run-1" />);

    expect(await screen.findByText(/Swing diagnostics unavailable/)).toBeInTheDocument();

    screen.getByText(/Retry/).click();

    await waitFor(() => expect(mockFetchSwingMetrics).toHaveBeenCalledTimes(2));
  });
});
