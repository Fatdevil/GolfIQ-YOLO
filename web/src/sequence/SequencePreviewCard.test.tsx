import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { KinematicSequence } from "@/types/sequence";
import { SequencePreviewCard } from "./SequencePreviewCard";

const baseSequence: KinematicSequence = {
  maxHipRotation: 35,
  maxShoulderRotation: 50,
  maxXFactor: 15,
  hipPeakFrame: 10,
  shoulderPeakFrame: 12,
  xFactorPeakFrame: 13,
  sequenceOrder: {
    peakOrder: ["hips", "shoulders", "arms", "club"],
    isIdeal: true,
  },
};

describe("SequencePreviewCard", () => {
  it("renders ideal sequence text", () => {
    render(<SequencePreviewCard sequence={baseSequence} />);

    expect(
      screen.getByText(/Max rotation: hips 35.0°/, { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Your kinematic sequence is on point/, { exact: false }),
    ).toBeInTheDocument();
  });

  it("renders non-ideal ordering", () => {
    const nonIdeal: KinematicSequence = {
      ...baseSequence,
      sequenceOrder: { peakOrder: ["shoulders", "hips", "arms"], isIdeal: false },
    };

    render(<SequencePreviewCard sequence={nonIdeal} />);

    expect(screen.getByText(/Sequence: shoulders → hips → arms/, { exact: false })).toBeInTheDocument();
  });

  it("renders fallback when sequence missing", () => {
    render(<SequencePreviewCard sequence={null} />);

    expect(screen.getByText(/No sequence data available/)).toBeInTheDocument();
  });
});
