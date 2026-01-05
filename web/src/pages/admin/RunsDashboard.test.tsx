import React from "react";
import { act } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RunsDashboardPage, { buildPrunePayload } from "./RunsDashboard";

const mockListRunsV1 = vi.fn();
const mockPruneRunsV1 = vi.fn();

vi.mock("@/api/runsV1", () => ({
  listRunsV1: (...args: unknown[]) => mockListRunsV1(...args),
  pruneRunsV1: (...args: unknown[]) => mockPruneRunsV1(...args),
  resolveRunsError: (err: unknown) => ({ message: String(err) }),
}));

function renderPage(props?: {
  initialCursor?: string | null;
  onControls?: (controls: { setCursor: (cursor: string | null) => void }) => void;
}) {
  return render(
    <MemoryRouter initialEntries={["/admin/runs"]}>
      <Routes>
        <Route
          path="/admin/runs"
          element={
            <RunsDashboardPage initialCursor={props?.initialCursor} debugControls={props?.onControls} />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RunsDashboardPage", () => {
  beforeEach(() => {
    mockListRunsV1.mockReset();
    mockPruneRunsV1.mockReset();
  });

  it("renders runs from the list endpoint", async () => {
    mockListRunsV1.mockResolvedValue({
      items: [
        {
          run_id: "run-1",
          status: "succeeded",
          kind: "video",
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-01T00:00:00Z",
          override_source: "header",
          source: "test",
          source_type: "video",
        },
      ],
      next_cursor: null,
    });

    renderPage({ initialCursor: "cursor-1" });

    expect(await screen.findByText("run-1")).toBeInTheDocument();
    expect(mockListRunsV1).toHaveBeenCalled();
  });

  it("uses cursor pagination when Next is clicked", async () => {
    mockListRunsV1.mockResolvedValueOnce({
      items: [
        {
          run_id: "run-1",
          status: "succeeded",
          kind: "video",
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-01T00:00:00Z",
          override_source: "header",
          source: "test",
          source_type: "video",
        },
      ],
      next_cursor: "cursor-1",
    });
    mockListRunsV1.mockResolvedValueOnce({
      items: [],
      next_cursor: null,
    });

    let controls: { setCursor: (cursor: string | null) => void } | null = null;
    renderPage({
      onControls: (c) => {
        controls = c;
      },
    });

    await screen.findByText("run-1");
    await waitFor(() => expect(mockListRunsV1).toHaveBeenCalledTimes(1));

    act(() => controls?.setCursor("cursor-1"));

    await waitFor(() => expect(mockListRunsV1).toHaveBeenCalledTimes(2));
    expect(mockListRunsV1.mock.calls[1][0]).toMatchObject({ cursor: "cursor-1" });
  });
});

describe("buildPrunePayload", () => {
  it("omits invalid numbers to avoid NaN payloads", () => {
    const { payload, errors } = buildPrunePayload("not-a-number", "30");

    expect(errors.maxRuns).toBeDefined();
    expect(payload).toEqual({ max_age_days: 30 });
  });

  it("passes through valid numeric inputs", () => {
    const { payload, errors } = buildPrunePayload("10", "5");

    expect(errors).toEqual({});
    expect(payload).toEqual({ max_runs: 10, max_age_days: 5 });
  });
});
