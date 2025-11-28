import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

import { ShareWithCoachButton } from "./ShareWithCoachButton";

const createCoachShare = vi.fn();
const notify = vi.fn();
const useAccessPlan = vi.fn();

vi.mock("@/api/coachShare", () => ({
  createCoachShare: (...args: unknown[]) => createCoachShare(...args),
}));

vi.mock("@/access/UserAccessContext", () => ({
  useAccessPlan: () => useAccessPlan(),
}));

vi.mock("@/access/UpgradeGate", () => ({
  UpgradeGate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="upgrade-gate">{children}</div>
  ),
}));

vi.mock("@/notifications/NotificationContext", () => ({
  useNotifications: () => ({ notify }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("ShareWithCoachButton", () => {
  beforeEach(() => {
    useAccessPlan.mockReturnValue({ isPro: true, loading: false });
    createCoachShare.mockResolvedValue({ url: "/s/demo", sid: "demo" });
    notify.mockReset();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);

    if (navigator.clipboard) {
      vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeTextMock);
    } else {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        configurable: true,
      });
    }
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("creates a share link and copies it", async () => {
    render(<ShareWithCoachButton runId="run-1" />);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(createCoachShare).toHaveBeenCalledWith("run-1");
    });

    expect(navigator.clipboard?.writeText).toHaveBeenCalledWith(
      new URL("/s/demo", window.location.origin).toString(),
    );
    expect(notify).toHaveBeenCalledWith("success", "coach.share.copied");
  });

  it("wraps content in upgrade gate for free plans", () => {
    useAccessPlan.mockReturnValue({ isPro: false, loading: false });

    render(<ShareWithCoachButton runId="run-2" />);

    expect(screen.getByTestId("upgrade-gate")).toBeInTheDocument();
  });

  it("notifies on error", async () => {
    createCoachShare.mockRejectedValue(new Error("boom"));

    render(<ShareWithCoachButton runId="run-err" />);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith("error", "coach.share.error");
    });
  });
});
