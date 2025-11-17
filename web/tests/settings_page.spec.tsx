import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

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

describe("SettingsPage", () => {
  beforeEach(() => {
    mockUseUserAccess.mockReset();
    mockUseUserAccess.mockReturnValue({ plan: "free" });
  });

  it("renders headings, selectors, and reset options", () => {
    render(
      <MemoryRouter>
        <UnitsProvider>
          <SettingsPage />
        </UnitsProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 1, name: /Settings/i })).toBeTruthy();
    expect(screen.getByText(/^Language$/i)).toBeTruthy();
    expect(screen.getByText(/^Units$/i)).toBeTruthy();
    expect(screen.getByText(/Quick Round history/i)).toBeTruthy();
    expect(screen.getByText(/Bag & club carries/i)).toBeTruthy();
    expect(screen.getByText(/Language & units/i)).toBeTruthy();
  });

  it("enables reset button when a checkbox is selected", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <UnitsProvider>
          <SettingsPage />
        </UnitsProvider>
      </MemoryRouter>
    );

    const resetButtons = screen.getAllByRole("button", { name: /Reset selected data/i });
    const resetButton = resetButtons[0] as HTMLButtonElement;
    expect(resetButton.disabled).toBe(true);

    const [quickRoundsCheckbox] = screen.getAllByLabelText(/Quick Round history/i);

    await user.click(quickRoundsCheckbox);

    expect(resetButton.disabled).toBe(false);
  });
});
