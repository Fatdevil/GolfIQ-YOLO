import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLandingHeuristics,
  type LandingSample,
  type LandingProposal,
} from '../../../shared/arhud/landing_heuristics';
import { distanceMeters } from '../../../shared/arhud/location';

const EARTH_RADIUS_M = 6_378_137;

function offsetPoint(
  origin: { lat: number; lon: number },
  northMeters: number,
  eastMeters: number,
): { lat: number; lon: number } {
  const latOffset = (northMeters / EARTH_RADIUS_M) * (180 / Math.PI);
  const lonOffset =
    (eastMeters / (EARTH_RADIUS_M * Math.cos((origin.lat * Math.PI) / 180))) * (180 / Math.PI);
  return {
    lat: origin.lat + latOffset,
    lon: origin.lon + lonOffset,
  };
}

function makeSample(
  base: LandingSample,
  override: Partial<LandingSample>,
): LandingSample {
  return { ...base, ...override };
}

test('landing heuristics proposes after sustained slowdown with accurate fix', () => {
  const heuristics = createLandingHeuristics();
  const start: LandingSample = {
    t: 0,
    lat: 37.0,
    lon: -122.0,
    acc_m: 4,
    speed_mps: 3.5,
    heading_deg: 0,
  };
  heuristics.beginTracking(start);

  const basePoint = { lat: start.lat, lon: start.lon };
  const timeline: Array<{ t: number; north: number; speed: number }> = [
    { t: 1000, north: 20, speed: 3.2 },
    { t: 2000, north: 60, speed: 1.4 },
    { t: 4000, north: 120, speed: 0.6 },
    { t: 5000, north: 135, speed: 0.5 },
    { t: 6000, north: 140, speed: 0.3 },
    { t: 7000, north: 142, speed: 0.2 },
  ];

  let proposal: LandingProposal | null = null;
  for (const point of timeline) {
    const geo = offsetPoint(basePoint, point.north, 0);
    const sample = makeSample(start, {
      t: point.t,
      lat: geo.lat,
      lon: geo.lon,
      speed_mps: point.speed,
    });
    const candidate = heuristics.ingest(sample);
    if (candidate) {
      proposal = candidate;
    }
  }

  assert.ok(proposal, 'expected a landing proposal');
  const expectedCarry = distanceMeters(basePoint, proposal!.candidate);
  assert.ok(
    Math.abs(proposal!.carry_m - expectedCarry) <= 5,
    `carry should be close to haversine distance (expected ${expectedCarry}, got ${proposal!.carry_m})`,
  );
});

test('landing heuristics debounce and accuracy thresholds hold', () => {
  const heuristics = createLandingHeuristics();
  const start: LandingSample = {
    t: 0,
    lat: 37.01,
    lon: -122.02,
    acc_m: 4,
    speed_mps: 3,
    heading_deg: 90,
  };
  heuristics.beginTracking(start);

  const origin = { lat: start.lat, lon: start.lon };
  const makeNorthSample = (t: number, north: number, speed: number, acc = 4): LandingSample => {
    const geo = offsetPoint(origin, north, 0);
    return {
      t,
      lat: geo.lat,
      lon: geo.lon,
      acc_m: acc,
      speed_mps: speed,
      heading_deg: 90,
    };
  };

  const firstSequence = [
    makeNorthSample(1000, 15, 2.5),
    makeNorthSample(2000, 45, 1.4),
    makeNorthSample(4000, 95, 0.5),
    makeNorthSample(5000, 108, 0.4),
    makeNorthSample(6000, 112, 0.3),
    makeNorthSample(7000, 114, 0.25),
  ];

  let firstProposal: LandingProposal | null = null;
  for (const sample of firstSequence) {
    const result = heuristics.ingest(sample);
    if (result) {
      firstProposal = result;
    }
  }

  assert.ok(firstProposal, 'expected initial proposal');
  heuristics.reject('adjust');

  const nearSequence = [
    makeNorthSample(8000, 116, 0.4),
    makeNorthSample(9000, 118, 0.3),
    makeNorthSample(10_000, 119, 0.2),
  ];

  for (const sample of nearSequence) {
    const next = heuristics.ingest(sample);
    assert.equal(next, null, 'debounce should suppress nearby proposal');
  }

  const farSequence = [
    makeNorthSample(12_000, 140, 0.5),
    makeNorthSample(13_000, 152, 0.4),
    makeNorthSample(14_000, 156, 0.3),
  ];

  let secondProposal: LandingProposal | null = null;
  for (const sample of farSequence) {
    const result = heuristics.ingest(sample);
    if (result) {
      secondProposal = result;
    }
  }

  assert.ok(secondProposal, 'expected second proposal after moving away');
  const separation = distanceMeters(firstProposal!.candidate, secondProposal!.candidate);
  assert.ok(
    separation >= 12,
    `expected second candidate at least 12 m away (received ${separation.toFixed(2)} m)`,
  );

  heuristics.reset();
  heuristics.beginTracking(start);

  const poorAccuracySequence = [
    makeNorthSample(1000, 20, 0.6, 20),
    makeNorthSample(2000, 25, 0.4, 18),
    makeNorthSample(3000, 30, 0.3, 16),
    makeNorthSample(4000, 35, 0.2, 15),
  ];

  for (const sample of poorAccuracySequence) {
    const result = heuristics.ingest(sample);
    assert.equal(result, null, 'high inaccuracy should suppress proposals');
  }
  assert.equal(heuristics.state(), 'TRACKING', 'should remain tracking without proposal');
});
