import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RunDetailPage from "./RunDetail";

const mockGetRun = vi.fn();
const mockGetRemoteConfig = vi.fn();
const mockFetchSessionTimeline = vi.fn();
const mockFetchSwingMetrics = vi.fn();

vi.mock("../api", () => ({
  getRun: (...args: unknown[]) => mockGetRun(...args),
  getRemoteConfig: (...args: unknown[]) => mockGetRemoteConfig(...args),
  fetchSessionTimeline: (...args: unknown[]) => mockFetchSessionTimeline(...args),
  fetchSwingMetrics: (...args: unknown[]) => mockFetchSwingMetrics(...args),
  postTelemetryEvent: vi.fn(),
}));

const mockUseAccessPlan = vi.fn();

vi.mock("@/access/UserAccessContext", () => ({
  useAccessPlan: () => mockUseAccessPlan(),
  useAccessFeatures: () => ({ hasPlanFeature: () => false }),
}));

vi.mock("@/access/UpgradeGate", () => ({
  UpgradeGate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="upgrade-gate">
      {children}
      <span>Upgrade required</span>
    </div>
  ),
}));

vi.mock("../components/TracerCanvas", () => ({ default: () => <div data-testid="tracer" /> }));
vi.mock("../components/GhostFrames", () => ({ default: () => <div data-testid="ghost" /> }));
vi.mock("../components/ExportPanel", () => ({
  default: () => <div data-testid="export-panel" />,
}));
vi.mock("../components/PlaysLikePanel", () => ({
  default: () => <div data-testid="playslike" />,
}));
vi.mock("@web/media/useSignedVideoSource", () => ({
  useSignedVideoSource: () => ({ url: null, path: null, signed: false, exp: null, loading: false }),
}));
vi.mock("@web/media/telemetry", () => ({ useMediaPlaybackTelemetry: () => {} }));
vi.mock("@web/player/seek", () => ({ openAndSeekTo: vi.fn() }));
vi.mock("@web/features/runs/ShotList", () => ({
  ShotList: () => <div data-testid="shot-list" />,
}));
vi.mock("@web/sg/TopSGShotsPanel", () => ({
  TopSGShotsPanel: () => <div data-testid="sg-panel" />,
}));
vi.mock("@web/sg/visibility", () => ({ isClipVisible: () => true }));

const sequencePayload = {
  max_shoulder_rotation: 40,
  max_hip_rotation: 30,
  max_x_factor: 10,
  shoulder_peak_frame: 3,
  hip_peak_frame: 2,
  x_factor_peak_frame: 3,
  sequence_order: { peak_order: ["hips", "shoulders", "arms", "club"], is_ideal: true },
};

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={["/runs/demo"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/runs/:id" element={<RunDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RunDetailPage sequence preview", () => {
  beforeEach(() => {
    mockGetRun.mockReset();
    mockGetRemoteConfig.mockReset();
    mockFetchSessionTimeline.mockReset();
    mockFetchSwingMetrics.mockReset();
    mockUseAccessPlan.mockReset();
    mockGetRemoteConfig.mockResolvedValue({ playslike: { enabled: false, variant: "off" } });
    mockFetchSessionTimeline.mockResolvedValue({ runId: "demo", events: [] });
    mockFetchSwingMetrics.mockResolvedValue({ runId: "demo", metrics: {}, tourCompare: {} });
  });

  it("renders sequence card for pro users", async () => {
    mockUseAccessPlan.mockReturnValue({ plan: "pro", isPro: true, loading: false, refresh: vi.fn() });
    mockGetRun.mockResolvedValue({ run_id: "demo", metrics: { sequence: sequencePayload }, events: [] });

    renderPage();

    await waitFor(() => expect(mockGetRun).toHaveBeenCalled());
    expect(await screen.findByText(/Kinematic sequence/)).toBeInTheDocument();
    expect(screen.queryByTestId("upgrade-gate")).toBeNull();
  });

  it("gates sequence card for free users", async () => {
    mockUseAccessPlan.mockReturnValue({ plan: "free", isPro: false, loading: false, refresh: vi.fn() });
    mockGetRun.mockResolvedValue({ run_id: "demo", metrics: { sequence: sequencePayload }, events: [] });

    renderPage();

    await waitFor(() => expect(mockGetRun).toHaveBeenCalled());
    const gates = await screen.findAllByTestId("upgrade-gate");
    expect(gates.length).toBeGreaterThan(0);
  });
});
