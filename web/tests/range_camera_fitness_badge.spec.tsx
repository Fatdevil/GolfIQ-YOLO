import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CameraFitnessBadge } from "@/features/range/CameraFitnessBadge";

describe("CameraFitnessBadge", () => {
  it("renders good badge with percentage", () => {
    render(
      <CameraFitnessBadge
        quality={{ score: 0.91, level: "good", reasons: [] }}
      />,
    );

    expect(screen.getByText(/Camera OK/i)).toBeTruthy();
    expect(screen.getByText(/91%/)).toBeTruthy();
  });

  it("renders bad badge message", () => {
    render(
      <CameraFitnessBadge
        quality={{ score: 0.2, level: "bad", reasons: ["light_low"] }}
      />,
    );

    expect(
      screen.getByText(/Camera not suitable for ball tracking/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/Scene is too dark – add light or move to a brighter spot./i),
    ).toBeTruthy();
  });

  it("lists actionable reasons", () => {
    render(
      <CameraFitnessBadge
        quality={{
          score: 0.4,
          level: "warning",
          reasons: ["fps_low", "blur_high"],
        }}
      />,
    );

    expect(
      screen.getByText(/Increase frame rate or shutter speed/i),
    ).toBeTruthy();
    expect(screen.getByText(/Reduce blur/i)).toBeTruthy();
  });

  it("limits reasons list to two entries", () => {
    const { container } = render(
      <CameraFitnessBadge
        quality={{
          score: 0.1,
          level: "bad",
          reasons: ["fps_low", "blur_high", "mpx_low"],
        }}
      />,
    );

    const bulletItems = container.querySelectorAll("li");
    expect(bulletItems).toHaveLength(2);
  });
});
