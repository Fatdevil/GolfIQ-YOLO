import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatAccuracyMeters,
  formatDop,
  formatDualFrequency,
  formatSatelliteCount,
  gnssAccuracyLevel,
} from '../../../shared/arhud/location';

test('gnss accuracy formatting and thresholds', () => {
  assert.equal(formatAccuracyMeters(1.55), '±1.6 m');
  assert.equal(formatAccuracyMeters(12.3), '±12 m');
  assert.equal(formatAccuracyMeters(undefined), '±— m');

  assert.equal(gnssAccuracyLevel(1.9), 'good');
  assert.equal(gnssAccuracyLevel(3.4), 'ok');
  assert.equal(gnssAccuracyLevel(6.2), 'poor');
  assert.equal(gnssAccuracyLevel(Number.POSITIVE_INFINITY), 'unknown');
});

test('satellite, dop, and dual-frequency formatting fallbacks', () => {
  assert.equal(formatSatelliteCount(18.2), 'sats: 18');
  assert.equal(formatSatelliteCount(0), 'sats: —');
  assert.equal(formatSatelliteCount(null), 'sats: —');

  assert.equal(formatDop(0.93), 'DOP: 0.93');
  assert.equal(formatDop(3.44), 'DOP: 3.4');
  assert.equal(formatDop(12.2), 'DOP: 12');
  assert.equal(formatDop(undefined), 'DOP: —');

  assert.equal(formatDualFrequency(true), 'L1/L5 ✓');
  assert.equal(formatDualFrequency(false), 'L1/L5 –');
  assert.equal(formatDualFrequency(null), 'L1/L5 –');
});
