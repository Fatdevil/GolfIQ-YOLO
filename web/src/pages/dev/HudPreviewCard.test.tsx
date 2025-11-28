import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { HoleHud } from "@/api";
import { HudPreviewCard } from "./HudPreviewCard";

const baseHud: HoleHud = {
  hole: 3,
  par: 4,
  plan: "pro",
  courseId: "hero-1",
  toFront_m: 142,
  toGreen_m: 150,
  toBack_m: 158,
};

describe("HudPreviewCard", () => {
  it("shows pro-only plays-like and tip content when plan is pro", () => {
    render(
      <HudPreviewCard
        hud={{
          ...baseHud,
          playsLike_m: 157,
          activeTip: {
            tipId: "tip-1",
            title: "Try 7i",
            body: "Smooth tempo and finish",
            club: "7i",
          },
          caddie_confidence: 0.82,
        }}
      />,
    );

    expect(screen.getByText(/PRO/i)).toBeInTheDocument();
    expect(screen.getByText(/Plays like 157 m/i)).toBeInTheDocument();
    expect(screen.getByText(/Try 7i/i)).toBeInTheDocument();
    expect(screen.getByText(/Confidence 82%/i)).toBeInTheDocument();
  });

  it("shows upgrade hints for free plan", () => {
    render(
      <HudPreviewCard
        hud={{
          ...baseHud,
          plan: "free",
          playsLike_m: 160,
          activeTip: {
            tipId: "tip-2",
            title: "Should be hidden",
            body: "This should not render",
          },
        }}
      />,
    );

    expect(screen.getByText(/Upgrade to Pro to see plays-like/i)).toBeInTheDocument();
    expect(screen.getByText(/Upgrade to Pro to unlock caddie advice/i)).toBeInTheDocument();
    expect(screen.queryByText(/Should be hidden/i)).not.toBeInTheDocument();
  });
});
