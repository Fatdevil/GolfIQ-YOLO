import assert from 'node:assert/strict';
import test from 'node:test';

import { learnDispersion, learnFromRound } from '../../../shared/caddie/dispersion';
import type { Round, Shot } from '../../../shared/round/round_types';

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
      land: offsetPoint(sample.lat, sample.long),
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
      land: offsetPoint(sample.lat, sample.long),
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

test('learnFromRound aggregates hole shots before learning dispersion', async () => {
  const makeShot = (
    index: number,
    club: string,
    base: number,
    offsets: { long: number; lat: number },
  ): Shot => ({
    tStart: index * 1_000,
    club,
    base_m: base,
    playsLike_m: base,
    carry_m: base + offsets.long,
    pin: PIN,
    land: offsetPoint(offsets.lat, offsets.long),
    heading_deg: 0,
  });

  const sevenIronSamples: Array<{ long: number; lat: number }> = [
    { long: 2, lat: 1 },
    { long: -1, lat: -2 },
    { long: 3, lat: 2 },
    { long: -4, lat: -1 },
    { long: 1, lat: 0 },
    { long: 0, lat: 1 },
  ];
  const holeOneShots = sevenIronSamples.slice(0, 3).map((offsets, index) =>
    makeShot(index, '7i', 150, offsets),
  );
  const holeTwoShots = sevenIronSamples.slice(3).map((offsets, index) =>
    makeShot(100 + index, '7i', 150, offsets),
  );
  const wedgeShots = [
    makeShot(200, 'PW', 110, { long: 0.5, lat: 0.5 }),
    makeShot(201, 'PW', 110, { long: -0.3, lat: -0.1 }),
    makeShot(202, 'PW', 110, { long: 0.2, lat: -0.4 }),
  ];

  const round: Round = {
    id: 'round-test',
    courseId: 'qa-course',
    startedAt: Date.now(),
    holes: [
      { holeNo: 1, par: 4, shots: [...holeOneShots, wedgeShots[0]], score: holeOneShots.length + 1 },
      {
        holeNo: 2,
        par: 3,
        shots: [...holeTwoShots, wedgeShots[1], wedgeShots[2]],
        score: holeTwoShots.length + 2,
      },
    ],
    currentHole: 1,
    finished: true,
  };

  const learned = await learnFromRound(round);
  const direct = learnDispersion([...holeOneShots, ...holeTwoShots, ...wedgeShots]);
  const sevenIron = learned['7i'];
  assert.ok(sevenIron, 'expected dispersion for 7i');
  const directSeven = direct['7i'];
  assert.ok(directSeven, 'direct learning should return 7i dispersion');
  assert.equal(sevenIron.n, directSeven.n);
  assert.ok(Math.abs(sevenIron.sigma_long_m - directSeven.sigma_long_m) < 1e-12);
  assert.ok(Math.abs(sevenIron.sigma_lat_m - directSeven.sigma_lat_m) < 1e-12);
  const learnedMap = learned as Partial<Record<string, unknown>>;
  assert.ok(!Object.prototype.hasOwnProperty.call(learnedMap, 'PW'));
});

test('learnDispersion keeps longitudinal error insensitive to pure lateral misses', () => {
  const planned = 150;
  const makeShot = (index: number, east: number, north: number): Shot => ({
    tStart: index * 1_000,
    club: '7i',
    base_m: planned,
    playsLike_m: planned,
    carry_m: planned + north,
    pin: PIN,
    land: offsetPoint(east, north),
    heading_deg: 0,
  });

  const lateralValues = [30, -30, 25, -25, 20, -20];
  const lateralShots = lateralValues.map((east, index) => makeShot(index, east, 0));
  const longValues = [-10, -12, -8, -11, -9, -10];
  const longShots = longValues.map((north, index) => makeShot(100 + index, 0, north));
  const wideLateralValues = [45, -45, 35, -35, 30, -30];
  const wideLateralShots = wideLateralValues.map((east, index) => makeShot(200 + index, east, 0));

  const lateralOnly = learnDispersion(lateralShots, 6)['7i'];
  assert.ok(lateralOnly, 'expected dispersion for lateral-only samples');
  assert.equal(lateralOnly.n, lateralShots.length);
  assert.ok(lateralOnly.sigma_long_m <= 1e-6, 'lateral-only samples should not add longitudinal variance');
  assert.ok(Math.abs(lateralOnly.sigma_lat_m - 25.33) < 0.5);

  const longOnly = learnDispersion(longShots, 6)['7i'];
  assert.ok(longOnly, 'expected dispersion for longitudinal-only samples');
  assert.equal(longOnly.n, longShots.length);
  assert.ok(Math.abs(longOnly.sigma_long_m - 1.29) < 0.1);
  assert.ok(longOnly.sigma_lat_m <= 1e-6, 'longitudinal-only samples should not add lateral variance');

  const mixedMild = learnDispersion([...longShots, ...lateralShots], 6)['7i'];
  const mixedWide = learnDispersion([...longShots, ...wideLateralShots], 6)['7i'];
  assert.ok(mixedMild && mixedWide, 'expected dispersion for mixed samples');
  assert.ok(Math.abs(mixedMild.sigma_long_m - mixedWide.sigma_long_m) < 1e-6);
  assert.ok(mixedWide.sigma_lat_m > mixedMild.sigma_lat_m, 'larger lateral misses should widen sigma_lat');
});
