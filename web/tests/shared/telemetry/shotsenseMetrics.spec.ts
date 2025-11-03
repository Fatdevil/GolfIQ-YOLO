import assert from 'node:assert/strict';
import test from 'node:test';

import { __TESTING__, appendHoleAccuracy, computeConfusion } from '../../../../shared/telemetry/shotsenseMetrics';

test('computeConfusion matches auto detections to confirmed shots', () => {
  const auto = [{ ts: 1_000 }, { ts: 5_000 }];
  const confirmed = [
    { ts: 1_050, source: 'manual' },
    { ts: 5_010, source: 'manual' },
  ];
  assert.deepEqual(computeConfusion(auto, confirmed), { tp: 2, fp: 0, fn: 0 });
});

test('appendHoleAccuracy stores perfect detection metrics', () => {
  __TESTING__.clear();
  appendHoleAccuracy(9, { holeIndex: 2, timestamp: 2_500, tp: 3, fp: 0, fn: 0 });
  assert.equal(__TESTING__._rows.length, 1);
  assert.deepEqual(__TESTING__._rows[0], {
    holeId: 9,
    holeIndex: 2,
    timestamp: 2_500,
    tp: 3,
    fp: 0,
    fn: 0,
  });
});

test('appendHoleAccuracy tracks false positives and negatives', () => {
  __TESTING__.clear();
  appendHoleAccuracy(4, { timestamp: 3_000, tp: 0, fp: 1, fn: 0 });
  appendHoleAccuracy(4, { timestamp: 3_500, tp: 0, fp: 0, fn: 2 });
  assert.equal(__TESTING__._rows.length, 2);
  assert.equal(__TESTING__._rows[0]?.fp, 1);
  assert.equal(__TESTING__._rows[1]?.fn, 2);
});
