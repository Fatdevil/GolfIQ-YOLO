import assert from 'node:assert/strict';
import test from 'node:test';

import { fmtMeters, fmtPct, nz } from '../../../shared/caddie/format';

test('fmtMeters rounds to nearest meter', () => {
  assert.equal(fmtMeters(149.4), '149 m');
  assert.equal(fmtMeters(149.5), '150 m');
  assert.equal(fmtMeters(-2.6), '-3 m');
});

test('fmtPct rounds to nearest percent', () => {
  assert.equal(fmtPct(0.0), '0%');
  assert.equal(fmtPct(0.723), '72%');
  assert.equal(fmtPct(0.726), '73%');
  assert.equal(fmtPct(1.2), '120%');
});

test('nz returns finite value or default', () => {
  assert.equal(nz(0), 0);
  assert.equal(nz(42), 42);
  assert.equal(nz(undefined), 0);
  assert.equal(nz(undefined, 5), 5);
  // @ts-expect-error ensure null is treated as default fallback
  assert.equal(nz(null, 7), 7);
  assert.equal(nz(Number.NaN, 3), 3);
  assert.equal(nz(Number.POSITIVE_INFINITY, 4), 4);
});
