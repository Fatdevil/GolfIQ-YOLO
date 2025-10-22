import assert from 'node:assert/strict';
import test from 'node:test';

import { learnDispersion } from '../../../shared/caddie/dispersion';
import type { Shot } from '../../../shared/round/round_types';

const EARTH_RADIUS_M = 6_378_137;
const PIN = { lat: 59.3293, lon: 18.0686 };

function offsetPoint(east: number, north: number): { lat: number; lon: number } {
  const latOffset = (north / EARTH_RADIUS_M) * (180 / Math.PI);
  const lonOffset =
    (east / (EARTH_RADIUS_M * Math.cos((PIN.lat * Math.PI) / 180))) * (180 / Math.PI);
  return { lat: PIN.lat + latOffset, lon: PIN.lon + lonOffset };
}

test('learnDispersion filters outliers and recovers per-club sigma', () => {
  const planned = 150;
  const baseline: Array<{ long: number; lat: number }> = [
    { long: 2, lat: 1 },
    { long: -1, lat: -2 },
    { long: 3, lat: 2 },
    { long: -4, lat: -1 },
    { long: 1, lat: 0 },
    { long: 0, lat: 1 },
    { long: 2, lat: -1 },
    { long: -3, lat: 2 },
    { long: 4, lat: -2 },
    { long: -2, lat: 1 },
  ];
  const outliers: Array<{ long: number; lat: number }> = [
    { long: 45, lat: 30 },
    { long: -50, lat: -35 },
  ];

  const shots: Shot[] = [];
  let counter = 0;
  for (const sample of baseline) {
    shots.push({
      tStart: counter * 1_000,
      club: '7i',
      base_m: planned,
      playsLike_m: planned,
      carry_m: planned + sample.long,
      pin: PIN,
      land: offsetPoint(sample.lat, 0),
      heading_deg: 0,
    });
    counter += 1;
  }
  for (const sample of outliers) {
    shots.push({
      tStart: counter * 1_000,
      club: '7i',
      base_m: planned,
      playsLike_m: planned,
      carry_m: planned + sample.long,
      pin: PIN,
      land: offsetPoint(sample.lat, 0),
      heading_deg: 0,
    });
    counter += 1;
  }
  for (let i = 0; i < 3; i += 1) {
    shots.push({
      tStart: counter * 1_000,
      club: 'PW',
      base_m: 120,
      playsLike_m: 120,
      carry_m: 118,
      pin: PIN,
      land: offsetPoint(0.5, 0),
      heading_deg: 0,
    });
    counter += 1;
  }

  const result = learnDispersion(shots, 6);
  const sevenIron = result['7i'];
  assert.ok(sevenIron, 'expected learned dispersion for 7i');
  assert.equal(sevenIron.n, baseline.length);
  assert.ok(Math.abs(sevenIron.sigma_long_m - 2.52) < 0.3);
  assert.ok(Math.abs(sevenIron.sigma_lat_m - 1.45) < 0.2);
  assert.ok(!result['PW'], 'insufficient PW samples should not produce dispersion');
});
