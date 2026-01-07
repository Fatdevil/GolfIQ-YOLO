import React, { act, useEffect } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RunsDashboardPage, { SEARCH_DEBOUNCE_MS, buildPrunePayload } from "./RunsDashboard";

const mockListRunsV1 = vi.fn();
const mockPruneRunsV1 = vi.fn();

vi.mock("@/api/runsV1", () => ({
  listRunsV1: (...args: unknown[]) => mockListRunsV1(...args),
  pruneRunsV1: (...args: unknown[]) => mockPruneRunsV1(...args),
  resolveRunsError: (err: unknown) => ({ message: String(err) }),
}));

vi.mock("./RunDetailPanel", () => ({
  __esModule: true,
  default: ({ runId, onClose }: { runId: string | null; onClose: () => void }) => (
    <div data-testid="run-detail">
      Run detail {runId}
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

function LocationSpy({ onChange }: { onChange: (location: ReturnType<typeof useLocation>) => void }) {
  const location = useLocation();
  useEffect(() => onChange(location), [location, onChange]);
  return null;
}

function NavigationSpy({ onReady }: { onReady: (navigate: ReturnType<typeof useNavigate>) => void }) {
  const navigate = useNavigate();
  useEffect(() => onReady(navigate), [navigate, onReady]);
  return null;
}

function renderPage(props?: {
  initialCursor?: string | null;
  onControls?: (controls: { setCursor: (cursor: string | null) => void }) => void;
  initialEntries?: string[];
  onLocation?: (location: ReturnType<typeof useLocation>) => void;
}): { getSearch: () => string; navigate: (delta: number) => void } & ReturnType<typeof render> {
  const onLocation = props?.onLocation ?? (() => {});
  let latestSearch = "";
  let navigateFn: ReturnType<typeof useNavigate> | null = null;
  const utils = render(
    <MemoryRouter initialEntries={props?.initialEntries ?? ["/admin/runs"]}>
      <NavigationSpy onReady={(nav) => (navigateFn = nav)} />
      <LocationSpy
        onChange={(loc) => {
          latestSearch = loc.search;
          onLocation(loc);
        }}
      />
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
  return {
    getSearch: () => latestSearch,
    navigate: (delta: number) => navigateFn?.(delta),
    ...utils,
  };
}

describe("RunsDashboardPage", () => {
  beforeEach(() => {
    mockListRunsV1.mockReset();
    mockPruneRunsV1.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
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

  it("restores URL query parameters into UI state and opens detail panel", async () => {
    mockListRunsV1.mockResolvedValue({
      items: [
        {
          run_id: "run-2",
          status: "failed",
          kind: "video",
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-01T00:00:00Z",
          override_source: "header",
          source: "test",
          source_type: "video",
          error_code: "E1",
        },
      ],
      next_cursor: null,
    });

    const locations: string[] = [];

    renderPage({
      initialEntries: ["/admin/runs?q=run&status=failed&sort=duration&dir=asc&runId=run-2"],
      onLocation: (loc) => locations.push(loc.search),
    });

    await screen.findByText("run-2");
    expect(screen.getByTestId("runs-search-input")).toHaveValue("run");
    expect((screen.getByTestId("runs-status-filter") as HTMLSelectElement).value).toBe("failed");
    expect(await screen.findByTestId("run-detail")).toHaveTextContent("run-2");
    expect(locations[locations.length - 1]).toContain("runId=run-2");
  });

  it("updates the URL and opens the detail panel when a run is selected", async () => {
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

    const { getSearch } = renderPage();

    await screen.findByText("run-1");
    screen.getByTestId("run-row-run-1").click();

    await waitFor(() => expect(getSearch()).toContain("runId=run-1"));
    expect(screen.getByTestId("run-detail")).toHaveTextContent("run-1");
  });

  it("clears runId but keeps other state when the detail panel is closed", async () => {
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

    const { getSearch } = renderPage({ initialEntries: ["/admin/runs?q=run"] });

    await screen.findByText("run-1");
    screen.getByTestId("run-row-run-1").click();
    await waitFor(() => expect(getSearch()).toContain("runId=run-1"));

    screen.getByText("Close").click();

    await waitFor(() => expect(getSearch()).not.toContain("runId="));
    expect(getSearch()).toContain("q=run");
  });

  it("restores run selection when navigating back and forward", async () => {
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
        {
          run_id: "run-2",
          status: "failed",
          kind: "image",
          created_at: "2025-01-02T00:00:00Z",
          updated_at: "2025-01-02T00:00:00Z",
          override_source: "header",
          source: "test",
          source_type: "image",
        },
      ],
      next_cursor: null,
    });

    const { getSearch, navigate } = renderPage();

    await screen.findByText("run-1");

    screen.getByTestId("run-row-run-1").click();
    await waitFor(() => expect(getSearch()).toContain("runId=run-1"));

    screen.getByTestId("run-row-run-2").click();
    await waitFor(() => expect(getSearch()).toContain("runId=run-2"));

    act(() => navigate(-1));
    await waitFor(() => expect(screen.getByTestId("run-detail")).toHaveTextContent("run-1"));

    act(() => navigate(1));
    await waitFor(() => expect(screen.getByTestId("run-detail")).toHaveTextContent("run-2"));
  });

  it("debounces search query updates before touching the URL", async () => {
    mockListRunsV1.mockResolvedValue({
      items: [],
      next_cursor: null,
    });

    const { getSearch } = renderPage();
    const input = await screen.findByTestId("runs-search-input");

    await waitFor(() => expect(mockListRunsV1).toHaveBeenCalled());

    act(() => {
      fireEvent.change(input, { target: { value: "abc" } });
    });

    expect(getSearch()).not.toContain("q=abc");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS - 50));
    });

    expect(getSearch()).not.toContain("q=abc");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    await waitFor(() => expect(getSearch()).toContain("q=abc"));
  });

  it("does not overwrite other URL params when the debounced search resolves", async () => {
    mockListRunsV1.mockResolvedValue({
      items: [
        {
          run_id: "run-1",
          status: "processing",
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

    const { getSearch } = renderPage();
    const input = await screen.findByTestId("runs-search-input");
    const statusFilter = screen.getByTestId("runs-status-filter");

    act(() => {
      fireEvent.change(input, { target: { value: "abc" } });
    });

    act(() => {
      fireEvent.change(statusFilter, { target: { value: "failed" } });
    });

    expect(getSearch()).toContain("status=failed");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 50));
    });

    expect(getSearch()).toContain("status=failed");
    expect(getSearch()).toContain("q=abc");
  });

  it("preserves newer status filters when the debounced search sync completes", async () => {
    vi.useFakeTimers();
    mockListRunsV1.mockResolvedValue({
      items: [
        {
          run_id: "run-1",
          status: "processing",
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

    const { getSearch } = renderPage({ initialEntries: ["/admin/runs?status=processing"] });
    const input = screen.getByTestId("runs-search-input");
    const statusFilter = screen.getByTestId("runs-status-filter");

    act(() => {
      fireEvent.change(input, { target: { value: "abc" } });
    });

    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS / 2);
    });

    act(() => {
      fireEvent.change(statusFilter, { target: { value: "failed" } });
    });

    expect(getSearch()).toContain("status=failed");

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(getSearch()).toContain("status=failed");
    expect(getSearch()).toContain("q=abc");
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
