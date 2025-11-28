import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { UserAccessProvider } from "@/access/UserAccessContext";

const { fetchBundleIndex, getHoleHud } = vi.hoisted(() => {
  const bundles = [
    { courseId: "links_crest", name: "Links Crest", holes: 18 },
    { courseId: "pine_dunes", name: "Pine Dunes", holes: 18 },
  ];

  const hud = {
    hole: 1,
    plan: "pro",
    toFront_m: 150,
    toGreen_m: 160,
    toBack_m: 170,
  };

  return {
    fetchBundleIndex: vi.fn().mockResolvedValue(bundles),
    getHoleHud: vi.fn().mockResolvedValue(hud),
  };
});

vi.mock("@/api", () => ({
  fetchBundleIndex,
  getHoleHud,
}));

describe("HudPreviewPage", () => {
  it("loads bundles and previews HUD payload", async () => {
    const user = userEvent.setup();
    const { HudPreviewPage } = await import("@/pages/dev/HudPreviewPage");

    render(
      <MemoryRouter>
        <UserAccessProvider autoFetch={false} initialPlan="pro">
          <HudPreviewPage />
        </UserAccessProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(fetchBundleIndex).toHaveBeenCalled());
    await user.selectOptions(screen.getByLabelText(/course/i), "links_crest");

    await user.clear(screen.getByLabelText(/latitude/i));
    await user.type(screen.getByLabelText(/latitude/i), "56.41");
    await user.clear(screen.getByLabelText(/longitude/i));
    await user.type(screen.getByLabelText(/longitude/i), "-2.79");

    await user.click(screen.getByRole("button", { name: /preview hud/i }));

    await waitFor(() =>
      expect(getHoleHud).toHaveBeenCalledWith({
        memberId: "preview-member",
        runId: "preview-run",
        courseId: "links_crest",
        hole: 1,
        lat: 56.41,
        lon: -2.79,
      }),
    );

    expect(await screen.findByText(/toFront_m/)).toBeTruthy();
    expect((await screen.findAllByText(/150 m/)).length).toBeGreaterThan(0);
  });
});
