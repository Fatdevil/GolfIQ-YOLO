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
  });
});
