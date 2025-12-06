import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import QuickRoundPlayPage from "../src/pages/quick/QuickRoundPlayPage";
import { NotificationProvider } from "../src/notifications/NotificationContext";
import { QuickRound } from "../src/features/quickround/types";
import { UserSessionProvider } from "@/user/UserSessionContext";
import { postQuickRoundSnapshots } from "@/user/historyApi";

const { loadRoundMock, saveRoundMock } = vi.hoisted(() => ({
  loadRoundMock: vi.fn(),
  saveRoundMock: vi.fn(),
}));

const mockedPostQuickRoundSnapshots = vi.mocked(postQuickRoundSnapshots);

vi.mock("../src/features/quickround/storage", () => ({
  loadRound: loadRoundMock,
  saveRound: saveRoundMock,
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

describe("QuickRoundPlayPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPostQuickRoundSnapshots.mockReset();
  });

  it("updates strokes and saves round", async () => {
    const round: QuickRound = {
      id: "qr-123",
      courseName: "Test Course",
      holes: [
        { index: 1, par: 4 },
        { index: 2, par: 4 },
        { index: 3, par: 4 },
      ],
      startedAt: "2024-05-01T12:00:00.000Z",
      showPutts: true,
    };
    loadRoundMock.mockReturnValueOnce(round);
    const user = userEvent.setup();

    render(
      <UserSessionProvider>
        <NotificationProvider>
          <MemoryRouter initialEntries={["/play/qr-123"]}>
            <Routes>
              <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
            </Routes>
          </MemoryRouter>
        </NotificationProvider>
      </UserSessionProvider>
    );

    const strokesInput = await screen.findByLabelText("Slag hål 1");
    await user.clear(strokesInput);
    await user.type(strokesInput, "5");

    expect(saveRoundMock).toHaveBeenCalled();
    const savedRound = saveRoundMock.mock.calls.at(-1)?.[0] as QuickRound;
    expect(savedRound.holes[0].strokes).toBe(5);
  });

  it("shows course layout par and yardage for current hole", async () => {
    const round: QuickRound = {
      id: "qr-456",
      courseId: "demo-links-hero",
      courseName: "Demo Links Hero",
      holes: [
        { index: 1, par: 4 },
        { index: 2, par: 4 },
      ],
      startedAt: "2024-05-02T12:00:00.000Z",
      showPutts: true,
    };

    loadRoundMock.mockReturnValueOnce(round);

    render(
      <UserSessionProvider>
        <NotificationProvider>
          <MemoryRouter initialEntries={["/play/qr-456"]}>
            <Routes>
              <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
            </Routes>
          </MemoryRouter>
        </NotificationProvider>
      </UserSessionProvider>
    );

    expect(await screen.findByText(/Par 4/)).toBeTruthy();
    expect(screen.getByText(/360 m/)).toBeTruthy();
  });

  it("renders caddie targets for the current hole", async () => {
    const round: QuickRound = {
      id: "qr-457",
      courseId: "demo-links-hero",
      courseName: "Demo Links Hero",
      holes: [
        { index: 1, par: 4 },
        { index: 2, par: 4 },
      ],
      startedAt: "2024-05-02T12:00:00.000Z",
      showPutts: true,
    };

    loadRoundMock.mockReturnValueOnce(round);

    render(
      <UserSessionProvider>
        <NotificationProvider>
          <MemoryRouter initialEntries={["/play/qr-457"]}>
            <Routes>
              <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
            </Routes>
          </MemoryRouter>
        </NotificationProvider>
      </UserSessionProvider>
    );

    const caddieHeadings = await screen.findAllByText(/Caddie Targets/);
    expect(caddieHeadings.length).toBeGreaterThan(0);
    const layupTargets = await screen.findAllByText(/Layup: 216 m from tee/);
    expect(layupTargets.length).toBeGreaterThan(0);
    const greenTargets = await screen.findAllByText(/Green: Center of green/);
    expect(greenTargets.length).toBeGreaterThan(0);
  });

  it("marks round as completed", async () => {
    const round: QuickRound = {
      id: "qr-999",
      courseName: "Finish Course",
      holes: [{ index: 1, par: 4 }],
      startedAt: "2024-05-03T10:00:00.000Z",
      showPutts: true,
    };
    loadRoundMock.mockReturnValueOnce(round);
    const user = userEvent.setup();

    render(
      <UserSessionProvider>
        <NotificationProvider>
          <MemoryRouter initialEntries={["/play/qr-999"]}>
            <Routes>
              <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
            </Routes>
          </MemoryRouter>
        </NotificationProvider>
      </UserSessionProvider>
    );

    const buttons = await screen.findAllByRole("button", { name: /Avsluta runda/i });
    await user.click(buttons[0]);

    expect(saveRoundMock).toHaveBeenCalled();
    const completionCall = saveRoundMock.mock.calls.at(-1)?.[0] as QuickRound;
    expect(completionCall.completedAt).toBeDefined();
    expect(mockedPostQuickRoundSnapshots).toHaveBeenCalled();
  });

  it("renders not found state", () => {
    loadRoundMock.mockReturnValueOnce(null);

    render(
      <UserSessionProvider>
        <NotificationProvider>
          <MemoryRouter initialEntries={["/play/missing"]}>
            <Routes>
              <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
            </Routes>
          </MemoryRouter>
        </NotificationProvider>
      </UserSessionProvider>
    );

    expect(screen.getByText(/Round not found/i)).toBeTruthy();
    expect(screen.getByText(/Back to start/i)).toBeTruthy();
  });

  it("displays net summary when handicap is set", async () => {
    const round: QuickRound = {
      id: "qr-555",
      courseName: "Net Course",
      holes: [
        { index: 1, par: 4, strokes: 5 },
        { index: 2, par: 4, strokes: 4 },
      ],
      startedAt: "2024-05-04T10:00:00.000Z",
      showPutts: true,
      handicap: 3,
    };
    loadRoundMock.mockReturnValueOnce(round);

    render(
      <UserSessionProvider>
        <NotificationProvider>
          <MemoryRouter initialEntries={["/play/qr-555"]}>
            <Routes>
              <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
            </Routes>
          </MemoryRouter>
        </NotificationProvider>
      </UserSessionProvider>
    );

    expect(await screen.findByText(/Net strokes/i)).toBeTruthy();
    expect(screen.getByText("6.0")).toBeTruthy();
    expect(screen.getByText(/Net result/i)).toBeTruthy();
  });
});
