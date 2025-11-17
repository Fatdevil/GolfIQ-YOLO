import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockLoadOnboardingState = vi.hoisted(() => vi.fn(() => ({ homeSeen: false })));
const mockSaveOnboardingState = vi.hoisted(() => vi.fn());
const mockSeedDemoData = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/onboarding/state", () => ({
  loadOnboardingState: mockLoadOnboardingState,
  saveOnboardingState: mockSaveOnboardingState,
}));

vi.mock("@/onboarding/demoSeed", () => ({
  seedDemoData: mockSeedDemoData,
}));

vi.mock("@/access/UserAccessContext", () => ({
  useUserAccess: () => ({ plan: "free", loading: false, hasFeature: () => false }),
}));

vi.mock("@/features/range/useCalibrationStatus", () => ({
  useCalibrationStatus: () => ({ status: { calibrated: false } }),
}));

import { HomeHubPage } from "@/pages/home/HomeHubPage";

describe("HomeHubPage onboarding", () => {
  beforeEach(() => {
    mockLoadOnboardingState.mockClear();
    mockSaveOnboardingState.mockClear();
    mockSeedDemoData.mockClear();
    mockLoadOnboardingState.mockReturnValue({ homeSeen: false });
  });

  it("shows onboarding card with actions when home not seen", () => {
    render(
      <MemoryRouter>
        <HomeHubPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Welcome to GolfIQ-YOLO")).toBeTruthy();
    expect(screen.getByText("Show demo profile")).toBeTruthy();
    expect(screen.getByText("Got it, hide this")).toBeTruthy();
  });

  it("dismisses onboarding when clicking got it", async () => {
    const initial = render(
      <MemoryRouter>
        <HomeHubPage />
      </MemoryRouter>,
    );

    const dismissButtons = screen.getAllByText("Got it, hide this");
    fireEvent.click(dismissButtons[0]);

    expect(mockSaveOnboardingState).toHaveBeenCalled();

    mockLoadOnboardingState.mockReturnValue({ homeSeen: true });
    initial.unmount();
    render(
      <MemoryRouter>
        <HomeHubPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Welcome to GolfIQ-YOLO")).toBeNull();
  });

  it("triggers demo seeding when clicking demo button", async () => {
    render(
      <MemoryRouter>
        <HomeHubPage />
      </MemoryRouter>,
    );

    const demoButtons = screen.getAllByText("Show demo profile");
    fireEvent.click(demoButtons[0]);

    await waitFor(() => {
      expect(mockSeedDemoData).toHaveBeenCalled();
    });
  });
});
