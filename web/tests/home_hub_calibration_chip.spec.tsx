import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";

const mockUseCalibrationStatus = vi.hoisted(() =>
  vi.fn(() => ({
    status: { calibrated: true, lastUpdatedAt: new Date().toISOString() },
    markCalibrated: vi.fn(),
    markUncalibrated: vi.fn(),
  })),
);

const mockUseUserAccess = vi.hoisted(() =>
  vi.fn(() => ({ plan: "free", loading: false, hasFeature: () => false })),
);

vi.mock("@/features/range/useCalibrationStatus", () => ({
  useCalibrationStatus: mockUseCalibrationStatus,
}));

vi.mock("@/access/UserAccessContext", () => ({
  useUserAccess: mockUseUserAccess,
}));

import { NotificationProvider } from "../src/notifications/NotificationContext";
import { HomeHubPage } from "@/pages/home/HomeHubPage";

describe("HomeHubPage calibration chip", () => {
  beforeEach(() => {
    mockUseCalibrationStatus.mockClear();
    mockUseUserAccess.mockClear();
  });

  it("renders Calibrated chip when status is true", () => {
    render(
      <NotificationProvider>
        <MemoryRouter>
          <HomeHubPage />
        </MemoryRouter>
      </NotificationProvider>,
    );

    expect(screen.getByText(/Calibrated/i)).toBeTruthy();
  });
});
