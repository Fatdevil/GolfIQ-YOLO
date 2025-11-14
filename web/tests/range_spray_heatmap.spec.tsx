import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SprayHeatmap } from "@web/features/range/SprayHeatmap";

const sampleBins = [
  { key: "10:0", xCenter_m: 105, yCenter_m: 2.5, count: 3 },
  { key: "9:-1", xCenter_m: 95, yCenter_m: -2.5, count: 1 },
];

describe("SprayHeatmap", () => {
  it("renders rects for bins and axis labels", () => {
    const { container } = render(<SprayHeatmap bins={sampleBins} />);

    const rects = container.querySelectorAll("rect");
    expect(rects.length).toBeGreaterThan(1);

    expect(screen.getByText(/Framåt \(m\)/i)).toBeTruthy();
    expect(screen.getByText(/Vänster \/ Höger \(m\)/i)).toBeTruthy();
  });

  it("shows placeholder when empty", () => {
    render(<SprayHeatmap bins={[]} />);

    expect(screen.getByText(/Ingen data ännu/i)).toBeTruthy();
  });
});
