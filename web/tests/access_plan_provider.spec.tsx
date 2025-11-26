import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { PlanProvider, usePlan } from "@/access/PlanProvider";
import { PLAN_FEATURES } from "@/access/plan";

function PlanProbe() {
  const { plan, setPlan, hasFeature } = usePlan();
  return (
    <div>
      <div data-testid="plan">{plan}</div>
      <div data-testid="caddie">{String(hasFeature("CADDIE_INSIGHTS"))}</div>
      <button onClick={() => setPlan("PRO")}>upgrade</button>
    </div>
  );
}

describe("PlanProvider", () => {
  afterEach(() => {
    window.localStorage.clear();
    cleanup();
  });

  it("defaults to FREE and respects feature matrix", () => {
    render(
      <PlanProvider>
        <PlanProbe />
      </PlanProvider>,
    );

    expect(screen.getByTestId("plan").textContent).toBe("FREE");
    expect(screen.getByTestId("caddie").textContent).toBe(
      String(PLAN_FEATURES.FREE.CADDIE_INSIGHTS),
    );
  });

  it("can upgrade to PRO and persists selection", async () => {
    const user = userEvent.setup();

    render(
      <PlanProvider>
        <PlanProbe />
      </PlanProvider>,
    );

    const [upgradeButton] = screen.getAllByRole("button", { name: /upgrade/i });
    await user.click(upgradeButton);

    await waitFor(() => {
      const plans = screen.getAllByTestId("plan");
      const caddies = screen.getAllByTestId("caddie");
      expect(plans.some((node: HTMLElement) => node.textContent === "PRO")).toBe(true);
      expect(
        caddies.some(
          (node: HTMLElement) => node.textContent === String(PLAN_FEATURES.PRO.CADDIE_INSIGHTS),
        ),
      ).toBe(true);
    });
    expect(window.localStorage.getItem("golfiq_plan_v1")).toBe("PRO");
  });
});
