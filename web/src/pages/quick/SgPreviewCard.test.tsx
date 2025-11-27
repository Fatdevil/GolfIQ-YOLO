import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { RoundSgPreview } from "@/api/sgPreview";
import { SgPreviewCard } from "./SgPreviewCard";

const samplePreview: RoundSgPreview = {
  runId: "run-1",
  courseId: null,
  total_sg: 0.4,
  sg_by_cat: { TEE: 0.2, APPROACH: 0.3, SHORT: -0.1, PUTT: 0.0 },
  holes: [
    {
      hole: 1,
      sg_by_cat: { TEE: 0.3, APPROACH: 0.2, SHORT: 0, PUTT: 0 },
      sg_total: 0.5,
      gross_score: 4,
      worst_category: "PUTT",
    },
    {
      hole: 2,
      sg_by_cat: { TEE: -0.1, APPROACH: 0.1, SHORT: -0.4, PUTT: 0.1 },
      sg_total: -0.3,
      gross_score: 5,
      worst_category: "SHORT",
    },
  ],
  round_summary: {
    worst_category: "SHORT",
    categories: [
      { category: "APPROACH", sg: 0.3 },
      { category: "TEE", sg: 0.2 },
      { category: "PUTT", sg: 0.0 },
      { category: "SHORT", sg: -0.1 },
    ],
  },
};

describe("SgPreviewCard", () => {
  it("renders per-hole SG rows and tones", () => {
    render(<SgPreviewCard status="loaded" preview={samplePreview} />);

    expect(screen.getByText("Round SG: +0.4")).toBeInTheDocument();
    expect(screen.getByText("Biggest leak: Short game")).toBeInTheDocument();

    const holeOneRow = screen.getByText("1").closest("tr");
    expect(holeOneRow).not.toBeNull();
    expect(holeOneRow?.textContent).toContain("4");
    const sgCell = screen.getByText("+0.5");
    expect(sgCell.className).toContain("text-emerald");

    const holeTwoRow = screen.getByText("2").closest("tr");
    expect(holeTwoRow?.textContent).toContain("-0.3");
    expect(screen.getByText("Short game")).toBeInTheDocument();
  });

  it("shows SG help copy when toggled", () => {
    render(<SgPreviewCard status="loaded" preview={samplePreview} />);

    const infoButtons = screen.getAllByText("What is SG?");
    fireEvent.click(infoButtons[0]);
    expect(
      screen.getByText(/compares your performance to a scratch golfer baseline/i)
    ).toBeInTheDocument();
  });
});
