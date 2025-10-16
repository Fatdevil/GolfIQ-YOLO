import { describe, expect, it } from "vitest";

import {
  distancePointToLineString,
  distancePointToPolygonEdge,
  toLocalENU,
  type LineString,
  type Polygon,
  type Vec2,
} from "../geo";

describe("geo helpers", () => {
  it("projects WGS84 to local ENU with metre accuracy", () => {
    const origin = { lat: 37.788, lon: -122.4 };
    const north = { lat: 37.7889, lon: -122.4 };
    const east = { lat: 37.788, lon: -122.3991 };

    const northLocal = toLocalENU(origin, north);
    const eastLocal = toLocalENU(origin, east);

    expect(northLocal.x).toBeCloseTo(0, 4);
    expect(northLocal.y).toBeCloseTo(100.19, 2);
    expect(eastLocal.y).toBeCloseTo(0, 4);
    expect(eastLocal.x).toBeCloseTo(79.18, 2);
  });

  it("computes distance to a polyline segment", () => {
    const line: LineString = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const point: Vec2 = { x: 5, y: 4 };
    expect(distancePointToLineString(point, line)).toBeCloseTo(4, 6);
  });

  it("computes distance to polygon edges", () => {
    const polygon: Polygon = [
      [
        { x: -5, y: -5 },
        { x: 5, y: -5 },
        { x: 5, y: 5 },
        { x: -5, y: 5 },
        { x: -5, y: -5 },
      ],
    ];
    const pointInside: Vec2 = { x: 0, y: 0 };
    const pointOutside: Vec2 = { x: 10, y: 0 };

    expect(distancePointToPolygonEdge(pointInside, polygon)).toBeCloseTo(5, 6);
    expect(distancePointToPolygonEdge(pointOutside, polygon)).toBeCloseTo(5, 6);
  });
});
