import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { NotificationProvider } from "@/notifications/NotificationContext";
import { ToastContainer } from "@/notifications/ToastContainer";
import { UnitsProvider } from "@/preferences/UnitsContext";
import { SettingsPage } from "@/pages/settings/SettingsPage";

type MockAccessState = {
  plan: "free" | "pro";
};

const mockUseUserAccess = vi.hoisted(() =>
  vi.fn((): MockAccessState => ({
    plan: "free",
  }))
);

vi.mock("@/access/UserAccessContext", () => ({
  useUserAccess: mockUseUserAccess,
}));

vi.mock("@/user/UserSessionContext", () => ({
  useUserSession: () => ({
    session: { userId: "demo-user-id", createdAt: "2025-01-01T00:00:00Z" },
    loading: false,
  }),
}));

describe("SettingsPage userId display", () => {
  beforeEach(() => {
    mockUseUserAccess.mockReset();
    mockUseUserAccess.mockReturnValue({ plan: "free" });
  });

  it("shows the user id and copies it", async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const user = userEvent.setup();

    render(
      <NotificationProvider>
        <MemoryRouter>
          <UnitsProvider>
            <SettingsPage />
            <ToastContainer />
          </UnitsProvider>
        </MemoryRouter>
      </NotificationProvider>
    );

    expect(screen.getByText(/demo-user-id/)).toBeTruthy();

    const copyButtons = screen.getAllByRole("button", { name: /copy/i });
    await user.click(copyButtons[0]);

    expect(await screen.findByText(/User ID copied to clipboard\./i)).toBeTruthy();
  });
});
