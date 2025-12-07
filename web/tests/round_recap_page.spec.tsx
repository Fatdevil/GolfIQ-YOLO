import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import QuickRoundPlayPage from "../src/pages/quick/QuickRoundPlayPage";
import { NotificationProvider } from "../src/notifications/NotificationContext";
import { QuickRound } from "../src/features/quickround/types";
import { UserSessionProvider } from "@/user/UserSessionContext";
import { fetchBagStats } from "@/api/bagStatsClient";
import * as bagReadiness from "@shared/caddie/bagReadiness";

const { loadRoundMock, saveRoundMock, loadBagMock } = vi.hoisted(() => ({
  loadRoundMock: vi.fn(),
  saveRoundMock: vi.fn(),
  loadBagMock: vi.fn(),
}));

vi.mock("../src/features/quickround/storage", () => ({
  loadRound: loadRoundMock,
  saveRound: saveRoundMock,
}));
vi.mock("@/api/bagStatsClient", () => ({
  fetchBagStats: vi.fn(),
}));
vi.mock("@/bag/storage", () => ({
  loadBag: loadBagMock,
}));
vi.mock("@/preferences/UnitsContext", () => ({
  useUnits: () => ({ unit: "metric", setUnit: vi.fn() }),
}));
vi.mock("@/user/UserSessionContext", () => ({
  UserSessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useUserSession: () => ({ session: { userId: "test-user", createdAt: "" }, loading: false }),
}));
vi.mock("@/user/historyApi", () => ({
  postQuickRoundSnapshots: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/access/PlanProvider", () => ({
  PlanProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePlan: () => ({ plan: "PRO", setPlan: vi.fn(), hasFeature: () => true }),
}));

const baseRound: QuickRound = {
  id: "qr-readiness",
  courseName: "Recap Course",
  holes: [
    { index: 1, par: 4 },
    { index: 2, par: 4 },
  ],
  startedAt: "2024-01-01T00:00:00.000Z",
  showPutts: true,
};

const recapBag = {
  updatedAt: 0,
  clubs: [
    { id: "9i", label: "9i", carry_m: 120 },
    { id: "7i", label: "7i", carry_m: 145 },
    { id: "5i", label: "5i", carry_m: 205 },
  ],
};

const recapStats = {
  "9i": { clubId: "9i", meanDistanceM: 122, sampleCount: 8 },
  "7i": { clubId: "7i", meanDistanceM: 148, sampleCount: 8 },
  "5i": { clubId: "5i", meanDistanceM: 215, sampleCount: 8 },
};

const getBagStatsMock = () => vi.mocked(fetchBagStats);

describe("Round recap bag readiness on web", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    const mockFetchBagStats = getBagStatsMock();
    mockFetchBagStats.mockReset();
    loadRoundMock.mockReturnValue(baseRound);
    loadBagMock.mockReturnValue(recapBag);
    mockFetchBagStats.mockResolvedValue(recapStats);
  });

  it("renders bag readiness recap info with suggestion", async () => {
    const mockFetchBagStats = getBagStatsMock();
    mockFetchBagStats.mockResolvedValue(recapStats);

    render(
      <UserSessionProvider>
        <NotificationProvider>
          <MemoryRouter initialEntries={["/play/qr-readiness"]}>
            <Routes>
              <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
            </Routes>
          </MemoryRouter>
        </NotificationProvider>
      </UserSessionProvider>,
    );

    expect(await screen.findByTestId("round-recap-bag-readiness")).toBeTruthy();
    expect(screen.getByText(/Bag readiness/i)).toBeTruthy();
    expect(screen.getByTestId("round-recap-bag-suggestion")).toBeTruthy();
  });

  it("links to the bag page from the recap panel", async () => {
    render(
      <UserSessionProvider>
        <NotificationProvider>
          <MemoryRouter initialEntries={["/play/qr-readiness"]}>
            <Routes>
              <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
            </Routes>
          </MemoryRouter>
        </NotificationProvider>
      </UserSessionProvider>,
    );

    const cta = await screen.findByTestId("round-recap-open-bag");
    expect(cta.getAttribute("href")).toBe("/bag");
  });

  it("hides the recap card when stats are unavailable", async () => {
    const mockFetchBagStats = getBagStatsMock();
    mockFetchBagStats.mockReset();
    mockFetchBagStats.mockResolvedValue(null as any);
    loadBagMock.mockReturnValue({ updatedAt: 0, clubs: [] });
    const recapSpy = vi.spyOn(bagReadiness, "buildBagReadinessRecapInfo").mockReturnValue(null);

    render(
      <UserSessionProvider>
        <NotificationProvider>
          <MemoryRouter initialEntries={["/play/qr-readiness"]}>
            <Routes>
              <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
            </Routes>
          </MemoryRouter>
        </NotificationProvider>
      </UserSessionProvider>,
    );

    await waitFor(() => expect(mockFetchBagStats).toHaveBeenCalled());
    expect(screen.queryByTestId("round-recap-bag-readiness")).toBeNull();
    recapSpy.mockRestore();
  });
});
