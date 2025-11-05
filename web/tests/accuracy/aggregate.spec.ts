import { describe, expect, it } from "vitest";

import {
  aggregate,
  binDistance,
  parseNdjson,
} from "@shared/telemetry/accuracy/aggregate";

describe("parseNdjson", () => {
  it("parses flat and nested NDJSON rows", () => {
    const ndjson = [
      '{"ts":1700000000000,"tp":2,"fp":1,"fn":0,"hole":3,"club":"7i"}',
      '{"timestampMs":1700086400000,"data":{"tp":1,"fp":0,"fn":2,"club":"D","hole":5}}',
      '{"data":{"ts":1700172800000,"tp":4,"fp":2,"fnn":1,"distance_m":42}}',
      "",
    ].join("\n");

    const rows = parseNdjson(ndjson);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ tp: 2, fp: 1, fn: 0, hole: 3, club: "7i" });
    expect(rows[1]).toMatchObject({ tp: 1, fp: 0, fn: 2, hole: 5, club: "D" });
    expect(rows[2]).toMatchObject({ tp: 4, fp: 2, fn: 1, distance_m: 42 });
    expect(rows[0].ts).toBe(1700000000000);
    expect(rows[1].ts).toBe(1700086400000);
    expect(rows[2].ts).toBe(1700172800000);
  });

  it("ignores malformed lines", () => {
    const ndjson = [
      "not json",
      '{"ts":1700000000000,"tp":1,"fp":0,"fn":0}',
      "{",
    ].join("\n");

    const rows = parseNdjson(ndjson);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tp: 1, fp: 0, fn: 0 });
  });
});

describe("aggregate", () => {
  const ndjson = [
    '{"ts":1700000000000,"tp":3,"fp":1,"fn":1,"hole":3,"club":"7i","distance_m":50}',
    '{"timestampMs":1700086400000,"data":{"tp":1,"fp":0,"fn":2,"hole":4,"club":"D","distance_m":210}}',
    '{"data":{"ts":1700172800000,"tp":2,"fp":1,"fnn":1,"club":"P","distance_m":10}}',
    "invalid line",
  ].join("\n");

  const rows = parseNdjson(ndjson);
  const aggregates = aggregate(rows);

  it("sums totals and derives precision/recall/f1", () => {
    expect(aggregates.totals.tp).toBe(6);
    expect(aggregates.totals.fp).toBe(2);
    expect(aggregates.totals.fn).toBe(4);
    expect(aggregates.totals.precision).toBeCloseTo(0.75, 5);
    expect(aggregates.totals.recall).toBeCloseTo(0.6, 5);
    expect(aggregates.totals.f1).toBeCloseTo(2 * 0.75 * 0.6 / (0.75 + 0.6), 5);
  });

  it("groups by hole, club, and distance bins", () => {
    expect(Object.keys(aggregates.byHole)).toContain("3");
    expect(Object.keys(aggregates.byHole)).toContain("4");
    expect(Object.keys(aggregates.byHole)).toContain("-1");
    expect(aggregates.byHole[3].tp).toBe(3);

    expect(Object.keys(aggregates.byClub)).toEqual(expect.arrayContaining(["7i", "D", "P"]));
    expect(aggregates.byClub["7i"].precision).toBeCloseTo(0.75, 5);

    expect(Object.keys(aggregates.byDistance)).toEqual(expect.arrayContaining(["30–80m", "200m+", "0–30m"]));
  });

  it("aggregates by UTC date", () => {
    const firstDate = new Date(1700000000000);
    const dateKey = `${firstDate.getUTCFullYear()}-${String(firstDate.getUTCMonth() + 1).padStart(2, "0")}-${String(
      firstDate.getUTCDate(),
    ).padStart(2, "0")}`;
    expect(aggregates.byDate[dateKey]).toMatchObject({ tp: 3, fp: 1, fn: 1 });
    expect(Object.keys(aggregates.byDate)).toHaveLength(3);
  });
});

describe("binDistance", () => {
  it("assigns bins based on meter ranges", () => {
    expect(binDistance(undefined)).toBe("unknown");
    expect(binDistance(-5)).toBe("unknown");
    expect(binDistance(15)).toBe("0–30m");
    expect(binDistance(60)).toBe("30–80m");
    expect(binDistance(120)).toBe("80–140m");
    expect(binDistance(180)).toBe("140–200m");
    expect(binDistance(220)).toBe("200m+");
  });
});
