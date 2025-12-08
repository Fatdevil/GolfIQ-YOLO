import { Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import QuickRoundPlayPage from "../src/pages/quick/QuickRoundPlayPage";
import { QuickRound } from "../src/features/quickround/types";
import { fetchBagStats } from "@/api/bagStatsClient";
import { QuickRoundTestProviders } from "./helpers/quickroundProviders";
import * as bagReadiness from "@shared/caddie/bagReadiness";
import { loadPracticeMissionHistory } from "@/practice/practiceMissionHistory";
import { getTopPracticeRecommendationForRecap } from "@shared/caddie/bagPracticeRecommendations";

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
vi.mock("@/practice/practiceMissionHistory", () => ({
  loadPracticeMissionHistory: vi.fn(),
}));
vi.mock("@shared/caddie/bagPracticeRecommendations", () => ({
  getTopPracticeRecommendationForRecap: vi.fn(),
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

const sampleRecommendation = {
  id: "practice_fill_gap:7i:9i",
  titleKey: "bag.practice.fill_gap.title",
  descriptionKey: "bag.practice.fill_gap.description",
  targetClubs: ["7i", "9i"],
  sourceSuggestionId: "fill_gap:7i:9i",
  status: "due",
  priorityScore: 5,
  lastCompletedAt: null,
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
    vi.mocked(loadPracticeMissionHistory).mockResolvedValue([]);
    vi.mocked(getTopPracticeRecommendationForRecap).mockReturnValue(null as any);
  });

  it("renders bag readiness recap info with suggestion", async () => {
    const mockFetchBagStats = getBagStatsMock();
    mockFetchBagStats.mockResolvedValue(recapStats);

    render(
      <QuickRoundTestProviders initialEntries={["/play/qr-readiness"]}>
        <Routes>
          <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
        </Routes>
      </QuickRoundTestProviders>,
    );

    expect(await screen.findByTestId("round-recap-bag-readiness")).toBeTruthy();
    expect(screen.getByText(/Bag readiness/i)).toBeTruthy();
    expect(screen.getByTestId("round-recap-bag-suggestion")).toBeTruthy();
  });

  it("links to the bag page from the recap panel", async () => {
    render(
      <QuickRoundTestProviders initialEntries={["/play/qr-readiness"]}>
        <Routes>
          <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
        </Routes>
      </QuickRoundTestProviders>,
    );

    const cta = await screen.findByTestId("round-recap-open-bag");
    expect(cta.getAttribute("href")).toBe("/bag");
  });

  it("renders next practice mission when available", async () => {
    vi.mocked(getTopPracticeRecommendationForRecap).mockReturnValue(sampleRecommendation as any);

    render(
      <QuickRoundTestProviders initialEntries={["/play/qr-readiness"]}>
        <Routes>
          <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
        </Routes>
      </QuickRoundTestProviders>,
    );

    expect(await screen.findByTestId("round-recap-practice-recommendation")).toBeTruthy();
    expect(screen.getByText(/Next practice mission/i)).toBeTruthy();
    expect(screen.getByTestId("round-recap-practice-recommendation").textContent).toContain("7i");
    const cta = screen.getByTestId("round-recap-practice-cta");
    expect(cta.getAttribute("href")).toContain("/range/practice");
  });

  it("hides the practice recommendation when none is available", async () => {
    vi.mocked(getTopPracticeRecommendationForRecap).mockReturnValue(null as any);

    render(
      <QuickRoundTestProviders initialEntries={["/play/qr-readiness"]}>
        <Routes>
          <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
        </Routes>
      </QuickRoundTestProviders>,
    );

    expect(await screen.findByTestId("round-recap-bag-readiness")).toBeTruthy();
    expect(screen.queryByTestId("round-recap-practice-recommendation")).toBeNull();
  });

  it("hides the recap card when stats are unavailable", async () => {
    const mockFetchBagStats = getBagStatsMock();
    mockFetchBagStats.mockReset();
    mockFetchBagStats.mockResolvedValue(null as any);
    loadBagMock.mockReturnValue({ updatedAt: 0, clubs: [] });
    const recapSpy = vi.spyOn(bagReadiness, "buildBagReadinessRecapInfo").mockReturnValue(null);

    render(
      <QuickRoundTestProviders initialEntries={["/play/qr-readiness"]}>
        <Routes>
          <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
        </Routes>
      </QuickRoundTestProviders>,
    );

    await waitFor(() => expect(mockFetchBagStats).toHaveBeenCalled());
    expect(screen.queryByTestId("round-recap-bag-readiness")).toBeNull();
    recapSpy.mockRestore();
  });
});
