import { describe, expect, it } from "vitest";

import {
  buildCaptureMetadata,
  verdictForBlur,
  verdictForBrightness,
  verdictForFpsEstimate,
} from "@/lib/capturePreflight";

describe("capture preflight verdicts", () => {
  it("classifies fps thresholds", () => {
    expect(
      verdictForFpsEstimate({ method: "seeked", confidence: "low" })
    ).toBe("warn");
    expect(
      verdictForFpsEstimate({ method: "seeked", confidence: "high", value: 25 })
    ).toBe("bad");
    expect(
      verdictForFpsEstimate({ method: "seeked", confidence: "high", value: 45 })
    ).toBe("warn");
    expect(
      verdictForFpsEstimate({ method: "seeked", confidence: "high", value: 90 })
    ).toBe("ok");
  });

  it("classifies brightness thresholds", () => {
    expect(verdictForBrightness(30)).toBe("bad");
    expect(verdictForBrightness(50)).toBe("warn");
    expect(verdictForBrightness(120)).toBe("ok");
    expect(verdictForBrightness(210)).toBe("warn");
    expect(verdictForBrightness(230)).toBe("bad");
  });

  it("classifies blur thresholds", () => {
    expect(verdictForBlur(50)).toBe("bad");
    expect(verdictForBlur(100)).toBe("warn");
    expect(verdictForBlur(180)).toBe("ok");
  });
});

describe("buildCaptureMetadata", () => {
  it("marks ok when all metrics are acceptable", () => {
    const metadata = buildCaptureMetadata({
      fpsEstimate: { method: "rvfc", confidence: "high", value: 120 },
      brightnessMean: 120,
      blurScore: 180,
      framingTipsShown: true,
    });

    expect(metadata.okToRecordOrUpload).toBe(true);
    expect(metadata.issues).toHaveLength(0);
  });

  it("adds issues when metrics are out of range", () => {
    const metadata = buildCaptureMetadata({
      fpsEstimate: { method: "seeked", confidence: "high", value: 20 },
      brightnessMean: 30,
      blurScore: 50,
      framingTipsShown: true,
    });

    expect(metadata.okToRecordOrUpload).toBe(false);
    expect(metadata.issues.length).toBeGreaterThan(0);
    expect(metadata.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["fps_low", "exposure", "blur"])
    );
  });

  it("treats low-confidence fps as warn", () => {
    const metadata = buildCaptureMetadata({
      fpsEstimate: { method: "seeked", confidence: "low", value: 20 },
      brightnessMean: 120,
      blurScore: 180,
      framingTipsShown: true,
    });

    expect(metadata.okToRecordOrUpload).toBe(true);
    expect(metadata.issues[0]?.severity).toBe("warn");
  });
});
