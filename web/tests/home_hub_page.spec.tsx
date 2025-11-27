import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { HomeHubPage } from "@/pages/home/HomeHubPage";

vi.mock("@/access/UserAccessContext", () => ({
  useAccessPlan: vi.fn(),
  useAccessFeatures: vi.fn(),
  useFeatureFlag: vi.fn().mockReturnValue({ enabled: true, loading: false }),
}));

vi.mock("@/onboarding/checklist", () => ({
  computeOnboardingChecklist: vi.fn(),
  markHomeSeen: vi.fn(),
}));

vi.mock("@/demo/demoData", () => ({
  seedDemoData: vi.fn(),
}));

vi.mock("@/notifications/NotificationContext", () => ({
  useNotifications: () => ({ notify: vi.fn() }),
}));

import { useAccessFeatures, useAccessPlan, useFeatureFlag } from "@/access/UserAccessContext";
import {
  computeOnboardingChecklist,
  markHomeSeen,
  type OnboardingChecklist,
} from "@/onboarding/checklist";
import { seedDemoData } from "@/demo/demoData";

const mockUseAccessPlan = useAccessPlan as unknown as Mock;
const mockUseAccessFeatures = useAccessFeatures as unknown as Mock;
const mockUseFeatureFlag = useFeatureFlag as unknown as Mock;
const mockComputeOnboardingChecklist =
  computeOnboardingChecklist as unknown as Mock;
const mockMarkHomeSeen = markHomeSeen as unknown as Mock;
const mockSeedDemoData = seedDemoData as unknown as Mock;

const baseChecklist: OnboardingChecklist = {
  allDone: false,
  tasks: [
    { id: "HOME_VISITED", labelKey: "onboarding.task.home", done: false },
    { id: "PLAYED_QUICKROUND", labelKey: "onboarding.task.quick", done: false },
    { id: "PLAYED_RANGE", labelKey: "onboarding.task.range", done: false },
    { id: "VIEWED_PROFILE", labelKey: "onboarding.task.profile", done: false },
  ],
};

const renderHome = () => {
  return render(
    <MemoryRouter>
      <HomeHubPage />
    </MemoryRouter>,
  );
};

describe("HomeHubPage", () => {
  beforeEach(() => {
    mockUseAccessPlan.mockReturnValue({
      plan: "free",
      isPro: false,
      isFree: true,
      trial: null,
      expiresAt: null,
      loading: false,
      refresh: vi.fn(),
      error: undefined,
    });
    mockUseAccessFeatures.mockReturnValue({
      hasFeature: vi.fn().mockReturnValue(true),
      hasPlanFeature: vi.fn().mockReturnValue(false),
      loading: false,
    });
    mockUseFeatureFlag.mockReturnValue({ enabled: true, loading: false });
    mockComputeOnboardingChecklist.mockReturnValue({ ...baseChecklist });
    mockMarkHomeSeen.mockClear();
    mockSeedDemoData.mockClear();
  });

  it("renders home hub with entry cards and free plan badge", () => {
    renderHome();

    expect(screen.getByText(/GolfIQ Home/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Start Quick Round/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open range practice/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /View My GolfIQ/i })).toBeTruthy();
    expect(screen.getAllByText(/Free/i).length).toBeGreaterThan(0);
  });

  it("prefers backend plan when available to show pro state", async () => {
    mockUseAccessPlan.mockReturnValue({
      plan: "pro",
      isPro: true,
      isFree: false,
      trial: null,
      expiresAt: null,
      loading: false,
      refresh: vi.fn(),
      error: undefined,
    });
    mockUseAccessFeatures.mockReturnValue({
      hasFeature: vi.fn().mockReturnValue(true),
      hasPlanFeature: vi.fn().mockReturnValue(true),
      loading: false,
    });

    renderHome();

    expect(screen.getAllByText(/Pro/i).length).toBeGreaterThan(0);
    expect(await screen.findByText(/Caddie insights unlocked/i)).toBeTruthy();
  });

  it("falls back to local plan when backend plan is not loaded", () => {
    mockUseAccessPlan.mockReturnValue({
      plan: "free",
      isPro: false,
      isFree: true,
      trial: null,
      expiresAt: null,
      loading: true,
      refresh: vi.fn(),
      error: undefined,
    });

    renderHome();

    expect(screen.getAllByText(/Free/i).length).toBeGreaterThan(0);
  });

  it("shows onboarding checklist and handles demo seed action", async () => {
    renderHome();

    expect(mockMarkHomeSeen).toHaveBeenCalled();

    const [demoButton] = await screen.findAllByTestId("seed-demo-data");
    fireEvent.click(demoButton);
    expect(mockSeedDemoData).toHaveBeenCalled();
  });
});
