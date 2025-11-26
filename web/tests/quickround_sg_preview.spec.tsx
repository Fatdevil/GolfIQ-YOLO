import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import QuickRoundPlayPage from "../src/pages/quick/QuickRoundPlayPage";
import { NotificationProvider } from "../src/notifications/NotificationContext";
import type { QuickRound } from "@/features/quickround/types";
import { UserSessionProvider } from "@/user/UserSessionContext";
import { postQuickRoundSnapshots } from "@/user/historyApi";

const { loadRoundMock, saveRoundMock, fetchSgPreviewMock } = vi.hoisted(() => ({
  loadRoundMock: vi.fn(),
  saveRoundMock: vi.fn(),
  fetchSgPreviewMock: vi.fn(),
}));

const mockedPostQuickRoundSnapshots = vi.mocked(postQuickRoundSnapshots);

vi.mock("../src/features/quickround/storage", () => ({
  loadRound: loadRoundMock,
  saveRound: saveRoundMock,
}));

vi.mock("@/api/sgPreview", () => ({
  fetchSgPreview: (...args: Parameters<typeof fetchSgPreviewMock>) =>
    fetchSgPreviewMock(...args),
}));

vi.mock("@/user/historyApi", () => ({
  postQuickRoundSnapshots: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/user/UserSessionContext", () => ({
  UserSessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useUserSession: () => ({ session: { userId: "test-user", createdAt: "" }, loading: false }),
}));
vi.mock("@/access/PlanProvider", () => ({
  PlanProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePlan: () => ({ plan: "PRO", setPlan: vi.fn(), hasFeature: () => true }),
}));

describe("QuickRound SG preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPostQuickRoundSnapshots.mockReset();
  });

  it("renders SG preview when data loads", async () => {
    const round: QuickRound = {
      id: "qr-sg",
      runId: "run-123",
      courseName: "Preview Course",
      holes: [
        { index: 1, par: 4, strokes: 4 },
        { index: 2, par: 3, strokes: 3 },
      ],
      startedAt: "2024-06-01T10:00:00.000Z",
      completedAt: "2024-06-01T13:00:00.000Z",
      showPutts: true,
    };
    loadRoundMock.mockReturnValueOnce(round);
    fetchSgPreviewMock.mockResolvedValue({
      runId: "run-123",
      courseId: "course-1",
      total_sg: 0.7,
      sg_by_cat: { TEE: -0.5, APPROACH: 0.4, SHORT: 0.0, PUTT: 0.8 },
      holes: [],
    });

    render(
      <UserSessionProvider>
        <NotificationProvider>
          <MemoryRouter initialEntries={["/play/qr-sg"]}>
            <Routes>
              <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
            </Routes>
          </MemoryRouter>
        </NotificationProvider>
      </UserSessionProvider>
    );

    const headers = await screen.findAllByText(/Strokes Gained preview/i);
    expect(headers.length).toBeGreaterThan(0);
    await waitFor(() => expect(fetchSgPreviewMock).toHaveBeenCalledWith("run-123"));
    expect(screen.getByText(/Total SG \(vs baseline\): \+0\.7/i)).toBeTruthy();
    expect(screen.getByText(/Tee: -0.5/i)).toBeTruthy();
    expect(screen.getByText(/Putting: \+0.8/i)).toBeTruthy();
  });

  it("shows error state when fetching fails", async () => {
    const round: QuickRound = {
      id: "qr-sg-error",
      runId: "run-error",
      courseName: "Preview Course",
      holes: [{ index: 1, par: 4, strokes: 5 }],
      startedAt: "2024-06-02T10:00:00.000Z",
      completedAt: "2024-06-02T12:00:00.000Z",
      showPutts: true,
    };
    loadRoundMock.mockReturnValueOnce(round);
    fetchSgPreviewMock.mockRejectedValueOnce(new Error("boom"));

    render(
      <UserSessionProvider>
        <NotificationProvider>
          <MemoryRouter initialEntries={["/play/qr-sg-error"]}>
            <Routes>
              <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
            </Routes>
          </MemoryRouter>
        </NotificationProvider>
      </UserSessionProvider>
    );

    const headers = await screen.findAllByText(/Strokes Gained preview/i);
    expect(headers.length).toBeGreaterThan(0);
    await waitFor(() => expect(fetchSgPreviewMock).toHaveBeenCalled());
    expect(
      await screen.findByText(/Could not load SG preview for this round/i)
    ).toBeTruthy();
  });
});

