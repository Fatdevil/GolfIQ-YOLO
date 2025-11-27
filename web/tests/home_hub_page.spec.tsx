import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { HomeHubPage } from "@/pages/home/HomeHubPage";

vi.mock("@/access/PlanProvider", () => ({
  usePlan: vi.fn(),
}));

vi.mock("@/access/UserAccessContext", () => ({
  useUserAccess: vi.fn(),
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

import { usePlan } from "@/access/PlanProvider";
import { useUserAccess, useFeatureFlag } from "@/access/UserAccessContext";
import {
  computeOnboardingChecklist,
  markHomeSeen,
  type OnboardingChecklist,
} from "@/onboarding/checklist";
import { seedDemoData } from "@/demo/demoData";

const mockUsePlan = usePlan as unknown as Mock;
const mockUseUserAccess = useUserAccess as unknown as Mock;
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
    mockUsePlan.mockReturnValue({ plan: "FREE", hasFeature: vi.fn(), setPlan: vi.fn() });
    mockUseUserAccess.mockReturnValue({ plan: undefined, loading: true, hasFeature: vi.fn() });
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
    mockUsePlan.mockReturnValue({ plan: "FREE", hasFeature: vi.fn(), setPlan: vi.fn() });
    mockUseUserAccess.mockReturnValue({ plan: "pro", loading: false, hasFeature: vi.fn() });

    renderHome();

    expect(screen.getAllByText(/Pro/i).length).toBeGreaterThan(0);
    expect(await screen.findByText(/Caddie insights unlocked/i)).toBeTruthy();
  });

  it("falls back to local plan when backend plan is not loaded", () => {
    mockUsePlan.mockReturnValue({ plan: "FREE", hasFeature: vi.fn(), setPlan: vi.fn() });
    mockUseUserAccess.mockReturnValue({ plan: undefined, loading: true, hasFeature: vi.fn() });

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
